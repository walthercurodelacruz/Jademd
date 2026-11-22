import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { noteMetadata } from '../utils/noteMetadata';
import { parseFrontmatter, updateProperty } from '../utils/frontmatter';

const read = (name: string) => readFileSync(resolve(process.cwd(), '../tests/fixtures/compatibility', name), 'utf8');
const cases = JSON.parse(read('metadata.json')) as { file: string; path: string; title: string; tags: string[]; outlinks: string[]; headings: unknown[]; properties: Record<string, unknown> }[];
describe('Shared metadata fixtures', () => {
  for (const item of cases) it(item.file, () => {
    const raw = read(item.file); const meta = noteMetadata(item.path, raw, []);
    expect(meta.title).toBe(item.title); expect(meta.tags).toEqual(item.tags);
    expect(meta.outlinks).toEqual(item.outlinks); expect(meta.headings).toEqual(item.headings);
    for (const [key, value] of Object.entries(item.properties)) expect(meta.frontmatter?.[key]).toEqual(value);
    expect(parseFrontmatter(raw).frontmatterHeader + parseFrontmatter(raw).markdownBody).toBe(raw);
  });
  it('does not swallow a horizontal rule or an invalid closing delimiter', () => {
    const raw = '---\na: 1\n---suffix\nBody';
    expect(parseFrontmatter(raw).markdownBody).toBe(raw);
    expect(() => updateProperty(raw, 'a', 2)).toThrow();
  });
  it('handles lists, block scalars, nulls and empty mappings without losing unrelated text', () => {
    for (const source of ['a:\nb: \"keep\" # comment\n', 'a: # empty\nb: \"keep\" # comment\n', 'a: [uno, dos]\nb: "keep" # comment\n', 'a:\n  - uno\n  - dos\nb: "keep" # comment\n', 'a: |\n  hola\n  mundo\nb: "keep" # comment\n', 'a: null\nb: "keep" # comment\n']) {
      const raw = `---\n${source}---\nBody`;
      const saved = updateProperty(raw, 'a', ['nuevo', 'dos']);
      expect(parseFrontmatter(saved).frontmatter?.a).toEqual(['nuevo', 'dos']);
      expect(saved).toContain('b: "keep" # comment\n---\nBody');
    }
  });
  it('rejects duplicate keys, non-mapping YAML and cyclic aliases', () => {
    for (const yaml of ['a: 1\na: 2', '[one, two]', 'a: &self [*self]']) {
      const raw = `---\n${yaml}\n---\nBody`;
      expect(parseFrontmatter(raw).error).toBeTruthy();
      expect(() => updateProperty(raw, 'a', 'change')).toThrow();
    }
  });
  it('adds properties to an existing flow map without rewriting its existing keys', () => {
    const source = '---\n{a: 1, b: "keep"} # comment\n---\nBody';
    const next = updateProperty(source, 'new', ['one', 'two']);
    expect(next).toBe('---\n{a: 1, b: "keep", "new": ["one","two"]} # comment\n---\nBody');
  });
  it('ignores hex color codes, HTML highlight marks and pure numeric tokens when extracting tags', () => {
    const raw = 'Texto con <mark style="background: #BBFABBA6;">verde</mark>, #ABF7F7A6, #FFB86CA6, #10b981, #FFFFFF, #1234 y etiquetas reales #excalidraw #seguridad/linux #web3 #h1.';
    const meta = noteMetadata('Notas/Colores.md', raw, []);
    expect(meta.tags).toEqual(['excalidraw', 'seguridad/linux', 'web3', 'h1']);
  });
});
