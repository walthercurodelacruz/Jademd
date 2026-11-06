// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { createVaultExtensions } from '../editor/vaultExtensions';
import { SourceDocument } from '../editor/sourceDocument';
import { settleRendering } from '../utils/advancedRendering';
import { exportNoteHtml } from '../utils/exportDocument';
vi.mock('../api/client', () => ({ api: { resolveEntry: vi.fn(), readNote: vi.fn() } }));

const editors: Editor[] = [];
function open(raw: string) {
  const editor = new Editor({ element: document.createElement('div'), extensions: createVaultExtensions('Notas/Test.md'), content: raw }); editors.push(editor);
  const source = new SourceDocument(editor, raw); source.prepare(); return { editor, source };
}
afterEach(() => { editors.splice(0).forEach((editor) => editor.destroy()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('Advanced Markdown and source preservation', () => {
  it('renders inline and block equations while preserving BOM, CRLF, footnotes and untouched Markdown', async () => {
    const raw = '\uFEFFTexto $x^2 + 1$ y nota[^largo].\r\n\r\n$$\r\n\\frac{a}{b}\r\n$$\r\n\r\n[^largo]: Una nota con $y$.\r\n    Segunda línea.\r\n';
    const { editor, source } = open(raw); await settleRendering(editor.view.dom);
    expect(editor.view.dom.querySelectorAll('.katex')).toHaveLength(3);
    expect(editor.view.dom.querySelector('[data-footnote-target]')?.textContent).toBe('1');
    expect(editor.view.dom.querySelector('[data-footnote-definition]')?.textContent).toContain('Segunda línea.');
    expect(source.serialize()).toBe(raw);
    editor.commands.insertContentAt(1, 'Editado ');
    expect(source.serialize()).toBe(raw.replace('Texto ', 'Editado Texto '));
    editor.commands.undo(); expect(source.serialize()).toBe(raw);
  });
  it('keeps code, escaped delimiters and currency literal', async () => {
    const raw = '`$x$` y \\$y\\$ cuesta $5 y $10.\n\n```text\n$$not math$$\n[^nota]\n```\n';
    const { editor, source } = open(raw); await settleRendering(editor.view.dom);
    expect(editor.view.dom.querySelector('.katex')).toBeNull();
    expect(source.serialize()).toBe(raw);
  });
  it('shows invalid formulas without replacing their source or allowing trusted HTML commands', async () => {
    const raw = '$\\frac{$ y $\\href{javascript:alert(1)}{bad}$\n';
    const { editor, source } = open(raw); await settleRendering(editor.view.dom);
    expect(editor.view.dom.querySelector('[role="alert"]')).not.toBeNull();
    expect(editor.view.dom.querySelector('a[href^="javascript:"], script, [onerror]')).toBeNull();
    expect(source.serialize()).toBe(raw);
  });
  it('edits an advanced block and supports undo while leaving surrounding text unchanged', async () => {
    const raw = 'Before.\n\n$$x$$\n\nAfter.\n'; const { editor, source } = open(raw);
    editor.view.dom.querySelector<HTMLButtonElement>('[data-advanced-kind="mathBlock"] button')!.click();
    const input = editor.view.dom.querySelector<HTMLTextAreaElement>('[aria-label="Código del bloque"]')!;
    input.value = '$$y^2$$';
    Array.from(editor.view.dom.querySelectorAll('button')).find((button) => button.textContent === 'Aplicar')!.click();
    expect(source.serialize()).toBe(raw.replace('$$x$$', () => '$$y^2$$'));
    editor.commands.undo(); expect(source.serialize()).toBe(raw);
  });
  it('rejects document-level Mermaid configuration without modifying the diagram', async () => {
    const raw = '```mermaid\n%%{init: {"securityLevel":"loose"}}%%\ngraph TD\nA-->B\n```\n';
    const { editor, source } = open(raw); await settleRendering(editor.view.dom);
    expect(editor.view.dom.querySelector('[role="alert"]')?.textContent).toContain('configuración');
    expect(source.serialize()).toBe(raw);
  });
  it('renders a real Mermaid graph into an isolated SVG image', async () => {
    Object.defineProperty(SVGElement.prototype, 'getBBox', { configurable: true, value: () => ({ x: 0, y: 0, width: 100, height: 30 }) });
    Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', { configurable: true, value: () => 80 });
    const raw = '```mermaid\nflowchart TD\n  A[Inicio] --> B[Fin]\n```\n';
    const { editor, source } = open(raw); await settleRendering(editor.view.dom);
    const image = editor.view.dom.querySelector<HTMLImageElement>('img.mermaid-diagram');
    expect(image, editor.view.dom.textContent || '').not.toBeNull();
    expect(image?.src).toMatch(/^data:image\/svg\+xml/);
    expect(editor.view.dom.querySelector('svg,script')).toBeNull();
    expect(source.serialize()).toBe(raw);
  });
});
describe('Document export', () => {
  it('exports MathML, navigable footnotes and inline local images without changing the note', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob([new Uint8Array([1,2,3])], { type: 'image/png' }) })));
    const raw = '---\ncustom: keep\n---\n# Nota\n\n$x^2$ y referencia[^n].\n\n![Foto](foto.png)\n\n[^n]: Texto de nota.\n';
    const html = await exportNoteHtml(raw, 'Notas/Test.md');
    const result = new DOMParser().parseFromString(html, 'text/html');
    expect(result.querySelector('math')).not.toBeNull();
    expect(result.querySelector('img')?.src).toMatch(/^data:image\/png;base64,/);
    const anchor = result.querySelector('sup a')!;
    expect(result.getElementById(anchor.getAttribute('href')!.slice(1))?.textContent).toContain('Texto de nota.');
    expect(result.querySelector('button, textarea, script, [contenteditable]')).toBeNull();
    expect(result.querySelector('meta[http-equiv="Content-Security-Policy"]')).not.toBeNull();
    expect(raw).toContain('custom: keep');
  });
  it('does not silently export an image that could not be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    await expect(exportNoteHtml('![Missing](missing.png)\n', 'A.md')).rejects.toThrow('imagen');
    expect(document.querySelector('[style*="-100000px"]')).toBeNull();
  });
});

it('publishes only selected notes and leaves private embeds unfetched', async () => {
  const { buildPublication } = await import('../utils/publication');
  const { api } = await import('../api/client');
  vi.mocked(api.readNote).mockReset();
  vi.mocked(api.resolveEntry).mockReset();
  vi.mocked(api.readNote).mockImplementation(async (path) => {
    if (path === 'A.md') return '# Public A\n\n[[B]] ![[Private]] ![[Private.png]]\n';
    if (path === 'B.md') return '# Public B';
    throw new Error('A private note was read');
  });
  vi.mocked(api.resolveEntry).mockResolvedValue('B.md');
  const assetFetch = vi.fn();
  vi.stubGlobal('fetch', assetFetch);
  const html = await buildPublication(['A.md', 'B.md'], false, () => {});
  expect(vi.mocked(api.readNote).mock.calls).toEqual([['A.md'], ['B.md']]);
  expect(assetFetch).not.toHaveBeenCalled();
  const document = new DOMParser().parseFromString(html, 'text/html');
  expect(document.querySelectorAll('article')).toHaveLength(2);
  expect(document.querySelector('article a[href="#nota-2"]')?.textContent).toBe('B');
  expect(document.querySelector('img')).toBeNull();
});
