import React, { useEffect, useState } from 'react';
import { useVaultStore } from '../store/useVaultStore';
import { api } from '../api/client';

function ConflictDialog({ path, onClose }: { path: string; onClose: () => void }) {
  const state = useVaultStore();
  const conflict = state.conflicts[path];
  const [merged, setMerged] = useState(state.drafts[path] ?? state.documents[path]?.content ?? '');
  const [remote, setRemote] = useState(conflict?.remote);
  const [copyPath, setCopyPath] = useState(path.replace(/(\.[^/.]+)?$/, '-copia$1'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!conflict) return null;
  const changed = remote !== conflict.remote;
  const resolve = async (choice: 'remote' | 'merge' | 'copy') => {
    setBusy(true); setError('');
    try { await state.resolveConflict(path, choice, merged, copyPath); onClose(); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-[100] bg-black/70 p-6 flex items-center justify-center">
    <section role="dialog" aria-modal="true" aria-label="Resolver conflicto" className="bg-obsidian-card border border-obsidian-border rounded-xl p-5 w-full max-w-6xl max-h-[95vh] overflow-auto">
      <h2 className="font-semibold">Resolver conflicto: {path}</h2>
      <p className="text-sm text-obsidian-muted my-3">Compara las versiones. Edita la propuesta para combinar cambios o guarda tu contenido como otro archivo.</p>
      {changed && <p role="alert" className="text-amber-300 my-2">La versión externa volvió a cambiar. <button className="underline" onClick={() => setRemote(conflict.remote)}>Actualizar comparación</button></p>}
      <div className="grid md:grid-cols-2 gap-4">
        <label className="text-sm">Versión externa {remote === null ? '(archivo eliminado)' : ''}<textarea aria-label="Versión externa" readOnly value={remote ?? ''} className="w-full h-64 mt-2 bg-obsidian-bg border border-obsidian-border rounded p-2 font-mono text-xs" /></label>
        <label className="text-sm">Propuesta de combinación<textarea aria-label="Propuesta de combinación" value={merged} onChange={(event) => setMerged(event.target.value)} className="w-full h-64 mt-2 bg-obsidian-bg border border-obsidian-border rounded p-2 font-mono text-xs" /></label>
      </div>
      <details className="text-xs my-3"><summary>Versión base</summary><pre className="whitespace-pre-wrap max-h-48 overflow-auto p-2">{conflict.base === undefined ? 'El borrador recuperado no conserva una versión base.' : conflict.base ?? '(archivo ausente)'}</pre></details>
      {error && <p role="alert" className="text-rose-300 my-2">{error}</p>}
      <div className="flex flex-wrap gap-3 text-sm items-center">
        <button disabled={busy || changed} className="bg-jade-700 rounded p-2 disabled:opacity-40" onClick={() => void resolve('merge')}>Guardar propuesta</button>
        <button disabled={busy || changed} className="underline" onClick={() => { if (confirm('¿Descartar los cambios locales y usar la versión externa?')) void resolve('remote'); }}>Usar versión externa</button>
        <input aria-label="Ruta de la copia" value={copyPath} onChange={(event) => setCopyPath(event.target.value)} className="bg-obsidian-bg p-2 rounded border border-obsidian-border" />
        <button disabled={busy || changed} className="underline" onClick={() => void resolve('copy')}>Guardar copia local</button>
        <button disabled={busy} onClick={onClose}>Revisar después</button>
      </div>
    </section>
  </div>;
}

export function IntegrityPanel() {
  const { vault, conflicts, externalError, refreshExternalChanges, recoverInterruptedOperation } = useVaultStore();
  const [selected, setSelected] = useState<string | null>(null);
  const [operations, setOperations] = useState<{ id: string; from: string; to: string }[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setSelected(null); setOperations([]); setError('');
    if (!vault) return;
    const local = vault.storage_type === 'local';
    let disposed = false; let running = false;
    const check = async () => {
      if (running || document.visibilityState === 'hidden') return;
      running = true;
      try {
        await refreshExternalChanges();
        if (local) {
          const pending = await api.pendingOperations();
          if (!disposed) { setOperations(pending); setError(''); }
        }
      } catch (error) { if (!disposed) setError(`No se pudo revisar la recuperación: ${error instanceof Error ? error.message : String(error)}`); }
      finally { running = false; }
    };
    void check();
    const timer = setInterval(() => void check(), local ? 5000 : 30000);
    window.addEventListener('focus', check);
    return () => { disposed = true; clearInterval(timer); window.removeEventListener('focus', check); };
  }, [vault?.id, vault?.storage_type, refreshExternalChanges]);
  return <>
    {(Object.keys(conflicts).length > 0 || operations.length > 0 || externalError || error) && <aside aria-label="Integridad de la bóveda" className="fixed bottom-8 left-16 z-50 max-w-lg bg-amber-950 border border-amber-700 rounded-lg p-3 text-xs text-amber-100 shadow-xl">
      {Object.keys(conflicts).map((path) => <p key={path} className="py-1">Cambios externos en {path}. <button className="underline" onClick={() => setSelected(path)}>Comparar versiones</button></p>)}
      {operations.map((operation) => <p key={operation.id} className="py-1">Movimiento interrumpido: {operation.from} → {operation.to}. <button disabled={busy} className="underline" onClick={async () => {
        setBusy(true); setError('');
        try { await recoverInterruptedOperation(operation.id, operation.from, operation.to); setOperations(await api.pendingOperations()); }
        catch (error) { setError(error instanceof Error ? error.message : String(error)); }
        finally { setBusy(false); }
      }}>Restaurar estado anterior</button></p>)}
      {(externalError || error) && <p role="alert">{externalError || error}</p>}
    </aside>}
    {selected && conflicts[selected] && <ConflictDialog key={selected} path={selected} onClose={() => setSelected(null)} />}
  </>;
}
