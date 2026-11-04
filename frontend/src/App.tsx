import React, { useEffect, useState } from 'react';
import { useVaultStore } from './store/useVaultStore';
import { FileTree } from './components/FileTree';
import { CodeMirrorEditor } from './editor/CodeMirrorEditor';
import { MarkdownPreview } from './components/MarkdownPreview';
import { ImageViewer } from './components/ImageViewer';
import { GraphView } from './components/GraphView';
import { CanvasView } from './components/CanvasView';
import { BacklinksPanel } from './components/BacklinksPanel';
import { SearchModal } from './components/SearchModal';
import { VaultModal } from './components/VaultModal';
import {
  Columns2,
  FilePlus,
  FolderPlus,
  FolderSync,
  HardDrive,
  Info,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Sparkles,
  X,
  FileText,
  LayoutGrid,
  Image as ImageIcon
} from 'lucide-react';

export const App: React.FC = () => {
  const {
    vault,
    tree,
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
    setNoteMode,
    isSaving,
    openLocalVault,
    setSearchOpen,
  } = useVaultStore();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [backlinksOpen, setBacklinksOpen] = useState(true);
  const [vaultModalOpen, setVaultModalOpen] = useState(false);

  // Auto-connect to vault if exists on startup
  useEffect(() => {
    // If no vault open, try default local vault
    if (!vault) {
      // Check if user has an existing notes directory or open our sample vault
      openLocalVault('/mnt/dm-0/RECURSOS/RAIZ/RAIZ', 'RAIZ').catch(() => {
        // Fallback to sample notes in project folder
        openLocalVault('./demo_vault', 'Bóveda Jademd');
      });
    }
  }, []);

  const handleCreateNoteRoot = () => {
    const name = prompt('Nombre de la nueva nota (ej: Mi Nota):');
    if (!name) return;
    const cleanName = name.endsWith('.md') ? name : `${name}.md`;
    createNewNote(cleanName);
  };

  const handleCreateFolderRoot = () => {
    const name = prompt('Nombre de la nueva carpeta:');
    if (!name) return;
    createNewFolder(name);
  };

  const handleCreateCanvasRoot = () => {
    const name = prompt('Nombre del nuevo lienzo visual (ej: Mapa Mental):');
    if (!name) return;
    const cleanName = name.endsWith('.canvas') ? name : `${name}.canvas`;
    createNewNote(cleanName);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-obsidian-bg text-obsidian-text">
      {/* Activity Bar (Icons on Left Edge) */}
      <div className="w-12 bg-obsidian-sidebar border-r border-obsidian-border flex flex-col items-center py-3 gap-3 select-none flex-shrink-0 z-20">
        {/* JadeMD Brand Logo */}
        <div className="w-8 h-8 rounded-lg bg-jade-600 flex items-center justify-center font-bold text-white shadow-lg shadow-jade-950/50">
          J
        </div>

        <div className="w-6 h-px bg-obsidian-border my-1" />

        {/* Sidebar Toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          title={sidebarOpen ? 'Ocultar explorador' : 'Mostrar explorador'}
          className={`p-2 rounded-lg transition ${
            sidebarOpen ? 'text-jade-400 bg-obsidian-card' : 'text-obsidian-muted hover:text-white hover:bg-obsidian-hover'
          }`}
        >
          {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>

        {/* Search */}
        <button
          onClick={() => setSearchOpen(true)}
          title="Buscar en la bóveda (Ctrl + O)"
          className="p-2 text-obsidian-muted hover:text-white hover:bg-obsidian-hover rounded-lg transition"
        >
          <Search size={18} />
        </button>

        {/* Graph View Toggle */}
        <button
          onClick={() => setViewMode(viewMode === 'graph' ? 'editor' : 'graph')}
          title="Vista de Grafo (Graph View)"
          className={`p-2 rounded-lg transition ${
            viewMode === 'graph' ? 'text-jade-400 bg-obsidian-card' : 'text-obsidian-muted hover:text-white hover:bg-obsidian-hover'
          }`}
        >
          <Network size={18} />
        </button>

        {/* Split Mode Toggle */}
        <button
          onClick={() => setViewMode(viewMode === 'split' ? 'editor' : 'split')}
          title="Modo Dividido (Editor + Grafo)"
          className={`p-2 rounded-lg transition ${
            viewMode === 'split' ? 'text-jade-400 bg-obsidian-card' : 'text-obsidian-muted hover:text-white hover:bg-obsidian-hover'
          }`}
        >
          <Columns2 size={18} />
        </button>

        <div className="mt-auto flex flex-col gap-2">
          {/* Backlinks Panel Toggle */}
          <button
            onClick={() => setBacklinksOpen(!backlinksOpen)}
            title="Panel de información y enlaces entrantes"
            className={`p-2 rounded-lg transition ${
              backlinksOpen ? 'text-jade-400 bg-obsidian-card' : 'text-obsidian-muted hover:text-white hover:bg-obsidian-hover'
            }`}
          >
            <Info size={18} />
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

      {/* Left Sidebar (File Explorer) */}
      {sidebarOpen && (
        <div className="w-64 bg-obsidian-sidebar border-r border-obsidian-border flex flex-col h-full select-none flex-shrink-0 animate-in slide-in-from-left-4 duration-150">
          {/* Vault Info Header */}
          <div className="p-3 border-b border-obsidian-border flex items-center justify-between">
            <div className="truncate">
              <div className="text-xs font-semibold text-obsidian-text truncate flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-jade-500 animate-pulse" />
                <span>{vault?.name || 'Cargando bóveda...'}</span>
              </div>
              <div className="text-2xs text-obsidian-muted truncate mt-0.5" title={vault?.path}>
                {vault?.storage_type === 'webdav' ? 'Nube (WebDAV)' : vault?.path || 'Local'}
              </div>
            </div>

            <button
              onClick={() => setVaultModalOpen(true)}
              title="Cambiar Bóveda"
              className="p-1 text-obsidian-muted hover:text-white rounded hover:bg-obsidian-hover"
            >
              <FolderSync size={14} />
            </button>
          </div>

          {/* Quick Toolbar */}
          <div className="px-3 py-2 border-b border-obsidian-border/50 flex items-center justify-between text-xs text-obsidian-muted">
            <span className="uppercase tracking-wider font-semibold text-2xs">Archivos</span>
            <div className="flex items-center gap-1">
              <button
                onClick={handleCreateNoteRoot}
                title="Nueva Nota Markdown"
                className="p-1 hover:text-jade-400 hover:bg-obsidian-hover rounded"
              >
                <FilePlus size={14} />
              </button>
              <button
                onClick={handleCreateCanvasRoot}
                title="Nuevo Lienzo Visual (.canvas)"
                className="p-1 hover:text-jade-400 hover:bg-obsidian-hover rounded"
              >
                <LayoutGrid size={14} />
              </button>
              <button
                onClick={handleCreateFolderRoot}
                title="Nueva Carpeta"
                className="p-1 hover:text-jade-400 hover:bg-obsidian-hover rounded"
              >
                <FolderPlus size={14} />
              </button>
            </div>
          </div>

          {/* Tree View */}
          <div className="flex-1 overflow-y-auto p-2">
            {tree ? (
              <FileTree node={tree} />
            ) : (
              <div className="text-center py-8 text-xs text-obsidian-muted">
                No hay archivos en la bóveda activa.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-obsidian-bg">
        {/* Tabs Bar */}
        <div className="h-10 bg-obsidian-sidebar border-b border-obsidian-border flex items-center px-2 gap-1 overflow-x-auto select-none flex-shrink-0">
          {openTabs.map((tabPath) => {
            const isActive = tabPath === activePath;
            const isImg = /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico)$/i.test(tabPath);
            const isCanvas = tabPath.endsWith('.canvas');
            const tabTitle = tabPath.replace(/\.md$/, '').split('/').pop() || tabPath;

            return (
              <div
                key={tabPath}
                onClick={() => openNote(tabPath)}
                className={`group flex items-center gap-2 px-3 py-1.5 rounded-t-md text-xs cursor-pointer transition border-b-2 ${
                  isActive
                    ? 'bg-obsidian-bg text-obsidian-text border-jade-500 font-medium'
                    : 'text-obsidian-muted hover:text-obsidian-text hover:bg-obsidian-hover border-transparent'
                }`}
              >
                {isImg ? (
                  <ImageIcon size={13} className={isActive ? 'text-sky-400' : 'text-obsidian-muted'} />
                ) : isCanvas ? (
                  <LayoutGrid size={13} className={isActive ? 'text-jade-400' : 'text-obsidian-muted'} />
                ) : (
                  <FileText size={13} className={isActive ? 'text-jade-400' : 'text-obsidian-muted'} />
                )}
                <span className="truncate max-w-[150px]">{tabTitle}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tabPath);
                  }}
                  className="p-0.5 rounded-full hover:bg-obsidian-border text-obsidian-muted hover:text-white"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}

          {openTabs.length === 0 && (
            <div className="text-2xs text-obsidian-muted px-3 italic">
              Ninguna nota abierta. Selecciona una en el explorador o pulsa Ctrl+O para buscar.
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Main View Area */}
          <div className="flex-1 flex overflow-hidden">
            {viewMode === 'editor' && (
              activePath ? (
                activePath.endsWith('.canvas') ? (
                  <CanvasView />
                ) : /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico)$/i.test(activePath) ? (
                  <ImageViewer path={activePath} />
                ) : noteMode === 'reading' ? (
                  <MarkdownPreview content={activeContent} path={activePath} />
                ) : noteMode === 'split-preview' ? (
                  <div className="flex-1 flex h-full overflow-hidden">
                    <div className="w-1/2 h-full border-r border-obsidian-border">
                      <CodeMirrorEditor initialContent={activeContent} path={activePath} />
                    </div>
                    <div className="w-1/2 h-full">
                      <MarkdownPreview content={activeContent} path={activePath} />
                    </div>
                  </div>
                ) : (
                  <CodeMirrorEditor initialContent={activeContent} path={activePath} />
                )
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-obsidian-muted select-none">
                  <div className="w-16 h-16 rounded-2xl bg-jade-950/60 border border-jade-800/40 flex items-center justify-center text-jade-400 mb-4 shadow-xl">
                    <Sparkles size={32} />
                  </div>
                  <h2 className="text-xl font-semibold text-obsidian-text mb-2">Jademd</h2>
                  <p className="text-xs text-obsidian-muted max-w-sm text-center mb-6">
                    Entorno de conocimiento modular impulsado por Rust y CodeMirror 6.
                  </p>
                  <div className="flex gap-3">
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
                      onClick={() => setViewMode('graph')}
                      className="px-4 py-2 bg-obsidian-card hover:bg-obsidian-hover text-obsidian-text border border-obsidian-border rounded-lg text-xs font-medium transition shadow-sm"
                    >
                      Ver Grafo
                    </button>
                  </div>
                </div>
              )
            )}

            {viewMode === 'graph' && <GraphView />}

            {viewMode === 'split' && (
              <>
                <div className="w-1/2 h-full border-r border-obsidian-border">
                  {activePath ? (
                    activePath.endsWith('.canvas') ? (
                      <CanvasView />
                    ) : /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico)$/i.test(activePath) ? (
                      <ImageViewer path={activePath} />
                    ) : noteMode === 'reading' ? (
                      <MarkdownPreview content={activeContent} path={activePath} />
                    ) : (
                      <CodeMirrorEditor initialContent={activeContent} path={activePath} />
                    )
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-obsidian-muted">
                      Selecciona una nota para editar
                    </div>
                  )}
                </div>
                <div className="w-1/2 h-full">
                  <GraphView />
                </div>
              </>
            )}
          </div>

          {/* Right Info / Backlinks Panel */}
          {backlinksOpen && activePath && <BacklinksPanel />}
        </div>

        {/* Bottom Status Bar */}
        <div className="h-6 bg-obsidian-sidebar border-t border-obsidian-border flex items-center justify-between px-3 text-2xs text-obsidian-muted select-none flex-shrink-0">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-jade-400" />
              <span>Rust Core: Activo (Axum + OpenDAL)</span>
            </span>
            {activePath && (
              <span className="truncate max-w-md">
                Nota: <strong className="text-obsidian-text">{activePath}</strong>
              </span>
            )}
          </div>

          <div className="flex items-center gap-4">
            {isSaving ? (
              <span className="text-jade-400">Guardando...</span>
            ) : (
              <span>Guardado automático</span>
            )}
            {activeMetadata && (
              <>
                <span>{activeMetadata.word_count} palabras</span>
                <span>{activeMetadata.character_count} caracteres</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <SearchModal />
      <VaultModal open={vaultModalOpen} onClose={() => setVaultModalOpen(false)} />
    </div>
  );
};
