import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { usePaneState } from '../store/PaneContext';
import type { NoteMetadata } from '../types';
import { baseRows, parseBase } from '../utils/baseDocument';

export function BaseView({ content }: { content: string }) {
  const { vault, graphData, openNote, documents } = usePaneState();
  const [notes, setNotes] = useState<NoteMetadata[] | null>(null);
  const [requestError, setRequestError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    let current = true;
    setRequestError('');
    void api.indexedNotes().then((value) => { if (current) setNotes(value); })
      .catch((error: unknown) => { if (current) setRequestError(error instanceof Error ? error.message : String(error)); });
    return () => { current = false; };
  }, [vault?.id, graphData, refresh]);

  const result = useMemo(() => {
    try {
      const base = parseBase(content);
      const viewIndex = Math.min(selected, base.views.length - 1);
      const view = base.views[viewIndex];
      const currentNotes = (notes || []).map((note) =>
        documents[note.path]?.metadata ?? note);
      return { base, view, viewIndex, ...baseRows(base, view, currentNotes), error: null };
    } catch (error) {
      return { base: null, view: null, viewIndex: 0, rows: [], count: 0, error: error instanceof Error ? error.message : String(error) };
    }
  }, [content, selected, notes, documents]);

  const label = (property: string) => result.base?.labels.get(property) ?? property;
  const display = (value: unknown) => typeof value === 'string' ? value : value == null ? '—' : JSON.stringify(value);

  return <section className="w-full h-full overflow-auto p-4" aria-label="Base de notas">
    <div className="flex flex-wrap items-center gap-3 mb-4">
      {result.base && <select aria-label="Vista de la base" value={result.viewIndex}
        onChange={(event) => setSelected(Number(event.target.value))} className="bg-obsidian-card rounded p-2">
        {result.base.views.map((view, index) => <option key={index} value={index}>{view.name}</option>)}
      </select>}
      <button className="underline text-jade-300" onClick={() => setRefresh((value) => value + 1)}>Actualizar índice visible</button>
      {result.view && notes && <span className="text-sm text-obsidian-muted">{result.rows.length} de {result.count} notas</span>}
    </div>
    {(result.error || requestError) && <p role="alert" className="text-rose-300">{result.error || requestError}</p>}
    {!notes && !requestError && !result.error && <p role="status">Cargando propiedades…</p>}
    {result.view && notes && !requestError && (result.view.type === 'table'
      ? <table className="w-full text-left text-sm">
        <thead><tr><th className="p-2">Documento</th>{result.view.order.map((key) => <th key={key} className="p-2">{label(key)}</th>)}</tr></thead>
        <tbody>{result.rows.map(({ note, cells }) => <tr key={note.path} className="border-t border-obsidian-border">
          <th scope="row" className="p-2 font-normal"><button title={note.path} className="text-jade-300 underline" onClick={() => void openNote(note.path)}>{note.path}</button></th>
          {cells.map((value, index) => <td key={index} className="p-2 break-words">{display(value)}</td>)}
        </tr>)}</tbody>
      </table>
      : <ul className="space-y-3">{result.rows.map(({ note, cells }) => <li key={note.path} className="rounded border border-obsidian-border p-3">
        <button className="text-jade-300 underline" onClick={() => void openNote(note.path)}>{note.path}</button>
        <dl className="mt-2 grid grid-cols-2 gap-1 text-sm">{result.view!.order.map((key, index) => <React.Fragment key={key}>
          <dt className="text-obsidian-muted">{label(key)}</dt><dd>{display(cells[index])}</dd>
        </React.Fragment>)}</dl>
      </li>)}</ul>)}
  </section>;
}
