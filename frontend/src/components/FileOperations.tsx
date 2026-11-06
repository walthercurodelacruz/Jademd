import React, { useEffect, useState } from 'react';
import { useVaultStore } from '../store/useVaultStore';

export function FileOperations() {
  const { fileOperationPath, setFileOperationPath, moveItem, isLoading, trashOpen, setTrashOpen, trashEntries, loadTrash, restoreItem, noteError } = useVaultStore();
  const [destination, setDestination] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setConfirmed(false); setDestination(fileOperationPath || ''); setError(''); }, [fileOperationPath]);
  useEffect(() => { if (trashOpen) void loadTrash(); }, [trashOpen, loadTrash]);
  if (!fileOperationPath && !trashOpen) return null;
  return <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-6" onClick={() => { if (!isLoading) { setFileOperationPath(null); setTrashOpen(false); } }}>
    <section role="dialog" aria-modal="true" aria-label={fileOperationPath ? 'Renombrar o mover' : 'Papelera de la bóveda'} className="w-full max-w-xl max-h-[80vh] overflow-auto rounded-xl bg-obsidian-card border border-obsidian-border p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
      {fileOperationPath ? <form onSubmit={async (event) => {
        event.preventDefault(); setError('');
        try {
          if (!confirmed) { setConfirmed(true); return; }
          await moveItem(fileOperationPath, destination.trim());
        }
        catch (error) { setError(error instanceof Error ? error.message : String(error)); }
      }}>
        <h2 className="font-semibold mb-3">{confirmed ? 'Confirmar movimiento' : 'Renombrar o mover'}</h2>
        <p className="text-xs text-obsidian-muted mb-3 break-all">Origen: {fileOperationPath}</p>
        <label className="block text-sm">Nueva ruta dentro de la bóveda
          <input autoFocus aria-label="Nueva ruta" className="w-full mt-2 rounded border border-obsidian-border bg-obsidian-bg p-2" value={destination} onChange={(event) => { setConfirmed(false); setDestination(event.target.value); }} />
        </label>
        <p className="text-xs text-obsidian-muted my-3">Cambia el nombre o incluye otra carpeta. Se actualizarán los enlaces Markdown, wikilinks y referencias Canvas compatibles.</p>
        {error && <p role="alert" className="text-sm text-rose-300 mb-3">{error}</p>}
        <div className="flex justify-end gap-3"><button type="button" disabled={isLoading} onClick={() => setFileOperationPath(null)}>Cancelar</button><button type="submit" disabled={isLoading || !destination.trim() || destination === fileOperationPath} className="bg-jade-600 px-3 py-2 rounded disabled:opacity-40">{isLoading ? 'Moviendo…' : confirmed ? 'Confirmar movimiento' : 'Continuar'}</button></div>
      </form> : <>
        <h2 className="font-semibold mb-3">Papelera de la bóveda</h2>
        <p className="text-xs text-obsidian-muted mb-4">Restaura archivos y carpetas en su ubicación original. No se sobrescribirán elementos existentes.</p>
        {noteError && <p role="alert" className="text-rose-300 text-sm mb-3">{noteError}</p>}
        {!trashEntries.length && <p className="text-sm text-obsidian-muted py-8 text-center">La papelera está vacía.</p>}
        {trashEntries.map((entry) => <div key={entry.id} className="flex items-center gap-4 border-b border-obsidian-border py-3 text-xs">
          <div className="flex-1 min-w-0"><p className="break-all">{entry.path}</p><p className="text-obsidian-muted mt-1">{new Date(entry.deleted_at * 1000).toLocaleString()}</p></div>
          <button disabled={isLoading} className="text-jade-300 underline" onClick={() => void restoreItem(entry.id)}>Restaurar</button>
        </div>)}
        <button className="mt-4 text-sm" disabled={isLoading} onClick={() => setTrashOpen(false)}>Cerrar</button>
      </>}
    </section>
  </div>;
}
