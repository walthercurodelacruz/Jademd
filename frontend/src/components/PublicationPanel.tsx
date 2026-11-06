import React, { useState } from 'react';
import { create } from 'zustand';
import { useVaultStore } from '../store/useVaultStore';
import { downloadDocument } from '../utils/exportDocument';
import { buildPublication } from '../utils/publication';

export const usePublicationPanel = create<{ open: boolean; show: () => void; close: () => void }>((set) => ({
  open: false, show: () => set({ open: true }), close: () => set({ open: false }),
}));

export function PublicationPanel() {
  const { open, close } = usePublicationPanel();
  const vaultId = useVaultStore((state) => state.vault?.id);
  if (!open || !vaultId) return null;
  return <PublicationForm key={vaultId} vaultId={vaultId} close={close} />;
}

function PublicationForm({ vaultId, close }: { vaultId: string; close: () => void }) {
  const tree = useVaultStore((state) => state.tree);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [attachments, setAttachments] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const paths: string[] = [];
  function collect(node: NonNullable<typeof tree>) {
    if (node.is_dir) node.children?.forEach(collect);
    else if (/\.md$/i.test(node.path) && !/\.excalidraw\.md$/i.test(node.path)) paths.push(node.path);
  }
  if (tree) collect(tree);
  const visible = paths.filter((path) => path.toLowerCase().includes(query.toLowerCase()));
  const generate = async () => {
    setBusy(true);
    setError('');
    setReady(false);
    try {
      const html = await buildPublication(selected, attachments, () => {
        const state = useVaultStore.getState();
        if (state.vault?.id !== vaultId || state.isLoading) throw new Error('La bóveda cambió durante la exportación');
      });
      downloadDocument(html, 'index.html', 'text/html;charset=utf-8');
      setReady(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  return <div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-4">
    <section role="dialog" aria-modal="true" aria-label="Exportar sitio estático"
      className="bg-obsidian-card rounded-xl border border-obsidian-border p-5 w-full max-w-xl">
      <h2 className="font-semibold">Exportar sitio estático</h2>
      <p className="my-3 text-sm text-obsidian-muted">Elige las notas guardadas que incluirá el archivo HTML. Las notas incrustadas se representan como texto.</p>
      <input autoFocus aria-label="Filtrar notas" value={query} onChange={(event) => setQuery(event.target.value)}
        className="w-full p-2 rounded bg-obsidian-bg" />
      <ul className="max-h-[35vh] overflow-auto my-3">
        {visible.map((path) => <li key={path}><label className="flex items-center gap-2 py-1 text-sm">
          <input type="checkbox" checked={selected.includes(path)} disabled={busy || (selected.length >= 50 && !selected.includes(path))}
            onChange={(event) => setSelected(event.target.checked ? [...selected, path] : selected.filter((item) => item !== path))} />
          <span className="break-all">{path}</span>
        </label></li>)}
      </ul>
      <label className="flex gap-2 text-sm mb-3"><input type="checkbox" disabled={busy} checked={attachments}
        onChange={(event) => setAttachments(event.target.checked)} /> Incluir los adjuntos locales enlazados</label>
      <p className="text-sm mb-3">{selected.length} de 50 notas seleccionadas</p>
      {error && <p role="alert" className="text-rose-300 mb-2">{error}</p>}
      {ready && <p role="status" className="text-jade-300 mb-2">Archivo index.html preparado</p>}
      <div className="flex gap-3">
        <button disabled={!selected.length || busy} onClick={() => void generate()} className="p-2 rounded bg-jade-700 disabled:opacity-50">
          {busy ? 'Preparando…' : 'Descargar sitio'}
        </button>
        <button disabled={busy} onClick={close}>Cerrar</button>
      </div>
    </section>
  </div>;
}
