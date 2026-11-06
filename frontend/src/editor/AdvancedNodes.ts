import { Node, mergeAttributes } from '@tiptap/core';
import { DOMSerializer } from '@tiptap/pm/model';
import { parseMarkdown } from './sourceDocument';
import { renderAdvanced } from '../utils/advancedRendering';

const configured = new WeakSet<object>();
const rawStorage = () => ({ markdown: { serialize(state: { write: (value: string) => void }, node: { attrs: { raw: string } }) { state.write(node.attrs.raw); } } });
export function advancedExpression(kind: string, raw: string): string {
  if (kind === 'math') return raw.slice(1, -1);
  if (kind === 'mathBlock') return raw.trim().replace(/^\$\$/, '').replace(/\$\$$/, '').trim();
  if (kind === 'mermaid') return raw.replace(/^\s*(?:`{3,}|~{3,})mermaid[^\n]*\n/i, '').replace(/\n\s*(?:`{3,}|~{3,})\s*$/, '');
  return raw.replace(/^\[\^[^\]]+\]:[ \t]*/, '').replace(/\n {4}/g, '\n');
}

export const MathInline = Node.create({
  name: 'mathInline', group: 'inline', inline: true, atom: true,
  addAttributes() { return { raw: { default: '', parseHTML: (element) => element.getAttribute('data-math') } }; },
  parseHTML() { return [{ tag: 'span[data-math]' }]; },
  renderHTML({ node }) { return ['span', { 'data-math': node.attrs.raw }, node.attrs.raw]; },
  addStorage: rawStorage,
  addNodeView() {
    return ({ node, getPos }) => {
      const dom = document.createElement('span'); dom.contentEditable = 'false'; dom.dataset.math = node.attrs.raw;
      const preview = document.createElement(this.editor.isEditable ? 'button' : 'span');
      if (preview instanceof HTMLButtonElement) { preview.type = 'button'; preview.title = 'Editar fórmula'; preview.setAttribute('aria-label', 'Editar fórmula'); }
      dom.appendChild(preview); renderAdvanced(preview, 'math', advancedExpression('math', node.attrs.raw));
      preview.addEventListener('click', (event) => {
        if (!this.editor.isEditable) return; event.preventDefault(); event.stopPropagation();
        const value = prompt('Fórmula LaTeX (sin delimitadores $):', advancedExpression('math', node.attrs.raw));
        if (value === null || value.includes('\n')) return;
        const pos = getPos(); if (typeof pos === 'number') this.editor.view.dispatch(this.editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, raw: `$${value}$` }));
      });
      return { dom, stopEvent: () => true };
    };
  },
});

export const FootnoteReference = Node.create({
  name: 'footnoteReference', group: 'inline', inline: true, atom: true,
  addAttributes() { return { raw: { default: '', parseHTML: (element) => element.getAttribute('data-footnote-raw') }, label: { default: '', parseHTML: (element) => element.getAttribute('data-footnote-reference') } }; },
  parseHTML() { return [{ tag: 'sup[data-footnote-reference]' }]; },
  renderHTML({ node }) { return ['sup', { 'data-footnote-reference': node.attrs.label, 'data-footnote-raw': node.attrs.raw }, ['button', { type: 'button', 'data-footnote-target': node.attrs.label, class: 'text-jade-400 underline', contenteditable: 'false' }, node.attrs.label]]; },
  addStorage: rawStorage,
});

