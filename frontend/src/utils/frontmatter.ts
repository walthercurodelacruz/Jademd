import { isMap, isNode, parseDocument } from 'yaml';

export type PropertyValue = null | boolean | number | string | PropertyValue[] | { [key: string]: PropertyValue };
export interface FrontmatterResult {
  frontmatter: Record<string, PropertyValue> | null;
  frontmatterHeader: string;
  markdownBody: string;
  yamlSource: string;
  yamlStart: number;
  bodyLine: number;
  error: string | null;
}

export function parseFrontmatter(content: string): FrontmatterResult {
  const empty = { frontmatter: null, frontmatterHeader: '', markdownBody: content,
    yamlSource: '', yamlStart: 0, bodyLine: 1, error: null };
  const opening = content.match(/^[\uFEFF \t\r\n]*---[ \t]*\r?\n/);
  if (!opening) return empty;
  const remainder = content.slice(opening[0].length);
  const closing = /^(?:---)[ \t]*(?:\r?\n|$)/m.exec(remainder);
  if (!closing) return { ...empty, error: 'El bloque YAML no tiene delimitador de cierre.' };
  const yamlStart = opening[0].length;
  const yamlSource = remainder.slice(0, closing.index);
  const end = yamlStart + closing.index + closing[0].length;
  const header = content.slice(0, end);
  const result = { ...empty, frontmatterHeader: header, markdownBody: content.slice(end),
    yamlStart, yamlSource, bodyLine: (header.match(/\n/g) || []).length + 1 };
  try {
    const document = parseDocument(yamlSource, { uniqueKeys: true, schema: 'core' });
    if (document.errors.length) throw new Error(document.errors[0].message);
    if (document.contents !== null && !isMap(document.contents)) throw new Error('Las propiedades deben formar un mapa YAML.');
    const data = document.toJS({ maxAliasCount: 100 }) as Record<string, PropertyValue> | null;
    // Reject values that cannot be represented by the API's JSON contract (e.g. cycles, Infinity).
    const json = JSON.stringify(data, (_key, value) => {
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Número YAML no finito.');
      return value;
    });
    return { ...result, frontmatter: json === 'null' ? {} : JSON.parse(json) };
  } catch (error) {
    return { ...result, error: `Propiedades YAML inválidas: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** Replace only the selected value's source range; leave comments, other properties and body byte-for-byte intact. */
export function updateProperty(content: string, key: string, value: PropertyValue): string {
  if (!key.trim() || /[\r\n]/.test(key)) throw new Error('Nombre de propiedad inválido.');
  const parsed = parseFrontmatter(content);
  if (parsed.error) throw new Error(parsed.error);
  const serialized = JSON.stringify(value, (_key, item) => {
    if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('El número debe ser finito.');
    return item;
  });
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  if (!parsed.frontmatterHeader) {
    const bom = content.startsWith('\uFEFF') ? '\uFEFF' : '';
    return `${bom}---${newline}${JSON.stringify(key)}: ${serialized}${newline}---${newline}${content.slice(bom.length)}`;
  }
  const doc = parseDocument(parsed.yamlSource, { keepSourceTokens: true, schema: 'core' });
  const node = doc.get(key, true);
  let yaml: string;
  if (isNode(node) && node.range) {
    const [start, end] = node.range;
    const trailingNewline = /\r?\n$/.test(parsed.yamlSource.slice(start, end)) ? newline : '';
    const before = start === end && start > 0 && !/\s/.test(parsed.yamlSource[start - 1]) ? ' ' : '';
    const after = start === end && parsed.yamlSource[end] === '#' ? ' ' : '';
    yaml = parsed.yamlSource.slice(0, start) + before + serialized + after + trailingNewline + parsed.yamlSource.slice(end);
  } else if (!doc.has(key)) {
    if (isMap(doc.contents) && doc.contents.flow && doc.contents.range) {
      const closing = doc.contents.range[1] - 1;
      yaml = parsed.yamlSource.slice(0, closing) + (doc.contents.items.length ? ', ' : '') + `${JSON.stringify(key)}: ${serialized}` + parsed.yamlSource.slice(closing);
    } else yaml = parsed.yamlSource + (parsed.yamlSource && !parsed.yamlSource.endsWith('\n') ? newline : '') + `${JSON.stringify(key)}: ${serialized}${newline}`;
  } else {
    throw new Error('Edita esta propiedad en código fuente para conservar su estructura.');
  }
  const next = content.slice(0, parsed.yamlStart) + yaml + content.slice(parsed.yamlStart + parsed.yamlSource.length);
  const check = parseFrontmatter(next);
  if (check.error || JSON.stringify(check.frontmatter?.[key]) !== JSON.stringify(value)) throw new Error('No se pudo conservar el valor de la propiedad.');
  return next;
}
