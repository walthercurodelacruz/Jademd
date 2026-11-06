import { Editor } from '@tiptap/core';
import { createVaultExtensions } from '../editor/vaultExtensions';
import { SourceDocument } from '../editor/sourceDocument';
import { parseFrontmatter } from './frontmatter';
import { settleRendering } from './advancedRendering';

export function downloadDocument(content: Blob | string, filename: string, type = 'text/plain;charset=utf-8'): void {
  const url = URL.createObjectURL(typeof content === 'string' ? new Blob([content], { type }) : content);
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('No se pudo incluir una imagen')); reader.readAsDataURL(blob); });
}
interface PublicationOptions {
  attachments: boolean;
  resolveLink: (target: string) => Promise<string | undefined>;
}

export async function exportNoteHtml(content: string, path: string, publication?: PublicationOptions): Promise<string> {
  const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-100000px;top:0;width:1000px'; document.body.appendChild(host);
  const editor = new Editor({ element: host, extensions: createVaultExtensions(path, true, undefined, publication ? {
    renderNoteEmbeds: false,
    media: publication.attachments ? 'local' : 'none',
  } : undefined), editable: false, content: '' });
  try {
    const body = parseFrontmatter(content).markdownBody;
    new SourceDocument(editor, body).prepare();
    await settleRendering(host);
    if (host.querySelector('[data-render-state="error"]')) throw new Error('Corrige los errores de representación antes de exportar HTML');
    const clone = editor.view.dom.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[data-export-remove], .ProseMirror-separator, .ProseMirror-trailingBreak').forEach((element) => element.remove());
    // MathML carries the formula without requiring KaTeX fonts or CSS from the running app.
    clone.querySelectorAll('.katex').forEach((element) => { const math = element.querySelector('math'); if (math) element.replaceWith(math.cloneNode(true)); });
    let totalBytes = 0;
    for (const image of Array.from(clone.querySelectorAll<HTMLImageElement>('img,audio,video,source'))) {
      const source = image.getAttribute('src') || '';
      if (publication && !(image.classList.contains('mermaid-diagram') && source.startsWith('data:image/svg+xml;charset=utf-8,'))) {
        if (!publication.attachments || !source.startsWith('/api/asset?')) { image.remove(); continue; }
      }
      if (!source.startsWith('/api/asset?')) continue;
      const response = await fetch(source, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`No se pudo incluir la imagen: ${image.alt || source}`);
      const blob = await response.blob(); totalBytes += blob.size;
      if (totalBytes > 50 * 1024 * 1024) throw new Error('Los adjuntos superan el límite de 50 MB para esta exportación');
      image.src = await dataUrl(blob);
    }
    for (const button of Array.from(clone.querySelectorAll('button'))) {
      const targetLabel = button.dataset.footnoteTarget || button.dataset.footnoteReturn;
      if (targetLabel) {
        const attribute = button.dataset.footnoteReturn ? 'data-footnote-reference' : 'data-footnote-definition';
        const target = Array.from(clone.querySelectorAll<HTMLElement>(`[${attribute}]`)).find((element) => element.getAttribute(attribute) === targetLabel);
        const anchor = document.createElement('a'); anchor.textContent = button.textContent;
        if (target?.id) anchor.href = `#${target.id}`; button.replaceWith(anchor);
      } else button.replaceWith(...Array.from(button.childNodes));
    }
    if (publication) {
      for (const reference of clone.querySelectorAll<HTMLElement>('[data-vault-ref][data-target]')) {
        if (reference.dataset.embed === 'true') continue;
        const target = await publication.resolveLink(reference.dataset.target!);
        if (!target) continue;
        const anchor = document.createElement('a');
        anchor.href = target;
        anchor.textContent = reference.textContent;
        reference.replaceWith(anchor);
      }
    }
    clone.querySelectorAll('*').forEach((element) => {
      for (const attribute of Array.from(element.attributes)) if (/^(?:data-|on)|^(?:contenteditable|tabindex|raw|target|embed|label)$/.test(attribute.name)) element.removeAttribute(attribute.name);
      if (element instanceof HTMLAnchorElement) { const href = element.getAttribute('href') || ''; if (/^(?:javascript|data|vbscript):/i.test(href)) element.removeAttribute('href'); }
    });
    const title = path.split('/').pop()?.replace(/\.md$/i, '') || 'Nota';
    const escapedTitle = title.replace(/[<>&"]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[character]!);
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http:; media-src data: https: http:; style-src 'unsafe-inline'; font-src data:"><title>${escapedTitle}</title><style>body{font:16px/1.6 system-ui,sans-serif;color:#222;background:white;max-width:900px;margin:3em auto;padding:0 1.5em}img,video{max-width:100%;height:auto}pre{white-space:pre-wrap;background:#f4f4f4;padding:1em}code{font-family:monospace}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:.5em}blockquote{border-left:3px solid #aaa;margin-left:0;padding-left:1em}a{color:#087c65}math[display="block"]{display:block;margin:1em 0}.advanced-block{margin:1em 0}sup{font-size:.75em}.task-list{list-style:none}@media print{body{max-width:none;margin:0}pre,img,math{break-inside:avoid}}</style></head><body><article>${clone.innerHTML}</article></body></html>`;
  } finally { editor.destroy(); host.remove(); }
}
