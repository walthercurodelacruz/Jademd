import React, { useState } from 'react';
import { create } from 'zustand';
import { useVaultStore } from '../store/useVaultStore';
import { downloadDocument, exportNoteHtml } from '../utils/exportDocument';

export const useExportPanel = create<{ open: boolean; show: () => void; close: () => void }>((set) => ({ open: false, show: () => set({ open: true }), close: () => set({ open: false }) }));
export function ExportPanel() {
  const panel = useExportPanel(); const state = useVaultStore(); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  if (!panel.open) return null;
  const path = state.activePath;
  const ready = !!path && state.documents[path]?.loadState === 'ready';
  const markdown = !!path?.endsWith('.md') && !state.knownExcalidrawNotes[path];
  const run = async (print: boolean) => {
    if (!path) return;
    const content = state.drafts[path] ?? state.documents[path]?.content ?? '';
    const preview = print ? window.open('', '_blank') : null;
    if (print && !preview) { setError('Permite abrir la vista de impresión en este navegador'); return; }
    setBusy(true); setError('');
    try {
      const html = await exportNoteHtml(content, path);
      if (preview) { preview.document.open(); preview.addEventListener('load', () => preview.print(), { once: true }); preview.document.write(html); preview.document.close(); preview.focus(); }
      else downloadDocument(html, path.split('/').pop()!.replace(/\.md$/i, '.html'), 'text/html;charset=utf-8');
    } catch (error) { preview?.close(); setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-5"><section role="dialog" aria-modal="true" aria-label="Exportar documento" className="bg-obsidian-card border border-obsidian-border rounded-xl p-5 max-w-xl w-full">
    <h2 className="font-semibold">Exportar documento</h2><p className="text-xs text-obsidian-muted my-3">{path || 'Abre un documento'}. Se utiliza el contenido actual, incluidos los cambios pendientes. Exportar no guarda ni modifica la nota.</p>
    <div className="flex flex-wrap gap-3 text-sm">
      <button disabled={!ready || busy} className="bg-jade-700 rounded p-2" onClick={() => { if (!path) return; if (/\.(md|base|canvas|excalidraw)$/i.test(path)) downloadDocument(state.drafts[path] ?? state.documents[path].content, path.split('/').pop()!); else { const link = document.createElement('a'); link.href = `/api/asset?path=${encodeURIComponent(path)}`; link.download = path.split('/').pop()!; link.click(); } }}>Descargar original</button>
      <button disabled={!ready || !markdown || busy} className="underline" onClick={() => void run(false)}>Descargar HTML</button>
      <button disabled={!ready || !markdown || busy} className="underline" onClick={() => void run(true)}>Imprimir / PDF</button>
    </div>
    <p className="text-xs text-obsidian-muted my-3">El HTML incluye los adjuntos locales (hasta 50 MB) y fórmulas MathML. Las imágenes externas requieren conexión. El PDF utiliza el diálogo de impresión del navegador.</p>
    {busy && <p role="status">Preparando exportación…</p>}{error && <p role="alert" className="text-rose-300 text-sm">{error}</p>}
    <button disabled={busy} className="mt-4" onClick={() => { setError(''); panel.close(); }}>Cerrar</button>
  </section></div>;
}
