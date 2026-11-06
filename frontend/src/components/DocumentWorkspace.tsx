import React, { useRef, useState } from 'react';
import { clampRatio, readSavedWorkspaces, resizeSplit, SplitTree, writeSavedWorkspaces } from '../utils/workspace';
import { PaneContext, usePaneState } from '../store/PaneContext';
import { useVaultStore } from '../store/useVaultStore';
import { DocumentView } from './DocumentView';
import { WorkspaceHeader } from './WorkspaceHeader';
import { Pin, Plus, X, Columns2, Rows2, LayoutTemplate } from 'lucide-react';

interface Props { sidebarOpen: boolean; onToggleSidebar: () => void; onToggleBacklinks: () => void; backlinksOpen: boolean; onCreateNote: () => void; emptyState: React.ReactNode }
function Pane({ sidebarOpen, onToggleSidebar, onToggleBacklinks, backlinksOpen, onCreateNote, emptyState, onLayouts }: Props & { onLayouts: () => void }) {
  const state = usePaneState();
  const pane = state.pane!;
  return <section data-pane-id={pane.id} aria-label={`Panel ${state.panes.indexOf(pane) + 1}`}
    onPointerDownCapture={() => state.focusPane(pane.id)} onFocusCapture={() => state.focusPane(pane.id)}
    className={`workspace-pane flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden border border-obsidian-border ${state.activePaneId === pane.id ? 'outline outline-1 -outline-offset-1 outline-jade-700/50' : ''}`}>
    <div role="tablist" className="workspace-tabs h-11 flex items-center bg-obsidian-sidebar px-1 gap-1 shrink-0 overflow-x-auto">
      <div className="flex-1 flex gap-1 overflow-x-auto min-w-0">
        {pane.tabs.map((path) => <div key={path} draggable onDragStart={(event) => event.dataTransfer.setData('text/jademd-tab', path)}
          onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); state.reorderTab(event.dataTransfer.getData('text/jademd-tab'), path, pane.id); }}
          className={`flex items-center gap-0.5 rounded pl-2 pr-1 border-b-2 text-[13px] shrink-0 ${pane.activePath === path ? 'bg-obsidian-bg text-jade-300 border-jade-500' : 'text-obsidian-muted border-transparent'}`}>
          <button role="tab" aria-selected={pane.activePath === path} onClick={() => void state.openNote(path)} className="workspace-control max-w-48 truncate pr-1 text-left" title={path}>{path.split('/').pop()?.replace(/\.md$/, '')}</button>
          <button aria-label={`${pane.pinned.includes(path) ? 'Desfijar' : 'Fijar'} ${path}`} title="Fijar/desfijar pestaña" onClick={() => state.togglePinTab(path, pane.id)} className={`workspace-icon ${pane.pinned.includes(path) ? 'text-jade-300' : 'text-obsidian-muted'}`}><Pin size={16} /></button>
          {!pane.pinned.includes(path) && <button aria-label={`Cerrar ${path}`} className="workspace-icon" onClick={() => state.closeTab(path)}><X size={16} /></button>}
        </div>)}
      </div>
      <button title="Nueva nota" aria-label="Nueva nota" className="workspace-icon text-obsidian-muted" onClick={() => { state.focusPane(pane.id); onCreateNote(); }}><Plus size={16} /></button>
      <button title="Dividir a la derecha" aria-label="Dividir a la derecha" disabled={state.panes.length >= 4} className="workspace-icon text-obsidian-muted disabled:opacity-25" onClick={() => state.splitPane('horizontal', pane.id)}><Columns2 size={16} /></button>
      <button title="Dividir abajo" aria-label="Dividir abajo" disabled={state.panes.length >= 4} className="workspace-icon text-obsidian-muted disabled:opacity-25" onClick={() => state.splitPane('vertical', pane.id)}><Rows2 size={16} /></button>
      <button title="Espacios guardados" aria-label="Espacios guardados" className="workspace-icon text-obsidian-muted" onClick={onLayouts}><LayoutTemplate size={16} /></button>
      {state.panes.length > 1 && <button aria-label="Cerrar panel" className="workspace-icon text-obsidian-muted" onClick={() => state.closePane(pane.id)}><X size={16} /></button>}
    </div>
    {pane.activePath && <WorkspaceHeader sidebarOpen={sidebarOpen} onToggleSidebar={onToggleSidebar} />}
    <div className="flex-1 flex min-h-0 overflow-hidden">{pane.activePath ? <DocumentView onToggleBacklinks={onToggleBacklinks} backlinksOpen={backlinksOpen} /> : emptyState}</div>
  </section>;
}

