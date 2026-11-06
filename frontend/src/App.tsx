import { PublicationPanel } from './components/PublicationPanel';
import { ExportPanel } from './components/ExportPanel';
import { bindings, displayShortcut } from './utils/commands';
import { ProductivityPanel } from './components/ProductivityPanel';
import { useProductivityStore } from './store/useProductivityStore';
import { IntegrityPanel } from './components/IntegrityPanel';
import { CommandPalette } from './components/CommandPalette';
import { FileOperations } from './components/FileOperations';
import React, { useEffect, useState } from 'react';
import { useVaultStore, isExcalidrawFile } from './store/useVaultStore';
import { UnifiedSidebar } from './components/UnifiedSidebar';
import { WorkspaceHeader } from './components/WorkspaceHeader';
import { DocumentWorkspace } from './components/DocumentWorkspace';
import { DocumentView } from './components/DocumentView';
import { GraphView } from './components/GraphView';
import { SearchModal } from './components/SearchModal';
import { VaultModal } from './components/VaultModal';
import {
  Terminal, Trash2, CalendarDays,
  Columns2,
  HardDrive,
  Network,
  Search,
  Sparkles,
  X,
  Plus,
  FileText,
  LayoutGrid,
  Image as ImageIcon,
  Palette,
  FolderTree,
  ListTree,
  Link2,
  Maximize2,
  Minimize2,
} from 'lucide-react';

