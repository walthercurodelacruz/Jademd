import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useVaultStore } from '../store/useVaultStore';

export function ConnectionsPanel() {
  const { activePath, vault, graphData, navigateToLink, openNote } = useVaultStore();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.connections>> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false; setData(null); setError('');
    if (activePath?.endsWith('.md')) void api.connections(activePath).then((value) => { if (!disposed) setData(value); }).catch((error) => { if (!disposed) setError(error instanceof Error ? error.message : String(error)); });
    return () => { disposed = true; };
  }, [activePath, vault?.id, graphData]);
  if (!activePath?.endsWith('.md')) return null;
  return <div className="text-xs space-y-3">
    {error && <p role="alert" className="text-rose-300">{error}</p>}
    <section><h3 className="uppercase text-obsidian-muted mb-2">Enlaces salientes ({data?.outgoing.length ?? 0})</h3>
      {data?.outgoing.map((link) => <button key={link.target} className="block w-full text-left p-2 rounded hover:bg-obsidian-hover text-jade-300" onClick={() => void navigateToLink(link.target, activePath)}>{link.target}{!link.path && <span className="text-obsidian-muted"> — sin resolver</span>}</button>)}
    </section>
    <section><h3 className="uppercase text-obsidian-muted mb-2">Menciones sin enlace ({data?.unlinked.length ?? 0})</h3>
      <p className="text-obsidian-muted mb-2">Título y alias en notas que todavía no enlazan aquí. Hasta 100 resultados.</p>
      {data?.unlinked.map((mention) => <button key={`${mention.path}:${mention.line}`} className="block w-full text-left p-2 rounded hover:bg-obsidian-hover" onClick={() => void openNote(mention.path)}><span className="text-jade-300">{mention.path}:{mention.line}</span><span className="block text-obsidian-muted truncate">{mention.content}</span></button>)}
      {data && !data.unlinked.length && <p className="text-obsidian-muted">No hay menciones pendientes.</p>}
    </section>
  </div>;
}
