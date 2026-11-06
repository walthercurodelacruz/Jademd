import { numberFootnotes } from '../utils/advancedRendering';
import { Extension, Node as TiptapNode } from '@tiptap/core';
import { DOMParser as SchemaDOMParser, Fragment, Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/core';

export function parseMarkdown(editor: Editor, source: string): ProseMirrorNode {
  const html = (editor.storage as any).markdown.parser.parse(source);
  // Parse in an inert document and reuse the live schema, rather than rebuilding it for every block.
  const inert = new window.DOMParser().parseFromString(html, 'text/html');
  return SchemaDOMParser.fromSchema(editor.schema).parse(inert.body);
}

export const SourceBlock = TiptapNode.create({
  name: 'sourceBlock',
  group: 'block',
  content: 'block+',
  addAttributes() { return { sourceId: { default: null, rendered: false } }; },
  parseHTML() { return []; },
  renderHTML() { return ['div', { class: 'live-document-block' }, 0]; },
  addStorage() {
    return {
      markdown: {
        serialize(state: { renderContent: (node: ProseMirrorNode) => void }, node: ProseMirrorNode) {
          state.renderContent(node);
        },
      },
    };
  },
});

export const SourceIds = Extension.create({
  name: 'sourceIds',
  addGlobalAttributes() {
    return [{ types: ['paragraph', 'heading', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'codeBlock', 'table', 'horizontalRule', 'image'],
      attributes: { sourceId: { default: null, rendered: false } } }];
  },
});

interface OriginalBlock { node: ProseMirrorNode; source: string; prefix: string }

/** Reuse the original source of untouched blocks, rather than re-serializing a whole Markdown file. */
export class SourceDocument {
  private readonly blocks = new Map<string, OriginalBlock>();
  private tail = '';
  private newline: string;
  private preamble = '';
  constructor(private editor: Editor, private source: string) {
    this.newline = source.includes('\r\n') ? '\r\n' : '\n';
    if (source.startsWith('\uFEFF')) { this.preamble = '\uFEFF'; this.source = source.slice(1); }
  }

  prepare(): void {
    const storage = (this.editor.storage as any).markdown;
    const lines = this.source.split(/(?<=\n)/);
    const offsets = [0];
    lines.forEach((line) => offsets.push(offsets[offsets.length - 1] + line.length));
    const tokens: { level: number; map?: [number, number] }[] = storage.parser.md.parse(this.source, {});
    const spans = tokens.filter((token) => token.level === 0 && token.map).map((token) => token.map!);
    const nodes: ProseMirrorNode[] = [];
    let previousEnd = 0;
    spans.forEach(([first, last], index) => {
      const start = offsets[first]; const end = offsets[last] ?? this.source.length;
      if (start < previousEnd) return;
      const raw = this.source.slice(start, end);
      const parsed = parseMarkdown(this.editor, raw);
      const serialized = storage.serializer.serialize(parsed.content);
      const comparable = (value: string) => value.replace(/\r\n/g, '\n').trim();
      const original = comparable(raw);
      const roundTrip = comparable(serialized);
      const block = parsed.childCount === 1 ? parsed.child(0) : null;
      // The Markdown serializer may encode a literal > in an unformatted paragraph.
      const onlyEscapesGreaterThan = block?.type.name === 'paragraph'
        && block.firstChild?.isText && block.childCount === 1 && !block.firstChild.marks.length
        && block.textContent === original && original.replace(/>/g, '&gt;') === roundTrip;
      const id = `source-${index}`;
      const node = block && (roundTrip === original || onlyEscapesGreaterThan)
        ? block.type.create({ ...block.attrs, sourceId: id }, block.content, block.marks)
        : this.editor.schema.nodes.sourceBlock.create({ sourceId: id }, parsed.content);
      nodes.push(node);
      this.blocks.set(id, { node, source: raw, prefix: this.source.slice(previousEnd, start) });
      previousEnd = end;
    });
    this.tail = this.source.slice(previousEnd);
    if (!nodes.length && this.source.trim()) throw new Error('El formato requiere edición fuente.');
    this.editor.chain().command(({ tr }) => { tr.setMeta('addToHistory', false); return true; })
      .setContent({ type: 'doc', content: nodes.length ? nodes.map((node) => node.toJSON()) : [{ type: 'paragraph' }] }, { emitUpdate: false }).run();
    numberFootnotes(this.editor.view.dom);
  }

  serialize(): string {
    const storage = (this.editor.storage as any).markdown;
    const used = new Set<string>();
    let result = '';
    let previousWasNew = false;
    this.editor.state.doc.forEach((node) => {
      const id = node.attrs.sourceId;
      const original = used.has(id) ? undefined : this.blocks.get(id);
      used.add(id);
      const padBoundary = (prefix: string) => {
        if (!result || (!previousWasNew && original)) return prefix;
        const trailing = (result.match(/(?:\r?\n)+$/)?.[0].match(/\n/g) || []).length;
        const leading = (prefix.match(/^(?:\r?\n)+/)?.[0].match(/\n/g) || []).length;
        return this.newline.repeat(Math.max(0, 2 - trailing - leading)) + prefix;
      };
      if (original && original.node.eq(node)) {
        result += padBoundary(original.prefix) + original.source; previousWasNew = false; return;
      }
      const serialized = storage.serializer.serialize(Fragment.from(node)).replace(/\r?\n/g, this.newline);
      const prefix = padBoundary(original?.prefix || '');
      result += prefix + serialized + ((original?.source.endsWith('\n') || !original) && !serialized.endsWith(this.newline) ? this.newline : '');
      previousWasNew = !original;
    });
    return this.preamble + result + this.tail;
  }
}
