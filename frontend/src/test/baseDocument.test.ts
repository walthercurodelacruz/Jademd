import { expect, it } from 'vitest';
import { baseRows, parseBase } from '../utils/baseDocument';
import type { NoteMetadata } from '../types';

const note = (path: string, price: number, tags = ['book/fiction']): NoteMetadata => ({
  path, title: path, tags, frontmatter: { price, status: 'open' },
  outlinks: [], backlinks: [], headings: [], word_count: 0, character_count: 0,
});

it('combines global and view filters, computes chained formulas and sorts before limiting', () => {
  const base = parseBase(`
filters:
  and:
    - 'file.hasTag("book")'
    - 'file.inFolder("Books")'
formulas:
  total: 'price * 2 + 1'
  amount: '(formula.total - 1) / 2'
views:
  - type: table
    name: Books
    order: [file.name, formula.total]
    filters:
      or:
        - 'note.status == "done"'
        - 'formula.amount > 1'
    sort:
      - property: formula.total
        direction: DESC
    limit: 1
  - type: list
    order: [file.path]
`);
  const notes = [note('Books/A.md', 2), note('Books/B.md', 5), note('Books/C.md', 1), note('Other/D.md', 9)];
  const { rows, count } = baseRows(base, base.views[0], notes);
  expect(count).toBe(2);
  expect(rows.map((row) => row.cells)).toEqual([['B', 11]]);
  expect(baseRows(base, base.views[1], notes).count).toBe(3);
});

it('rejects unsupported filters and detects cyclic formulas without executing expressions', () => {
  expect(() => parseBase('filters: alert("bad")\nviews: [{type: table}]')).toThrow();
  expect(() => parseBase('views: [{type: table, groupBy: {property: status}}]')).toThrow('groupBy');
  const base = parseBase('formulas: { x: "formula.y", y: "formula.x" }\nviews: [{type: table, order: [formula.x]}]');
  expect(() => baseRows(base, base.views[0], [note('A.md', 1)])).toThrow('circular');
});
