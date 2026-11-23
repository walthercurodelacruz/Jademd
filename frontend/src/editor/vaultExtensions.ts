import { MathInline, FootnoteReference, AdvancedBlock } from './AdvancedNodes';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import Image, { type ImageOptions } from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import { decodeAssetPath } from '../utils/markdownConverter';
import { SourceBlock, SourceIds } from './sourceDocument';
import { VaultReference } from './VaultReference';

// Custom TipTap Image extension to resolve local vault assets seamlessly
type MediaPolicy = 'all' | 'local' | 'none';

export const VaultImage = Image.extend<ImageOptions & { media: MediaPolicy }>({
  addOptions() {
    return { ...this.parent!(), media: 'all' };
  },
  addStorage() {
    return {
      markdown: {
        serialize(state: { write: (text: string) => void; esc: (text: string) => string }, node: { attrs: { src: string; alt?: string; title?: string } }) {
          // A bare destination containing spaces is invalid Markdown. Keep existing URL escapes.
          const destination = node.attrs.src.replace(/[\s()<>"\\]/g, (character) => character === '(' ? '%28' : character === ')' ? '%29' : encodeURIComponent(character));
          const title = node.attrs.title ? ` "${node.attrs.title.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : '';
          state.write(`![${state.esc(node.attrs.alt || '')}](${destination}${title})`);
        },
        parse: { /* Images are parsed by markdown-it. */ },
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    const rawSrc = HTMLAttributes.src || '';
    const isExternal =
      rawSrc.startsWith('http://') ||
      rawSrc.startsWith('https://') ||
      rawSrc.startsWith('data:');

    if (this.options.media === 'none' || (this.options.media === 'local' && isExternal)) {
      return ['figure', {}, HTMLAttributes.alt || ''];
    }

    let cleanSrc = rawSrc.replace(/^<|>$/g, '');
    cleanSrc = (isExternal ? cleanSrc : decodeAssetPath(cleanSrc)).replace(/^\.\//, '');

    const displaySrc =
      isExternal || cleanSrc.startsWith('/api/asset')
        ? cleanSrc
        : `/api/asset?path=${encodeURIComponent(cleanSrc)}&source=${encodeURIComponent(this.options.HTMLAttributes['data-vault-source'] || '')}`;

    return [
      'figure',
      { class: 'my-5 flex flex-col items-center select-none' },
      [
        'img',
        {
          ...HTMLAttributes,
          src: displaySrc,
          class:
            'obsidian-image rounded-xl shadow-lg border border-obsidian-border/70 my-2 max-w-full h-auto cursor-zoom-in hover:shadow-2xl hover:border-jade-500/50 transition',
          loading: 'lazy',
        },
      ],
    ];
  },
});


export const VaultHighlight = Highlight.extend({
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) => {
          const dataColor = element.getAttribute('data-color');
          if (dataColor) return dataColor;
          const styleAttr = element.getAttribute('style') || '';
          const match = styleAttr.match(/background(?:-color)?\s*:\s*([^;"]+)/i);
          return match ? match[1].trim() : element.style.backgroundColor || null;
        },
        renderHTML: (attributes) => {
          if (!attributes.color) {
            return {
              class: 'bg-amber-400/20 text-amber-200 px-1 py-0.5 rounded',
            };
          }
          return {
            'data-color': attributes.color,
            class: 'px-1 py-0.5 rounded',
            style: `background: ${attributes.color}; color: #18181b; font-weight: 500`,
          };
        },
      },
    };
  },
  addStorage() {
    return {
      markdown: {
        serialize: {
          open: (_state: unknown, mark: { attrs: { color?: string | null } }) =>
            mark.attrs.color ? `<mark style="background: ${mark.attrs.color};">` : '==',
          close: (_state: unknown, mark: { attrs: { color?: string | null } }) =>
            mark.attrs.color ? '</mark>' : '==',
          mixable: true,
          expelEnclosingWhitespace: true,
        },
        parse: {},
      },
    };
  },
});

export function createVaultExtensions(path: string, readOnly = false, _onEditSource?: () => void, options: { renderNoteEmbeds?: boolean; media?: MediaPolicy } = {}) {
  const { renderNoteEmbeds = true, media = 'all' } = options;
  return [
      MathInline, FootnoteReference, AdvancedBlock, SourceIds, SourceBlock, VaultReference.configure({ sourcePath: path, renderNoteEmbeds, renderMedia: media !== 'none' }),
      StarterKit.configure({
        trailingNode: false,
        link: false,
        underline: false,
        heading: {
          levels: [1, 2, 3, 4],
        },
        codeBlock: {
          HTMLAttributes: {
            class: 'bg-[#141416] p-4 rounded-xl font-mono text-xs text-obsidian-text border border-obsidian-border/90 my-4 overflow-x-auto shadow-inner leading-relaxed',
          },
        },
        blockquote: {
          HTMLAttributes: {
            class: 'border-l-4 border-jade-500/80 bg-jade-950/20 px-4 py-2.5 rounded-r-lg my-3 text-obsidian-text font-normal shadow-xs',
          },
        },
      }),
      Underline,
      VaultHighlight.configure({
        multicolor: true,
      }),
      Markdown.configure({
        html: true,
        tightLists: true,
        bulletListMarker: '-',
        linkify: true,
        breaks: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
      TaskList.configure({
        HTMLAttributes: {
          class: 'task-list my-2 pl-0 list-none',
        },
      }),
      TaskItem.configure({
        nested: true,
        HTMLAttributes: {
          class: 'task-item flex items-start gap-2.5 my-1.5',
        },
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'table-auto w-full my-4 border-collapse border border-obsidian-border text-sm',
        },
      }),
      TableRow,
      TableHeader.configure({
        HTMLAttributes: {
          class: 'bg-obsidian-card border border-obsidian-border p-2.5 font-semibold text-sky-400 text-left',
        },
      }),
      TableCell.configure({
        HTMLAttributes: {
          class: 'border border-obsidian-border p-2 text-obsidian-text',
        },
      }),
      VaultImage.configure({ media, HTMLAttributes: { 'data-vault-source': path } }),
      Link.configure({
        openOnClick: readOnly,
        autolink: true,
        HTMLAttributes: {
          class: 'text-jade-400 underline decoration-jade-500/50 hover:text-jade-300 transition cursor-pointer',
        },
      }),
      Placeholder.configure({
        placeholder: 'Empieza a escribir directamente tu nota aquí... (Pega imágenes con Ctrl+V, escribe o formatea libremente)',
      }),
    ];
}