export const AdvancedBlock = Node.create({
  name: 'advancedBlock', group: 'block', atom: true,
  addAttributes() { return {
    raw: { default: '', parseHTML: (element) => element.getAttribute('data-advanced-raw') },
    kind: { default: '', parseHTML: (element) => element.getAttribute('data-advanced-kind') },
    label: { default: '', parseHTML: (element) => element.getAttribute('data-footnote-definition') || '' },
    sourceId: { default: null, rendered: false },
  }; },
  parseHTML() { return [{ tag: 'div[data-advanced-kind]' }]; },
  renderHTML({ node, HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-advanced-kind': node.attrs.kind, 'data-advanced-raw': node.attrs.raw, ...(node.attrs.label ? { 'data-footnote-definition': node.attrs.label } : {}) }), node.attrs.raw]; },
  addNodeView() {
    return ({ node, getPos }) => {
      const dom = document.createElement('div'); dom.contentEditable = 'false'; dom.className = 'advanced-block my-4 rounded border border-obsidian-border p-3';
      dom.dataset.advancedKind = node.attrs.kind;
      const preview = document.createElement('div'); dom.appendChild(preview);
      if (node.attrs.kind === 'footnote') {
        dom.dataset.footnoteDefinition = node.attrs.label;
        const heading = document.createElement('strong'); heading.textContent = `[${node.attrs.label}] `; preview.appendChild(heading);
        const body = parseMarkdown(this.editor, advancedExpression('footnote', node.attrs.raw));
        preview.appendChild(DOMSerializer.fromSchema(this.editor.schema).serializeFragment(body.content));
        preview.querySelectorAll<HTMLElement>('[data-math]').forEach((element) => renderAdvanced(element, 'math', advancedExpression('math', element.dataset.math!)));
        const back = document.createElement('button'); back.type = 'button'; back.dataset.footnoteReturn = node.attrs.label; back.className = 'text-jade-400 underline'; back.textContent = 'Volver a la referencia'; dom.appendChild(back);
      } else renderAdvanced(preview, node.attrs.kind, advancedExpression(node.attrs.kind, node.attrs.raw));
      if (this.editor.isEditable) {
        const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = node.attrs.kind === 'mermaid' ? 'Editar diagrama' : node.attrs.kind === 'footnote' ? 'Editar nota al pie' : 'Editar fórmula'; edit.className = 'block mt-2 text-xs text-jade-400 underline'; edit.dataset.exportRemove = 'true'; dom.appendChild(edit);
        edit.addEventListener('click', () => {
          if (dom.querySelector('textarea')) return;
          const input = document.createElement('textarea'); input.setAttribute('aria-label', 'Código del bloque'); input.value = node.attrs.raw; input.className = 'block w-full bg-obsidian-bg border border-obsidian-border p-2 my-2 font-mono text-sm';
          const save = document.createElement('button'); save.type = 'button'; save.textContent = 'Aplicar'; save.className = 'text-jade-400 mr-3';
          const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancelar';
          dom.append(input, save, cancel); input.focus();
          cancel.onclick = () => { input.remove(); save.remove(); cancel.remove(); };
          save.onclick = () => { const pos = getPos(); if (typeof pos === 'number') this.editor.view.dispatch(this.editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, raw: input.value })); };
        });
      }
      return { dom, stopEvent: (event) => !!(event.target as HTMLElement).closest('button,textarea') };
    };
  },
  addStorage() { return { markdown: { ...rawStorage().markdown, parse: { setup(md: any) {
    if (configured.has(md)) return; configured.add(md);
    md.inline.ruler.before('emphasis', 'jadeMath', (state: any, silent: boolean) => {
      const start = state.pos;
      if (state.src[start] !== '$' || state.src[start+1] === '$' || /\s/.test(state.src[start+1] || ' ')) return false;
      let end = start+1;
      while ((end = state.src.indexOf('$', end)) >= 0) {
        if (state.src.slice(start+1, end).includes('\n')) return false;
        if (state.src[end-1] === '\\' || /\s/.test(state.src[end-1]) || /\d/.test(state.src[end+1] || '')) { end++; continue; }
        if (!silent) { const token = state.push('jadeMath', '', 0); token.content = state.src.slice(start, end+1); }
        state.pos = end+1; return true;
      } return false;
    });
    md.inline.ruler.before('link', 'jadeFootnote', (state: any, silent: boolean) => {
      const match = /^\[\^([^\]\s]+)\]/.exec(state.src.slice(state.pos)); if (!match) return false;
      if (!silent) { const token = state.push('jadeFootnote', '', 0); token.meta = { raw: match[0], label: match[1] }; }
      state.pos += match[0].length; return true;
    });
    md.renderer.rules.jadeMath = (tokens: any[], index: number) => `<span data-math="${md.utils.escapeHtml(tokens[index].content)}"></span>`;
    md.renderer.rules.jadeFootnote = (tokens: any[], index: number) => { const ref = tokens[index].meta; return `<sup data-footnote-reference="${md.utils.escapeHtml(ref.label)}" data-footnote-raw="${md.utils.escapeHtml(ref.raw)}"></sup>`; };
    md.block.ruler.before('fence', 'jadeAdvanced', (state: any, start: number, end: number, silent: boolean) => {
      if (state.sCount[start] >= 4) return false;
      const line = (index: number) => state.src.slice(state.bMarks[index] + state.tShift[index], state.eMarks[index]);
      const first = line(start); const mermaid = /^(`{3,}|~{3,})mermaid\s*$/i.exec(first); const math = /^\$\$/.test(first); const footnote = /^\[\^([^\]\s]+)\]:[ \t]*/.exec(first);
      if (!mermaid && !math && !footnote) return false;
      if (silent) return true;
      let last = start+1;
      if (mermaid) { while (last < end && !new RegExp(`^${mermaid[1][0]}{${mermaid[1].length},}\\s*$`).test(line(last))) last++; if (last < end) last++; }
      else if (math) { if (!/^\$\$[\s\S]*\$\$\s*$/.test(first) || first.trim() === '$$') { while (last < end && !/\$\$\s*$/.test(line(last))) last++; if (last < end) last++; } }
      else { while (last < end && (state.sCount[last] >= 4 || (!line(last).trim() && last+1 < end && state.sCount[last+1] >= 4))) last++; }
      const token = state.push('jadeAdvanced', '', 0); token.block = true; token.map = [start, last]; token.meta = { raw: state.src.slice(state.bMarks[start] + state.tShift[start], last < end ? state.bMarks[last] : state.src.length).replace(/\n$/, ''), kind: mermaid ? 'mermaid' : math ? 'mathBlock' : 'footnote', label: footnote?.[1] || '' };
      state.line = last; return true;
    }, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
    md.renderer.rules.jadeAdvanced = (tokens: any[], index: number) => { const block = tokens[index].meta; return `<div data-advanced-kind="${block.kind}" data-advanced-raw="${md.utils.escapeHtml(block.raw)}" data-footnote-definition="${md.utils.escapeHtml(block.label)}"></div>`; };
  } } } }; },
});
