import { parseDocument } from 'yaml';
import type { NoteMetadata } from '../types';
import type { PropertyValue } from './frontmatter';

type Resolve = (property: string) => PropertyValue;
type Expression = (resolve: Resolve) => PropertyValue;
type Filter = (resolve: Resolve) => boolean;
type Sort = { property: string; direction: 'ASC' | 'DESC' };
interface BaseView {
  type: 'table' | 'list';
  name: string;
  order: string[];
  limit: number;
  filter: Filter;
  sort: Sort[];
}
interface Base {
  filter: Filter;
  formulas: Map<string, Expression>;
  labels: Map<string, string>;
  views: BaseView[];
}

const fileFields = new Set(['file.name', 'file.basename', 'file.path', 'file.folder', 'file.ext', 'file.tags']);
const identifier = /^[\p{L}_][\p{L}\p{N}_]*(?:\.[\p{L}_][\p{L}\p{N}_]*)?$/u;
function field(property: unknown): string {
  if (typeof property !== 'string' || !identifier.test(property) ||
      (property.includes('.') && !fileFields.has(property) && !/^(note|formula)\./.test(property))) {
    throw new Error(`Propiedad de Bases no admitida: ${String(property)}`);
  }
  return property;
}

function expression(source: unknown): Expression {
  if (typeof source !== 'string' || source.length > 1000) throw new Error('Expresión de Bases inválida');
  const tokens = source.trim().match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\d+(?:\.\d+)?|[\p{L}_][\p{L}\p{N}_]*(?:\.[\p{L}_][\p{L}\p{N}_]*)?|==|!=|>=|<=|[()+*/<>!-]|\S/gu) || [];
  if (tokens.length > 128) throw new Error('Expresión de Bases demasiado larga');
  let cursor = 0;
  function primary(): Expression {
    const token = tokens[cursor++];
    if (token === '(') {
      const inner = parse(0);
      if (tokens[cursor++] !== ')') throw new Error('Falta cerrar un paréntesis');
      return inner;
    }
    if (token === '-' || token === '!') {
      const inner = primary();
      return (resolve) => {
        const value = inner(resolve);
        return token === '!' ? !value : typeof value === 'number' ? -value : null;
      };
    }
    if (token === 'file.hasTag' || token === 'file.inFolder') {
      if (tokens[cursor++] !== '(') throw new Error(`Falta un argumento de ${token}`);
      const arg = tokens[cursor++];
      if (!arg?.startsWith('"') && !arg?.startsWith("'")) throw new Error(`El argumento de ${token} debe ser texto`);
      const value = readString(arg);
      if (tokens[cursor++] !== ')') throw new Error(`Argumentos de ${token} no admitidos`);
      return (resolve) => {
        if (token === 'file.inFolder') {
          const folder = String(resolve('file.folder'));
          return folder === value || folder.startsWith(`${value}/`);
        }
        const tags = resolve('file.tags') as string[];
        const tag = value.replace(/^#/, '');
        return tags.some((item) => item === tag || item.startsWith(`${tag}/`));
      };
    }
    if (token?.startsWith('"') || token?.startsWith("'")) {
      const value = readString(token);
      return () => value;
    }
    if (token && /^\d/.test(token)) return () => Number(token);
    if (token === 'true' || token === 'false') return () => token === 'true';
    if (token === 'null') return () => null;
    const property = field(token);
    return (resolve) => resolve(property);
  }
  function parse(minimum: number): Expression {
    let left = primary();
    while (cursor < tokens.length) {
      const operator = tokens[cursor];
      const priority = ['==', '!=', '>', '<', '>=', '<='].includes(operator) ? 1
        : ['+', '-'].includes(operator) ? 2 : ['*', '/'].includes(operator) ? 3 : 0;
      if (priority <= minimum) break;
      cursor++;
      const previous = left;
      const right = parse(priority);
      left = (resolve) => apply(operator, previous(resolve), right(resolve));
    }
    return left;
  }
  const result = parse(0);
  if (cursor !== tokens.length) throw new Error(`Operador o función de Bases no admitidos: ${tokens[cursor]}`);
  return result;
}

