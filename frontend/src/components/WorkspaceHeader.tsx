import { useExportPanel } from './ExportPanel';
import { useProductivityStore } from '../store/useProductivityStore';
import { bindings, displayShortcut } from '../utils/commands';
import { usePaneState } from '../store/PaneContext';
import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Expand, ArrowUpRight,
  FileText,
  ChevronRight,
  Maximize2,
  Minimize2,
  PanelRight,
  PanelLeft,
  Clock,
  CheckCircle2,
  RefreshCw,
  Home,
} from 'lucide-react';

interface Props {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export const WorkspaceHeader: React.FC<Props> = ({ sidebarOpen, onToggleSidebar }) => {
  const {
    pane,
    navigateHistory,
    activePath,
    noteMode,
    setNoteMode,
    drafts,
    saveError,
    activeMetadata,
    isSaving,
    vault,
    zenMode,
    toggleZenMode,
    sidebarPosition,
  } = usePaneState();

  const shortcuts = useProductivityStore((state) => state.settings.shortcuts);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  if (!activePath) return null;

  const segments = activePath.split('/').filter(Boolean);
  const fileName = segments.at(-1) || activePath;
  const location = [vault?.name || 'Bóveda', ...segments.slice(0, -1)].join(' / ');

  const readingTimeMin = activeMetadata
    ? Math.max(1, Math.ceil(activeMetadata.word_count / 200))
    : 1;

  return (
    <div className="workspace-header min-h-10 bg-obsidian-bg border-b border-obsidian-border/60 px-2 py-1 flex items-center gap-x-2 gap-y-1 text-sm select-none shrink-0 z-20">
      <div className="flex shrink-0 gap-0.5">
        <button aria-label="Nota anterior" title={`Atrás ${bindings("back", shortcuts).map(displayShortcut).join(" / ")}`} disabled={!pane || pane.historyIndex <= 0} onClick={() => void navigateHistory(-1)} className="workspace-icon disabled:opacity-25"><ArrowLeft size={16} /></button>
        <button aria-label="Nota siguiente" title={`Adelante ${bindings("forward", shortcuts).map(displayShortcut).join(" / ")}`} disabled={!pane || pane.historyIndex >= pane.history.length - 1} onClick={() => void navigateHistory(1)} className="workspace-icon disabled:opacity-25"><ArrowRight size={16} /></button>
      </div>
      <div title={activePath} className="workspace-location flex flex-1 items-center gap-1.5 min-w-0">
        <span className="workspace-breadcrumb items-center gap-1 min-w-0 max-w-[40%] text-xs text-obsidian-muted">
          <Home size={14} className="shrink-0" />
          <span className="truncate">{location}</span>
          <ChevronRight size={14} className="shrink-0" />
        </span>
        <FileText size={16} className="shrink-0 text-jade-400" />
        <span className="truncate text-[15px] font-medium text-obsidian-text">{fileName}</span>
      </div>

      <div className="workspace-controls flex items-center gap-x-1 gap-y-1">
        {/* Save Status */}
        <div className="flex items-center gap-1 px-2 py-0.5 whitespace-nowrap rounded-full bg-obsidian-card border border-obsidian-border/50 text-xs text-obsidian-muted">
          {saveError ? <span className="text-rose-300">Error al guardar</span> : isSaving || Object.hasOwn(drafts, activePath) ? (
            <>
              <RefreshCw size={12} className="animate-spin text-jade-400" />
              <span className="text-jade-400">Guardando</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={12} className="text-jade-400" />
              <span>Guardado</span>
            </>
          )}
        </div>

        {/\.base$/i.test(activePath) && <button className="workspace-control text-jade-300" onClick={() => setNoteMode(noteMode === 'source' ? 'live' : 'source')}>
          {noteMode === 'source' ? 'Ver base' : 'Editar YAML'}
        </button>}
        {activePath.endsWith('.md') && !activePath.endsWith('.excalidraw.md') && <select
          aria-label="Modo de nota" value={noteMode}
          onChange={(event) => setNoteMode(event.target.value as typeof noteMode)}
          className="workspace-control bg-obsidian-card text-obsidian-text px-2 text-[13px]">
          <option value="live">Edición en vivo</option><option value="source">Código fuente</option>
          <option value="reading">Lectura</option><option value="split-preview">Fuente y lectura</option>
        </select>}
        {/* Word count & Reading estimate */}
        {activeMetadata && (
          <div className="workspace-reading-time items-center gap-1 px-1 whitespace-nowrap text-xs text-obsidian-muted">
            <Clock size={12} className="text-jade-500/80" />
            <span>~{readingTimeMin} min</span>
            <span className="text-obsidian-border">·</span>
            <span>{activeMetadata.word_count} palabras</span>
          </div>
        )}

        <button aria-label={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'} title="Pantalla completa" className="workspace-icon" onClick={() => {
          if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
          else void document.documentElement.requestFullscreen?.().catch(() => {});
        }}><Expand size={16} /></button>
        <button className="workspace-icon text-jade-300" title="Exportar documento" aria-label="Exportar documento" onClick={() => useExportPanel.getState().show()}><ArrowUpRight size={16} /></button>
        {/* Zen Mode Toggle */}
        <button
          onClick={toggleZenMode}
          title={zenMode ? 'Salir del Modo Enfoque' : 'Modo Enfoque / Zen (ocultar paneles)'}
          className={`workspace-icon transition ${
            zenMode ? 'text-jade-400 bg-jade-950/60' : 'text-obsidian-muted hover:text-white'
          }`}
        >
          {zenMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>

        {/* Sidebar Toggle Button */}
        <button
          onClick={onToggleSidebar}
          title={sidebarOpen ? 'Ocultar panel lateral' : 'Mostrar panel lateral'}
          className={`workspace-icon transition ${
            sidebarOpen ? 'text-jade-400' : 'text-obsidian-muted hover:text-white'
          }`}
        >
          {sidebarPosition === 'right' ? <PanelRight size={16} /> : <PanelLeft size={16} />}
        </button>
      </div>
    </div>
  );
};