interface Rect { x: number; y: number; width: number; height: number }

function position(rect: Rect): React.CSSProperties {
  return { position: 'absolute', left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.width}%`, height: `${rect.height}%` };
}

function WorkspaceLayouts({ vaultId, onClose }: { vaultId: string; onClose: () => void }) {
  const [saved, setSaved] = useState(() => readSavedWorkspaces(vaultId));
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const snapshot = () => {
    const { panes, splitTree, activePaneId, noteModes } = useVaultStore.getState();
    return { panes, splitTree, activePaneId, noteModes };
  };
  const persist = (next: typeof saved) => {
    writeSavedWorkspaces(vaultId, next);
    setSaved(next);
  };
  const run = async (action: () => void | Promise<void>) => {
    setBusy(true);
    setError('');
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : 'No se pudo gestionar el espacio'); }
    finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4">
    <section role="dialog" aria-modal="true" aria-label="Espacios guardados"
      className="w-full max-w-lg max-h-[85vh] overflow-auto rounded-xl bg-obsidian-card border border-obsidian-border p-5"
      onKeyDown={(event) => { if (event.key === 'Escape' && !busy) onClose(); }}>
      <h2 className="font-semibold mb-3">Espacios guardados</h2>
      <form className="flex gap-2" onSubmit={(event) => {
        event.preventDefault();
        void run(() => {
          const label = name.trim();
          if (!label) throw new Error('Escribe un nombre');
          if (saved.some((entry) => entry.name.toLowerCase() === label.toLowerCase())) throw new Error('Ya existe ese nombre. Usa Actualizar para reemplazar el diseño.');
          if (saved.length >= 20) throw new Error('Se pueden guardar hasta 20 espacios por bóveda');
          persist([...saved, { name: label, layout: snapshot() }]);
          setName('');
        });
      }}>
        <input autoFocus aria-label="Nombre del espacio" value={name} maxLength={80} onChange={(event) => setName(event.target.value)}
          className="flex-1 min-w-0 rounded bg-obsidian-bg border border-obsidian-border p-2" />
        <button disabled={busy || !name.trim()} className="rounded bg-jade-700 px-3 disabled:opacity-50">Guardar actual</button>
      </form>
      <ul className="my-3">
        {saved.map((entry, index) => <li key={entry.name} className="flex flex-wrap gap-3 items-center border-b border-obsidian-border py-2 text-sm">
          <span className="flex-1 break-all">{entry.name}</span>
          <button disabled={busy} className="underline text-jade-300" onClick={() => void run(async () => {
            await useVaultStore.getState().restoreWorkspace(entry.layout);
            onClose();
          })}>Abrir</button>
          <button disabled={busy} className="underline" onClick={() => void run(() => persist(saved.map((item, at) => at === index ? { ...item, layout: snapshot() } : item)))}>Actualizar</button>
          <button disabled={busy} className="text-rose-300" onClick={() => void run(() => persist(saved.filter((_, at) => at !== index)))}>Eliminar</button>
        </li>)}
      </ul>
      {error && <p role="alert" className="mb-3 text-sm text-rose-300">{error}</p>}
      <button disabled={busy} onClick={onClose}>Cerrar</button>
    </section>
  </div>;
}

export function DocumentWorkspace(props: Props) {
  const { splitTree, resizePaneSplit, vault } = useVaultStore();
  const container = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; pointer: number; start: number; length: number; origin: number; ratio: number } | null>(null);
  const [preview, setPreview] = useState<{ id: string; ratio: number } | null>(null);
  const [layoutsOpen, setLayoutsOpen] = useState(false);

  // Position leaves as siblings so changing the tree keeps existing editors mounted.
  const leaves: React.ReactNode[] = [];
  const dividers: React.ReactNode[] = [];
  function place(tree: SplitTree, rect: Rect) {
    if ('paneId' in tree) {
      leaves.push(<div key={tree.paneId} className="flex overflow-hidden" style={position(rect)}>
        <PaneContext.Provider value={tree.paneId}><Pane {...props} onLayouts={() => setLayoutsOpen(true)} /></PaneContext.Provider>
      </div>);
      return;
    }
    const horizontal = tree.direction === 'horizontal';
    const width = rect.width * tree.ratio;
    const height = rect.height * tree.ratio;
    place(tree.first, horizontal ? { ...rect, width } : { ...rect, height });
    place(tree.second, horizontal
      ? { ...rect, x: rect.x + width, width: rect.width - width }
      : { ...rect, y: rect.y + height, height: rect.height - height });
    const coordinate = (event: React.PointerEvent) => horizontal ? event.clientX : event.clientY;
    const finish = (event: React.PointerEvent, commit: boolean) => {
      const current = drag.current;
      if (!current || current.pointer !== event.pointerId) return;
      drag.current = null;
      setPreview(null);
      if (commit) resizePaneSplit(current.id, current.ratio);
    };
    dividers.push(<div key={tree.id} role="separator" tabIndex={0} aria-label="Redimensionar paneles"
      aria-orientation={horizontal ? 'vertical' : 'horizontal'} aria-valuemin={15} aria-valuemax={85}
      aria-valuenow={Math.round(tree.ratio * 100)}
      className={`absolute z-30 touch-none bg-obsidian-border/30 hover:bg-jade-600/60 focus:bg-jade-600/60 ${horizontal ? 'cursor-col-resize' : 'cursor-row-resize'}`}
      style={horizontal
        ? { left: `calc(${rect.x + width}% - 4px)`, top: `${rect.y}%`, height: `${rect.height}%`, width: 8 }
        : { top: `calc(${rect.y + height}% - 4px)`, left: `${rect.x}%`, width: `${rect.width}%`, height: 8 }}
      onPointerDown={(event) => {
        if (event.button !== 0 || drag.current || !container.current) return;
        const bounds = container.current.getBoundingClientRect();
        const length = horizontal ? bounds.width * rect.width / 100 : bounds.height * rect.height / 100;
        if (!length) return;
        drag.current = { id: tree.id, pointer: event.pointerId, start: coordinate(event), length, origin: tree.ratio, ratio: tree.ratio };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current || current.id !== tree.id || current.pointer !== event.pointerId) return;
        current.ratio = clampRatio(current.origin + (coordinate(event) - current.start) / current.length);
        setPreview({ id: current.id, ratio: current.ratio });
      }}
      onPointerUp={(event) => finish(event, true)}
      onPointerCancel={(event) => finish(event, false)}
      onLostPointerCapture={(event) => finish(event, false)}
      onDoubleClick={() => resizePaneSplit(tree.id, 0.5)}
      onKeyDown={(event) => {
        const backward = horizontal ? 'ArrowLeft' : 'ArrowUp';
        const forward = horizontal ? 'ArrowRight' : 'ArrowDown';
        if (![backward, forward, 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const ratio = event.key === 'Home' ? 0.15 : event.key === 'End' ? 0.85
          : tree.ratio + (event.key === backward ? -0.05 : 0.05);
        resizePaneSplit(tree.id, ratio);
      }}
    />);
  }
  place(preview ? resizeSplit(splitTree, preview.id, preview.ratio) : splitTree, { x: 0, y: 0, width: 100, height: 100 });
  return <div ref={container} className="relative flex-1 min-h-0 min-w-0">
    {leaves}
    {dividers}
    {layoutsOpen && vault && <WorkspaceLayouts key={vault.id} vaultId={vault.id} onClose={() => setLayoutsOpen(false)} />}
  </div>;
}