function readString(token: string): string {
  if (token.startsWith('"')) return JSON.parse(token);
  if (!token.endsWith("'") || token.length < 2) throw new Error('Cadena sin cerrar');
  return token.slice(1, -1).replace(/\\(['\\])/g, '$1');
}

function apply(operator: string, left: PropertyValue, right: PropertyValue): PropertyValue {
  if (operator === '==') return left === right;
  if (operator === '!=') return left !== right;
  if (operator === '+' && typeof left === 'string' && typeof right === 'string') return left + right;
  if (typeof left !== 'number' || typeof right !== 'number') return null;
  switch (operator) {
    case '>': return left > right;
    case '<': return left < right;
    case '>=': return left >= right;
    case '<=': return left <= right;
    case '+': return left + right;
    case '-': return left - right;
    case '*': return left * right;
    case '/': return right === 0 ? null : left / right;
    default: return null;
  }
}

function mapping(value: unknown, allowed?: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Se esperaba un mapa YAML');
  if (allowed) {
    const unknown = Object.keys(value).find((key) => !allowed.includes(key));
    if (unknown) throw new Error(`Opción de Bases no admitida: ${unknown}`);
  }
  return value as Record<string, unknown>;
}

function filter(value: unknown, depth = 0): Filter {
  if (value === undefined) return () => true;
  if (typeof value === 'string') {
    const evaluate = expression(value);
    return (resolve) => Boolean(evaluate(resolve));
  }
  if (depth >= 12) throw new Error('Demasiados niveles de filtros');
  const entries = Object.entries(mapping(value, ['and', 'or', 'not']));
  if (entries.length !== 1 || !Array.isArray(entries[0][1])) throw new Error('Usa una lista dentro de and, or o not');
  const [operator, children] = entries[0];
  const tests = (children as unknown[]).map((child) => filter(child, depth + 1));
  if (operator === 'and') return (resolve) => tests.every((test) => test(resolve));
  if (operator === 'or') return (resolve) => tests.some((test) => test(resolve));
  return (resolve) => tests.every((test) => !test(resolve));
}

export function parseBase(source: string): Base {
  if (source.length > 64_000) throw new Error('La definición de la base supera 64 000 caracteres');
  const document = parseDocument(source, { uniqueKeys: true });
  if (document.errors.length || document.warnings.length) throw new Error((document.errors[0] || document.warnings[0]).message);
  const data = mapping(document.toJS({ maxAliasCount: 0 }), ['filters', 'formulas', 'properties', 'views']);
  const formulaEntries = Object.entries(mapping(data.formulas ?? {}));
  if (formulaEntries.length > 50) throw new Error('Se admiten hasta 50 fórmulas');
  const formulas = new Map(formulaEntries.map(([key, value]) => [field(`formula.${key}`), expression(value)]));
  const labels = new Map(Object.entries(mapping(data.properties ?? {})).map(([key, value]) => {
    const { displayName } = mapping(value, ['displayName']);
    if (typeof displayName !== 'string') throw new Error('displayName debe ser texto');
    return [field(key), displayName];
  }));
  if (!Array.isArray(data.views) || !data.views.length) throw new Error('Define al menos una vista');
  const views: BaseView[] = data.views.map((value) => {
    const view = mapping(value, ['type', 'name', 'order', 'limit', 'filters', 'sort']);
    if (view.type !== 'table' && view.type !== 'list') throw new Error('Se admiten vistas table y list');
    const order = view.order ?? ['file.name'];
    if (!Array.isArray(order) || !order.length) throw new Error('order debe contener propiedades');
    const limit = view.limit ?? 200;
    if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 0) throw new Error('limit debe ser un entero no negativo');
    const sort = view.sort ?? [];
    if (!Array.isArray(sort)) throw new Error('sort debe ser una lista');
    return {
      type: view.type, name: String(view.name ?? 'Vista'), order: [...new Set(order.map(field))],
      limit: Math.min(limit, 1000), filter: filter(view.filters),
      sort: sort.map((item): Sort => {
        const { property, direction } = mapping(item, ['property', 'direction']);
        if (direction !== 'ASC' && direction !== 'DESC') throw new Error('Orden inválido. Usa ASC o DESC');
        return { property: field(property), direction };
      }),
    };
  });
  return { filter: filter(data.filters), formulas, labels, views };
}

export function baseRows(base: Base, view: BaseView, notes: NoteMetadata[]) {
  const rows = [];
  for (const note of notes) {
    const values = new Map<string, PropertyValue>();
    const visiting = new Set<string>();
    const filename = note.path.split('/').at(-1) || note.path;
    const name = filename.replace(/\.[^.]+$/, '');
    const file = new Map<string, PropertyValue>([
      ['file.name', name], ['file.basename', name], ['file.path', note.path],
      ['file.folder', note.path.slice(0, -filename.length).replace(/\/$/, '')],
      ['file.ext', filename.slice(name.length + 1)], ['file.tags', note.tags.map((tag) => tag.replace(/^#/, ''))],
    ]);
    const resolve: Resolve = (property) => {
      if (values.has(property)) return values.get(property)!;
      if (file.has(property)) return file.get(property)!;
      if (!property.startsWith('formula.')) {
        const key = property.replace(/^note\./, '');
        return note.frontmatter && Object.hasOwn(note.frontmatter, key) ? note.frontmatter[key] : null;
      }
      const calculate = base.formulas.get(property);
      if (!calculate) throw new Error(`Fórmula desconocida: ${property}`);
      if (visiting.has(property)) throw new Error(`Referencia circular en ${property}`);
      visiting.add(property);
      const result = calculate(resolve);
      visiting.delete(property);
      const value = typeof result === 'number' && !Number.isFinite(result) ? null : result;
      values.set(property, value);
      return value;
    };
    if (!base.filter(resolve) || !view.filter(resolve)) continue;
    rows.push({ note, cells: view.order.map(resolve), sortValues: view.sort.map(({ property }) => resolve(property)) });
  }
  rows.sort((a, b) => {
    for (const [index, sort] of view.sort.entries()) {
      const left = a.sortValues[index];
      const right = b.sortValues[index];
      if (left === right) continue;
      if (left === null) return 1;
      if (right === null) return -1;
      const comparison = typeof left === 'number' && typeof right === 'number'
        ? left - right : String(left).localeCompare(String(right), undefined, { numeric: true });
      if (comparison) return sort.direction === 'DESC' ? -comparison : comparison;
    }
    return a.note.path.localeCompare(b.note.path);
  });
  return { rows: rows.slice(0, view.limit), count: rows.length };
}
