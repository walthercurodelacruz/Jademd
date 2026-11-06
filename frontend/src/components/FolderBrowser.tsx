import { useEffect, useState } from 'react';
import { ArrowUp, Folder } from 'lucide-react';
import { api, type FolderListing } from '../api/client';

export function FolderBrowser({ onSelect }: { onSelect: (path: string) => void }) {
  const [path, setPath] = useState<string>();
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api.browseFolders(path, controller.signal).then((result) => {
      if (!controller.signal.aborted) setListing(result);
    }).catch((error: Error) => {
      if (!controller.signal.aborted) setError(error.message);
    });
    return () => controller.abort();
  }, [path, attempt]);

  const navigate = (next?: string) => {
    setListing(null);
    setError('');
    setPath(next);
    setAttempt((count) => count + 1);
  };

  return (
    <section aria-label="Explorador de carpetas" className="mt-2 space-y-2 rounded-lg border border-obsidian-border p-2 text-xs">
      <div className="flex flex-wrap gap-3">
        <button type="button" className="text-jade-300 underline" onClick={() => navigate()}>Ubicaciones</button>
        {listing?.parent && (
          <button type="button" className="flex items-center gap-1 text-jade-300" onClick={() => navigate(listing.parent!)}>
            <ArrowUp size={13} /> Subir
          </button>
        )}
      </div>
      {error ? (
        <div role="alert" className="text-rose-300">
          {error} <button type="button" className="underline" onClick={() => navigate(path)}>Reintentar</button>
        </div>
      ) : listing ? (
        <>
          {listing.current && <p className="break-all text-obsidian-muted">{listing.current}</p>}
          <ul className="max-h-44 overflow-y-auto">
            {listing.folders.map((folder) => (
              <li key={folder.path}>
                <button type="button" className="flex w-full items-center gap-2 rounded p-2 text-left hover:bg-obsidian-hover" onClick={() => navigate(folder.path)}>
                  <Folder size={14} className="shrink-0 text-jade-400" /> <span className="break-all">{folder.label}</span>
                </button>
              </li>
            ))}
          </ul>
          {listing.folders.length === 0 && <p className="text-obsidian-muted">No hay subcarpetas disponibles.</p>}
          {listing.current && <button type="button" className="rounded bg-jade-700 px-2 py-1.5 text-white" onClick={() => onSelect(listing.current!)}>
            Usar esta carpeta
          </button>}
        </>
      ) : <p role="status" className="text-obsidian-muted">Buscando carpetas…</p>}
    </section>
  );
}
