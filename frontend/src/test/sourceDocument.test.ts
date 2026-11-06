// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createVaultExtensions } from '../editor/vaultExtensions';
import { SourceDocument } from '../editor/sourceDocument';
import { parseFrontmatter, updateProperty } from '../utils/frontmatter';

vi.mock('../api/client', () => ({ api: { resolveEntry: vi.fn(async () => 'Embedded.md'), readNote: vi.fn(async () => '# Sección\nContenido embebido.\n\n## Hijo\nMás.\n\n# Fuera\nNo incluir.\n') } }));

const fixture = (name: string) => readFileSync(resolve(process.cwd(), '../tests/fixtures/compatibility', name), 'utf8');
const editors: Editor[] = [];
function open(body: string) {
  const editor = new Editor({ element: document.createElement('div'), extensions: createVaultExtensions('Notas/Test.md'), content: body });
  editors.push(editor);
  const source = new SourceDocument(editor, body); source.prepare();
  return { editor, source };
}
function editText(editor: Editor, old: string, next: string) {
  let position = -1;
  editor.state.doc.descendants((node, pos) => { if (node.isText && node.text?.includes(old)) position = pos + node.text.indexOf(old); });
  if (position < 0) throw new Error(`Texto no editable: ${old}`);
  editor.commands.insertContentAt({ from: position, to: position + old.length }, next);
}
afterEach(() => { editors.splice(0).forEach((editor) => editor.destroy()); });

