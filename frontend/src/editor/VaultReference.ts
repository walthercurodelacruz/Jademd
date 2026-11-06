import { trackRender, renderAdvanced, numberFootnotes } from '../utils/advancedRendering';
import { advancedExpression } from './AdvancedNodes';
import { DOMSerializer } from '@tiptap/pm/model';
import { api } from '../api/client';
import { noteFragment } from '../utils/noteFragment';
import { isAttachmentTarget } from '../utils/markdownSyntax';
import { Node, mergeAttributes } from '@tiptap/core';
import { parseMarkdown } from './sourceDocument';

const configured = new WeakSet<object>();

/** Keep the original wikilink as an atomic inline node, including aliases and embed options. */
export const VaultReference = Node.create({
  name: 'vaultReference', group: 'inline', inline: true, atom: true,
  addOptions() { return { sourcePath: '', renderNoteEmbeds: true, renderMedia: true }; },
  addAttributes() {
    return {
      raw: { default: '', parseHTML: (element) => element.getAttribute('data-vault-ref') },
      target: { default: '', parseHTML: (element) => element.getAttribute('data-target') },
      label: { default: '', parseHTML: (element) => element.getAttribute('data-label') },
      embed: { default: false, parseHTML: (element) => element.getAttribute('data-embed') === 'true' },
    };
  },
  parseHTML() { return [{ tag: 'span[data-vault-ref]' }]; },
  renderHTML({ node, HTMLAttributes }) {
    const { raw, target, label, embed } = node.attrs;
    const path = String(target).split('#')[0];
    const attrs = mergeAttributes(HTMLAttributes, { 'data-vault-ref': raw, 'data-target': target,
      'data-label': label, 'data-embed': String(embed), class: 'wikilink', contenteditable: 'false' });
    const src = `/api/asset?path=${encodeURIComponent(path)}&source=${encodeURIComponent(this.options.sourcePath)}`;
    if (this.options.renderMedia && embed && /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i.test(path)) {
      const size = String(label).match(/^(\d+)(?:x(\d+))?$/);
      return ['span', attrs, ['img', { src, alt: size ? path : label || path, class: 'obsidian-image max-w-full rounded',
        ...(size ? { width: Math.min(Number(size[1]), 4096), ...(size[2] ? { height: Math.min(Number(size[2]), 4096) } : {}) } : {}) }]];
    }
    if (this.options.renderMedia && embed && /\.(mp3|wav|ogg|m4a)$/i.test(path)) return ['span', attrs, ['audio', { src, controls: true }]];
    if (this.options.renderMedia && embed && /\.(mp4|webm|mov)$/i.test(path)) return ['span', attrs, ['video', { src, controls: true, class: 'max-w-full' }]];
    return ['span', attrs, `${embed ? '↳ ' : ''}${label || target}`];
  },
  addNodeView() {
    return ({ node }) => {
      const specification = this.editor.schema.nodes.vaultReference.spec.toDOM!(node);
      const dom = DOMSerializer.renderSpec(document, specification).dom as HTMLElement;
      let disposed = false;
      if (this.options.renderNoteEmbeds && node.attrs.embed && !isAttachmentTarget(node.attrs.target)) {
        const preview = document.createElement('span');
        preview.className = 'vault-note-preview block my-2 p-3 border border-obsidian-border rounded text-obsidian-text whitespace-normal';
        preview.textContent = 'Cargando nota enlazada…';
        dom.appendChild(preview);
        trackRender(preview, (async () => {
          try {
            const path = await api.resolveEntry(node.attrs.target, this.options.sourcePath);
            if (disposed) return;
            const source = await api.readNote(path);
            const anchor = node.attrs.target.includes('#') ? node.attrs.target.slice(node.attrs.target.indexOf('#') + 1) : '';
            const fragment = noteFragment(source, anchor);
            if (disposed) return;
            // DOMSerializer uses the editor schema; arbitrary scripts/handlers from Markdown are discarded.
            // Nested references are rendered once, without mounting recursive fetching NodeViews.
            const parsed = parseMarkdown(this.editor, fragment);
            preview.replaceChildren(DOMSerializer.fromSchema(this.editor.schema).serializeFragment(parsed.content));
            preview.querySelectorAll<HTMLElement>('[data-math]').forEach((element) => renderAdvanced(element, 'math', advancedExpression('math', element.dataset.math!)));
            preview.querySelectorAll<HTMLElement>('[data-advanced-kind]').forEach((element) => {
              const kind = element.dataset.advancedKind!; const raw = element.dataset.advancedRaw || '';
              if (kind === 'footnote') {
                const parsed = parseMarkdown(this.editor, advancedExpression(kind, raw));
                element.replaceChildren(DOMSerializer.fromSchema(this.editor.schema).serializeFragment(parsed.content));
              } else renderAdvanced(element, kind, advancedExpression(kind, raw));
            });
            numberFootnotes(preview);
            preview.dataset.source = path;
            preview.querySelectorAll<HTMLElement>('[data-vault-ref], a').forEach((element) => element.dataset.source = path);
            preview.querySelectorAll<HTMLElement>('[src^="/api/asset?"]').forEach((element) => {
              const src = new URL(element.getAttribute('src')!, 'http://localhost');
              src.searchParams.set('source', path); element.setAttribute('src', src.pathname + src.search);
            });
          } catch (error) { if (!disposed) { preview.dataset.renderState = 'error'; preview.textContent = error instanceof Error ? error.message : String(error); } }
        })());
      }
      return { dom, destroy() { disposed = true; } };
    };
  },
  addStorage() {
    return {
      markdown: {
        serialize(state: { write: (text: string) => void }, node: { attrs: { raw: string } }) { state.write(node.attrs.raw); },
        parse: {
          // tiptap-markdown exposes its markdown-it parser through this hook.
          setup(md: any) {
            if (configured.has(md)) return;
            configured.add(md);
            md.inline.ruler.before('link', 'vaultReference', (state: any, silent: boolean) => {
              const remaining = state.src.slice(state.pos);
              const wiki = /^(!?)\[\[([^\]\n|]+)(?:\|([^\]\n]*))?\]\]/.exec(remaining);
              // Read the malformed space-containing filenames produced by older paste versions.
              // raw is retained so displaying an existing note never rewrites its source.
              const markdown = !wiki ? /^(!?)\[([^\]\n]*)\]\((?:<([^>\n]*)>|(Pasted image \d{14}-[a-f\d-]{36}\.[a-z\d]+|[^\s()]+(?:\([^)]*\)[^\s()]*)*))(?:[ \t]+["'][^\n]*?["'])?\)/.exec(remaining) : null;
              const match = wiki || markdown;
              if (!match || state.pos + match[0].length > state.posMax) return false;
              let target = wiki ? wiki[2].trim() : markdown![3] || markdown![4];
              if (markdown) {
                if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target)) return false;
                try { target = decodeURIComponent(target); } catch { /* Keep literal percent signs. */ }
              }

              if (!silent) {
                const token = state.push('vaultReference', '', 0);
                token.meta = { raw: match[0], target, label: wiki ? wiki[3] || '' : markdown![2], embed: !!match[1] };
              }
              state.pos += match[0].length;
              return true;
            });
            md.renderer.rules.vaultReference = (tokens: any[], index: number) => {
              const ref = tokens[index].meta;
              const escape = md.utils.escapeHtml;
              return `<span data-vault-ref="${escape(ref.raw)}" data-target="${escape(ref.target)}" data-label="${escape(ref.label)}" data-embed="${ref.embed}">${escape(ref.label || ref.target)}</span>`;
            };
          },
        },
      },
    };
  },
});