export const App: React.FC = () => {
  const {
    vault,
    activePath,
    activeContent,
    activeMetadata,
    openTabs,
    closeTab,
    openNote,
    createNewNote,
    createNewFolder,
    viewMode,
    setViewMode,
    noteMode,
    initializeVault,
    isLoading,
    saveError,
    noteError,
    noteLoadState,
    recoveryError,
    drafts,
    flushPendingSaves,
    setSearchOpen,
    knownExcalidrawNotes,
    sidebarPosition,
    activeInspectorTab,
    setActiveInspectorTab,
    zenMode,
    toggleZenMode,
  } = useVaultStore();

  const shortcutSettings = useProductivityStore((state) => state.settings.shortcuts);
  const paletteHint = bindings("palette", shortcutSettings).map(displayShortcut).join(" / ");
  const searchHint = bindings("search", shortcutSettings).map(displayShortcut).join(" / ");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(288);
  const [vaultModalOpen, setVaultModalOpen] = useState(false);

  useEffect(() => { void initializeVault(); }, [initializeVault]);
  useEffect(() => {
    const warnUnsaved = (event: BeforeUnloadEvent) => {
      if (Object.keys(useVaultStore.getState().drafts).length) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warnUnsaved);
    return () => window.removeEventListener('beforeunload', warnUnsaved);
  }, []);

  useEffect(() => {
    return window.jademdDesktop?.onCloseRequested(async () => {
      try {
        await useVaultStore.getState().flushPendingSaves();
        window.jademdDesktop?.readyToClose();
      } catch {
        alert('No se pudieron guardar todos los cambios. Resuelve el error de guardado antes de cerrar.');
      }
    });
  }, []);

  const handleCreateNoteRoot = () => {
    const name = prompt('Nombre de la nueva nota (ej: Mi Nota):');
    if (!name) return;
    const cleanName = name.endsWith('.md') ? name : `${name}.md`;
    createNewNote(cleanName);
  };

  const handleCreateCanvasRoot = () => {
    const name = prompt('Nombre del nuevo lienzo visual (ej: Mapa Mental):');
    if (!name) return;
    const cleanName = name.endsWith('.canvas') ? name : `${name}.canvas`;
    createNewNote(cleanName);
  };

  const handleCreateExcalidrawRoot = () => {
    const name = prompt('Nombre del dibujo Excalidraw (ej: Diagrama de Red):');
    if (!name) return;
    const cleanName = name.endsWith('.excalidraw.md')
      ? name
      : name.endsWith('.excalidraw')
      ? name
      : `${name}.excalidraw.md`;
    createNewNote(cleanName);
  };

  const handleToggleBacklinks = () => {
    if (sidebarOpen && activeInspectorTab === 'backlinks') {
      setSidebarOpen(false);
    } else {
      setActiveInspectorTab('backlinks');
      setSidebarOpen(true);
    }
  };

  // Activity Bar with direct tab switching and status controls
  const renderActivityBar = () => (
    <div
      className={`w-12 bg-obsidian-sidebar flex flex-col items-center py-3 gap-3 select-none flex-shrink-0 z-20 ${
        sidebarPosition === 'right'
          ? 'border-l border-obsidian-border'
          : 'border-r border-obsidian-border'
      }`}
    >
      {/* JadeMD Brand Logo */}
      <div className="w-8 h-8 rounded-lg bg-jade-600 flex items-center justify-center font-bold text-white shadow-lg shadow-jade-950/50">
        J
      </div>

      <div className="w-6 h-px bg-obsidian-border my-1" />

      {/* Explorer / Vault Tab Toggle */}
      <button
        onClick={() => {
          if (sidebarOpen && activeInspectorTab === 'tree') {
            setSidebarOpen(false);
          } else {
            setActiveInspectorTab('tree');
            setSidebarOpen(true);
          }
        }}
        title="Explorador de Bóveda"
        className={`p-2 rounded-lg transition ${
          sidebarOpen && activeInspectorTab === 'tree'
            ? 'text-jade-400 bg-obsidian-card shadow-sm border border-jade-500/30'
            : 'text-obsidian-muted hover:text-white hover:bg-obsidian-hover'
        }`}
      >
        <FolderTree size={18} />
      </button>

      {/* Outline Tab Toggle */}
      <button
        onClick={() => {
          if (sidebarOpen && activeInspectorTab === 'outline') {
            setSidebarOpen(false);
          } else {
            setActiveInspectorTab('outline');
            setSidebarOpen(true);
          }
        }}
        title="Esquema / Índice del Documento"
        className={`p-2 rounded-lg transition ${
          sidebarOpen && activeInspectorTab === 'outline'
            ? 'text-jade-400 bg-obsidian-card shadow-sm border border-jade-500/30'
            : 'text-obsidian-muted hover:text-white hover:bg-obsidian-hover'
        }`}
      >
        <ListTree size={18} />
      </button>

      {/* Backlinks Tab Toggle */}
      <button
        onClick={() => {
          if (sidebarOpen && activeInspectorTab === 'backlinks') {
            setSidebarOpen(false);
          } else {
            setActiveInspectorTab('backlinks');
            setSidebarOpen(true);
          }
        }}
        title="Enlaces Entrantes (Backlinks)"
        className={`p-2 rounded-lg transition ${
          sidebarOpen && activeInspectorTab === 'backlinks'
            ? 'text-jade-400 bg-obsidian-card shadow-sm border border-jade-500/30'
            : 'text-obsidian-muted hover:text-white hover:bg-obsidian-hover'
        }`}
      >
        <Link2 size={18} />
      </button>

      <button onClick={() => useVaultStore.getState().setCommandPaletteOpen(true)} title={`Paleta de comandos ${paletteHint}`} aria-label="Paleta de comandos" className="p-2 text-obsidian-muted hover:text-white rounded-lg"><Terminal size={18} /></button>
      <button onClick={() => useProductivityStore.getState().show()} title="Productividad y atajos" aria-label="Productividad y atajos" className="p-2 text-obsidian-muted hover:text-white rounded-lg"><CalendarDays size={18} /></button>
      <button onClick={() => useVaultStore.getState().setTrashOpen(true)} title="Papelera" aria-label="Papelera" className="p-2 text-obsidian-muted hover:text-white rounded-lg"><Trash2 size={18} /></button>
      {/* Search */}
      <button
        onClick={() => setSearchOpen(true)}
        title={`Buscar en la bóveda ${searchHint}`}
        className="p-2 text-obsidian-muted hover:text-white hover:bg-obsidian-hover rounded-lg transition"
      >
        <Search size={18} />
      </button>

      {/* Graph View Toggle */}
      <button
        onClick={() => setViewMode(viewMode === 'graph' ? 'editor' : 'graph')}
        title="Vista de Grafo (Graph View)"
        className={`p-2 rounded-lg transition ${
          viewMode === 'graph'
            ? 'text-jade-400 bg-obsidian-card shadow-sm border border-jade-500/30'
            : 'text-obsidian-muted hover:text-white hover:bg-obsidian-hover'
        }`}
      >
        <Network size={18} />
      </button>

      {/* Split Mode Toggle */}
      <button
        onClick={() => setViewMode(viewMode === 'split' ? 'editor' : 'split')}
        title="Modo Dividido (Editor + Grafo)"
        className={`p-2 rounded-lg transition ${
          viewMode === 'split'
            ? 'text-jade-400 bg-obsidian-card shadow-sm border border-jade-500/30'
            : 'text-obsidian-muted hover:text-white hover:bg-obsidian-hover'
        }`}
      >
        <Columns2 size={18} />
      </button>

      <div className="mt-auto flex flex-col gap-2">
        {/* Zen Mode Toggle */}
        <button
          onClick={toggleZenMode}
          title={zenMode ? 'Salir del Modo Enfoque' : 'Modo Enfoque / Zen'}
          className={`p-2 rounded-lg transition ${
            zenMode
              ? 'text-jade-400 bg-jade-950/80 border border-jade-500/40 shadow-sm'
              : 'text-obsidian-muted hover:text-white hover:bg-obsidian-hover'
          }`}
        >
          {zenMode ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>

        {/* Vault Switcher */}
        <button
          onClick={() => setVaultModalOpen(true)}
          title="Abrir o cambiar de Bóveda"
          className="p-2 text-obsidian-muted hover:text-white hover:bg-obsidian-hover rounded-lg transition"
        >
          <HardDrive size={18} />
        </button>
      </div>
    </div>
  );

  const welcome = (
                <div className="flex-1 flex flex-col items-center justify-center text-obsidian-muted select-none">
                  <div className="w-16 h-16 rounded-2xl bg-jade-950/60 border border-jade-800/40 flex items-center justify-center text-jade-400 mb-4 shadow-xl">
                    <Sparkles size={32} />
                  </div>
                  <h2 className="text-xl font-semibold text-obsidian-text mb-2">Jademd</h2>
                  <p className="text-xs text-obsidian-muted max-w-sm text-center mb-6">
                    Entorno de conocimiento modular impulsado por Rust y CodeMirror 6.
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    <button
                      onClick={handleCreateNoteRoot}
                      className="px-4 py-2 bg-jade-600 hover:bg-jade-500 text-white rounded-lg text-xs font-medium transition shadow-sm"
                    >
                      + Nueva Nota
                    </button>
                    <button
                      onClick={handleCreateCanvasRoot}
                      className="px-4 py-2 bg-obsidian-card hover:bg-obsidian-hover text-obsidian-text border border-obsidian-border rounded-lg text-xs font-medium transition shadow-sm"
                    >
                      + Nuevo Lienzo (.canvas)
                    </button>
                    <button
                      onClick={handleCreateExcalidrawRoot}
                      className="px-4 py-2 bg-obsidian-card hover:bg-obsidian-hover text-obsidian-text border border-obsidian-border rounded-lg text-xs font-medium transition shadow-sm flex items-center gap-1.5"
                    >
                      <Palette size={14} className="text-purple-400" />
                      <span>+ Nuevo Dibujo (Excalidraw)</span>
                    </button>
                    <button
                      onClick={() => setViewMode('graph')}
                      className="px-4 py-2 bg-obsidian-card hover:bg-obsidian-hover text-obsidian-text border border-obsidian-border rounded-lg text-xs font-medium transition shadow-sm"
                    >
                      Ver Grafo
                    </button>
                  </div>
                </div>
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-obsidian-bg text-obsidian-text font-sans antialiased">
      {/* Left-docked elements (When sidebarPosition === 'left' and not in Zen Mode) */}
      {!zenMode && sidebarPosition === 'left' && (
        <>
          {renderActivityBar()}
          {sidebarOpen && (
            <UnifiedSidebar
              width={sidebarWidth}
              onResize={setSidebarWidth}
              onClose={() => setSidebarOpen(false)}
              onOpenVaultModal={() => setVaultModalOpen(true)}
            />
          )}
        </>
      )}

      <IntegrityPanel />
      <ProductivityPanel />
      <ExportPanel />
      <PublicationPanel />
      {/* Main Workspace Area (Center / Left) */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-obsidian-bg min-h-0 relative">
        {(saveError || recoveryError || Object.keys(drafts).length > 0) && (
          <div role={saveError || recoveryError ? 'alert' : 'status'} className="px-4 py-2 text-xs bg-amber-950/50 text-amber-200 flex items-center justify-between gap-3">
            <span>{saveError || recoveryError || `${Object.keys(drafts).length} documento(s) con cambios pendientes o recuperados.`}</span>
            <button disabled={isLoading} className="underline flex-shrink-0" onClick={() => void flushPendingSaves().catch(() => {})}>Guardar pendientes / reintentar</button>
          </div>
        )}
        {noteError && noteLoadState !== 'error' && <p role="alert" className="px-4 py-2 text-sm text-rose-300">{noteError}</p>}
        {!vault && !isLoading && <button className="p-3 text-jade-300 underline" onClick={() => setVaultModalOpen(true)}>Abrir una bóveda</button>}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {viewMode !== 'graph' && <DocumentWorkspace sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} onToggleBacklinks={handleToggleBacklinks}
              backlinksOpen={sidebarOpen && activeInspectorTab === 'backlinks'} onCreateNote={handleCreateNoteRoot} emptyState={welcome} />}
          {viewMode !== 'editor' && <div className={viewMode === 'split' ? 'w-1/2 min-w-0 h-full' : 'flex-1 min-w-0 h-full'}><GraphView /></div>}
        </div>

        {/* Bottom Status Bar */}
        <div className="h-6 bg-obsidian-sidebar border-t border-obsidian-border flex items-center justify-between px-3 text-2xs text-obsidian-muted select-none flex-shrink-0">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-jade-400" />
              <span>{isLoading ? 'Conectando…' : vault ? `Bóveda: ${vault.name}` : 'Sin bóveda conectada'}</span>
            </span>
            {activePath && (
              <span className="truncate max-w-md">
                Nota: <strong className="text-obsidian-text">{activePath}</strong>
              </span>
            )}
          </div>

          <div className="flex items-center gap-4">
            <span className="text-jade-400/90 font-mono text-3xs">
              Dock: {sidebarPosition === 'right' ? 'Derecha' : 'Izquierda'}
            </span>
            {activeMetadata && (
              <>
                <span>{activeMetadata.word_count} palabras</span>
                <span>{activeMetadata.character_count} caracteres</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right-docked elements (When sidebarPosition === 'right' and not in Zen Mode) */}
      {!zenMode && sidebarPosition === 'right' && (
        <>
          {sidebarOpen && (
            <UnifiedSidebar
              width={sidebarWidth}
              onResize={setSidebarWidth}
              onClose={() => setSidebarOpen(false)}
              onOpenVaultModal={() => setVaultModalOpen(true)}
            />
          )}
          {renderActivityBar()}
        </>
      )}

      <CommandPalette />
      <FileOperations />
      {/* Modals */}
      <SearchModal />
      <VaultModal open={vaultModalOpen || (!vault && !isLoading)} onClose={() => setVaultModalOpen(false)} />
    </div>
  );
};