describe('Real editor document compatibility', () => {
  it('edits literal greater-than signs in plain paragraphs and preserves untouched Markdown', () => {
    const raw = 'h —> Izquierda\n\nj —> Abajo\n\n<div data-example=">">HTML original</div>\n';
    const { editor, source } = open(raw);
    expect(editor.state.doc.child(0).type.name).toBe('paragraph');
    expect(editor.state.doc.child(1).type.name).toBe('paragraph');
    expect(editor.state.doc.child(2).type.name).toBe('sourceBlock');
    expect(source.serialize()).toBe(raw);

    editText(editor, 'Izquierda', 'Hacia la izquierda');
    const saved = source.serialize();
    expect(saved.split('\n\n').slice(1)).toEqual(raw.split('\n\n').slice(1));
    const reopened = open(saved);
    expect(reopened.editor.state.doc.child(0).textContent).toBe('h —> Hacia la izquierda');
    expect(reopened.source.serialize()).toBe(saved);
  });
  it.each(['preserve.md', 'typed-crlf.md', 'code-and-comments.md'])('opens and serializes %s without changing any source', (name) => {
    const raw = fixture(name); const parsed = parseFrontmatter(raw);
    const { source } = open(parsed.markdownBody);
    expect(parsed.frontmatterHeader + source.serialize()).toBe(raw);
  });
  it('edits one paragraph, preserving all unrelated Markdown, YAML and unknown syntax', () => {
    const raw = fixture('preserve.md'); const parsed = parseFrontmatter(raw);
    const { editor, source } = open(parsed.markdownBody);
    editText(editor, 'Último párrafo editable.', 'Párrafo actualizado.');
    const saved = parsed.frontmatterHeader + source.serialize();
    expect(saved).toBe(raw.replace('Último párrafo editable.', 'Párrafo actualizado.'));
    const reopened = open(parseFrontmatter(saved).markdownBody);
    expect(parseFrontmatter(saved).frontmatterHeader + reopened.source.serialize()).toBe(saved);
    editor.commands.undo();
    expect(parsed.frontmatterHeader + source.serialize()).toBe(raw);
  });
  it('keeps wikilinks, aliases, note embeds and image dimensions as original inline nodes', () => {
    const original = 'Texto [[Destino#Título|alias]] ![[Nota#^id]] ![[foto.png|300x200]] final.\n';
    const { editor, source } = open(original);
    const refs: string[] = [];
    editor.state.doc.descendants((node) => { if (node.type.name === 'vaultReference') refs.push(node.attrs.raw); });
    expect(refs).toEqual(['[[Destino#Título|alias]]', '![[Nota#^id]]', '![[foto.png|300x200]]']);
    editText(editor, 'final.', 'editado.');
    expect(source.serialize()).toBe(original.replace('final.', 'editado.'));
    expect(editor.view.dom.querySelector('img.obsidian-image')?.getAttribute('width')).toBe('300');
  });
  it('serializes inserted images with safe destinations and renders them after reopening', () => {
    const { editor, source } = open('# Imágenes\n');
    const filename = 'Pasted image 20261105103845-8242d1e6-68bc-45a7-b3ce-bd29c4a62453.png';
    editor.commands.insertContentAt(editor.state.doc.content.size, { type: 'image', attrs: { src: filename, alt: filename } });
    const saved = source.serialize();
    expect(saved).toContain(`](${filename.replaceAll(' ', '%20')})`);
    const reopened = open(saved);
    const image = reopened.editor.view.dom.querySelector('img.obsidian-image');
    expect(image).not.toBeNull();
    expect(new URL(image!.getAttribute('src')!, 'http://localhost').searchParams.get('path')).toBe(filename);
    expect(reopened.editor.view.dom.textContent).not.toContain('Editar este formato en fuente');
    expect(reopened.source.serialize()).toBe(saved);
  });
  it.each([
    ['Assets/foto (1).png', 'Assets/foto%20%281%29.png'],
    ['Assets/foto%20uno.png', 'Assets/foto%20uno.png'],
    ['https://example.com/image.png?width=200&height=100', 'https://example.com/image.png?width=200&height=100'],
  ])('keeps image destination %s usable after save and reopen', (filename, destination) => {
    const { editor, source } = open('Texto.\n');
    editor.commands.insertContentAt(editor.state.doc.content.size, { type: 'image', attrs: { src: filename, alt: 'Imagen', title: 'Una "imagen"' } });
    const saved = source.serialize();
    expect(saved).toContain(`](${destination} "Una \\"imagen\\"")`);
    const reopened = open(saved);
    expect(reopened.editor.view.dom.querySelector('img.obsidian-image')).not.toBeNull();
    expect(reopened.source.serialize()).toBe(saved);
  });
  it('renders images saved by the old paste code without rewriting the original Markdown', () => {
    const filename = 'Pasted image 20261105103845-8242d1e6-68bc-45a7-b3ce-bd29c4a62453.png';
    const raw = `# Arquitectura del Sistema\n\n![${filename}](${filename})\n`;
    const { editor, source } = open(raw);
    expect(editor.view.dom.querySelector('img.obsidian-image')).not.toBeNull();
    expect(editor.view.dom.textContent).not.toContain('Editar este formato en fuente');
    expect(source.serialize()).toBe(raw);
    editText(editor, 'Arquitectura del Sistema', 'Arquitectura actualizada');
    expect(source.serialize()).toBe(raw.replace('Arquitectura del Sistema', 'Arquitectura actualizada'));
  });
  it('preserves CRLF and the raw frontmatter when editing the body', () => {
    const raw = fixture('typed-crlf.md'); const parsed = parseFrontmatter(raw);
    const { editor, source } = open(parsed.markdownBody);
    editText(editor, 'Texto ', 'Texto actualizado ');
    expect(parsed.frontmatterHeader + source.serialize()).toBe(raw.replace('Texto ', 'Texto actualizado '));
  });
  it('edits typed properties while leaving unknown properties, comments and the body untouched', () => {
    const raw = fixture('preserve.md');
    const next = updateProperty(raw, 'title', 'Otro título');
    expect(next).toBe(raw.replace("'Conservar comillas'", '"Otro título"'));
    expect(parseFrontmatter(updateProperty(next, 'published', false)).frontmatter?.published).toBe(false);
  });
  it('preserves paragraph boundaries after splitting, inserting and undoing blocks', () => {
    const { editor, source } = open('First paragraph.\n\nSecond paragraph.\n');
    editor.commands.setTextSelection(7);
    editor.commands.splitBlock();
    const text = source.serialize();
    const reopened = open(text);
    expect(reopened.editor.state.doc.childCount).toBe(3);
    expect(reopened.editor.state.doc.content.content.map((node) => node.textContent.trim())).toEqual(editor.state.doc.content.content.map((node) => node.textContent.trim()));
    editor.commands.undo();
    expect(source.serialize()).toBe('First paragraph.\n\nSecond paragraph.\n');
  });
  it('does not render script elements or event handlers from preserved HTML source', () => {
    const raw = '<img src="x" onerror="alert(1)">\n\n<script>alert(1)</script>\n';
    const { editor, source } = open(raw);
    expect(source.serialize()).toBe(raw);
    expect(editor.view.dom.querySelector('script, [onerror]')).toBeNull();
  });
  it('renders an embedded section without recursively loading the whole note tree', async () => {
    const original = '![[Embedded#Sección]]\n';
    const { editor, source } = open(original);
    await vi.waitFor(() => expect(editor.view.dom.querySelector('.vault-note-preview')?.textContent).toContain('Contenido embebido.'));
    expect(editor.view.dom.querySelector('.vault-note-preview')?.textContent).toContain('Más.');
    expect(editor.view.dom.querySelector('.vault-note-preview')?.textContent).not.toContain('No incluir.');
    expect(source.serialize()).toBe(original);
  });
  it('retains a BOM even when the first body block is edited', () => {
    const { editor, source } = open('\uFEFFFirst paragraph.\r\n');
    editText(editor, 'First', 'Updated');
    expect(source.serialize()).toBe('\uFEFFUpdated paragraph.\r\n');
  });
});

it('renders and edits mixed paragraphs and image embeds without Markdown textareas', () => {
  const raw = 'Lo primero será instalar Docker:\n![[captura.png]]\nDespués continuamos en Windows.\n';
  const { editor, source } = open(raw);
  expect(editor.view.dom.querySelector('textarea')).toBeNull();
  expect(editor.view.dom.textContent).toContain('Lo primero será instalar Docker');
  expect(editor.view.dom.textContent).not.toContain('![[captura.png]]');
  expect(source.serialize()).toBe(raw);
  editText(editor, 'Windows', 'Linux');
  const saved = source.serialize();
  expect(saved).toContain('Linux');
  expect(saved).toContain('captura.png');
  const reopened = open(saved);
  expect(reopened.editor.view.dom.querySelector('textarea')).toBeNull();
  expect(reopened.editor.view.dom.textContent).toContain('Linux');
});
