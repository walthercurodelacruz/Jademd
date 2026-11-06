import { ConnectionsPanel } from './ConnectionsPanel';
import { PropertiesEditor } from './PropertiesEditor';
import React from 'react';
import { useVaultStore } from '../store/useVaultStore';
import { FileTree } from './FileTree';
import {
  FolderTree,
  ListTree,
  Link2,
  Info,
  FolderSync,
  FilePlus,
  LayoutGrid,
  Palette,
  FolderPlus,
  ArrowLeftRight,
  PanelRightClose,
  PanelLeftClose,
  FileText,
  Tag,
  Clock,
  Hash,
  ExternalLink,
} from 'lucide-react';

interface Props {
  width: number;
  onResize: (width: number) => void;
  onClose: () => void;
  onOpenVaultModal: () => void;
}

export const UnifiedSidebar: React.FC<Props> = ({ width, onResize, onClose, onOpenVaultModal }) => {
  const drag = React.useRef<{ pointer: number; x: number; width: number } | null>(null);
  const {
    vault,
    tree,
    activePath,
    activeContent,
    activeMetadata,
    backlinks,
    openNote,
    createNewNote,
    createNewFolder,
    sidebarPosition,
    setSidebarPosition,
    activeInspectorTab,
    setActiveInspectorTab,
    loadTree,
  } = useVaultStore();

  const handleCreateNote = () => {
    const name = prompt('Nombre de la nueva nota (ej: Mi Nota):');
    if (!name) return;
    const cleanName = name.endsWith('.md') ? name : `${name}.md`;
    createNewNote(cleanName);
  };

  const handleCreateFolder = () => {
    const name = prompt('Nombre de la nueva carpeta:');
    if (!name) return;
    createNewFolder(name);
  };

  const handleCreateCanvas = () => {
    const name = prompt('Nombre del nuevo lienzo visual (ej: Mapa Mental):');
    if (!name) return;
    const cleanName = name.endsWith('.canvas') ? name : `${name}.canvas`;
    createNewNote(cleanName);
  };

  const handleCreateExcalidraw = () => {
    const name = prompt('Nombre del dibujo Excalidraw (ej: Diagrama de Red):');
    if (!name) return;
    const cleanName = name.endsWith('.excalidraw.md')
      ? name
      : name.endsWith('.excalidraw')
      ? name
      : `${name}.excalidraw.md`;
    createNewNote(cleanName);
  };

  const findPathForTitle = (title: string, node: any): string | null => {
    if (!node) return null;
    if (!node.is_dir && (node.path === title || node.name.replace(/\.md$/, '') === title)) {
      return node.path;
    }
    if (node.children) {
      for (const child of node.children) {
        const p = findPathForTitle(title, child);
        if (p) return p;
      }
    }
    return null;
  };

  const scrollToHeading = (text: string) => {
    // Find headings inside TipTap or preview
    const headings = document.querySelectorAll('.tiptap h1, .tiptap h2, .tiptap h3, .tiptap h4, .tiptap h5, .tiptap h6');
    for (const h of Array.from(headings)) {
      if (h.textContent?.trim().toLowerCase() === text.trim().toLowerCase()) {
        h.scrollIntoView({ behavior: 'smooth', block: 'center' });
        h.classList.add('bg-jade-500/20', 'transition-colors', 'duration-500');
        setTimeout(() => h.classList.remove('bg-jade-500/20'), 1500);
        break;
      }
    }
  };

  const readingTimeMin = activeMetadata
    ? Math.max(1, Math.ceil(activeMetadata.word_count / 200))
    : 1;

  const resize = (nextWidth: number) => {
    const maxWidth = Math.max(240, Math.min(640, Math.floor(window.innerWidth * 0.55)));
    onResize(Math.max(240, Math.min(maxWidth, nextWidth)));
  };
  const direction = sidebarPosition === 'left' ? 1 : -1;

  return (
    <aside
      style={{ width, maxWidth: 'max(240px, 55vw)' }}
      className={`relative bg-obsidian-sidebar flex flex-col h-full select-none flex-shrink-0 z-30 ${
        sidebarPosition === 'right'
          ? 'border-l border-obsidian-border shadow-2xl'
          : 'border-r border-obsidian-border shadow-xl'
      }`}
    >
      <div
        role="separator"
        aria-label="Redimensionar panel lateral"
        aria-orientation="vertical"
        tabIndex={0}
        className={`absolute inset-y-0 z-40 w-2 touch-none cursor-col-resize hover:bg-jade-600/60 focus:bg-jade-600/60 ${sidebarPosition === 'left' ? '-right-1' : '-left-1'}`}
        onPointerDown={(event) => {
          if (event.button !== 0 || drag.current) return;
          const panel = event.currentTarget.parentElement;
          if (!panel) return;
          drag.current = { pointer: event.pointerId, x: event.clientX, width: panel.getBoundingClientRect().width };
          event.currentTarget.setPointerCapture(event.pointerId);
          event.preventDefault();
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (start?.pointer === event.pointerId) resize(start.width + direction * (event.clientX - start.x));
        }}
        onLostPointerCapture={() => { drag.current = null; }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          const currentWidth = event.currentTarget.parentElement?.getBoundingClientRect().width ?? width;
          resize(currentWidth + direction * (event.key === 'ArrowRight' ? 16 : -16));
        }}
      />
      {/* Top Header */}
      <div className="p-3 border-b border-obsidian-border bg-obsidian-card/40 flex items-center justify-between">
        <div className="flex items-center gap-2 truncate min-w-0">
          <span className="w-2.5 h-2.5 rounded-full bg-jade-500 shadow-sm shadow-jade-500/50 flex-shrink-0 animate-pulse" />
          <div className="truncate">
            <div className="text-xs font-bold text-obsidian-text truncate leading-tight">
              {vault?.name || 'Bóveda Jademd'}
            </div>
            <div className="text-3xs text-obsidian-muted truncate" title={vault?.path}>
              {vault?.storage_type === 'webdav' ? 'Nube (WebDAV)' : vault?.path || 'Local'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Position Toggle: Left <-> Right */}
          <button
            onClick={() => setSidebarPosition(sidebarPosition === 'right' ? 'left' : 'right')}
            title={sidebarPosition === 'right' ? 'Mover panel a la izquierda' : 'Mover panel a la derecha'}
            className="p-1.5 text-obsidian-muted hover:text-jade-400 hover:bg-obsidian-hover rounded-md transition"
          >
            <ArrowLeftRight size={13} />
          </button>

          {/* Sync Tree */}
          <button
            onClick={() => loadTree()}
            title="Refrescar árbol de archivos"
            className="p-1.5 text-obsidian-muted hover:text-white hover:bg-obsidian-hover rounded-md transition"
          >
            <FolderSync size={13} />
          </button>

          {/* Close Panel */}
          <button
            onClick={onClose}
            title="Colapsar panel"
            className="p-1.5 text-obsidian-muted hover:text-red-400 hover:bg-obsidian-hover rounded-md transition"
          >
            {sidebarPosition === 'right' ? <PanelRightClose size={13} /> : <PanelLeftClose size={13} />}
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center border-b border-obsidian-border bg-obsidian-bg/60 p-1 gap-1 text-xs">
        <button
          onClick={() => setActiveInspectorTab('tree')}
          className={`flex-1 py-1.5 px-1 rounded flex items-center justify-center gap-1.5 font-medium transition ${
            activeInspectorTab === 'tree'
              ? 'bg-jade-600/20 text-jade-300 border border-jade-500/40 shadow-sm'
              : 'text-obsidian-muted hover:text-obsidian-text hover:bg-obsidian-hover'
          }`}
          title="Explorador de Archivos"
        >
          <FolderTree size={13} />
          <span className="text-[13px]">Bóveda</span>
        </button>

        <button
          onClick={() => setActiveInspectorTab('outline')}
          className={`flex-1 py-1.5 px-1 rounded flex items-center justify-center gap-1.5 font-medium transition ${
            activeInspectorTab === 'outline'
              ? 'bg-jade-600/20 text-jade-300 border border-jade-500/40 shadow-sm'
              : 'text-obsidian-muted hover:text-obsidian-text hover:bg-obsidian-hover'
          }`}
          title="Esquema / Tabla de Contenidos"
        >
          <ListTree size={13} />
          <span className="text-[13px]">Índice</span>
          {activeMetadata?.headings && activeMetadata.headings.length > 0 && (
            <span className="text-3xs px-1 rounded-full bg-obsidian-border text-obsidian-text">
              {activeMetadata.headings.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveInspectorTab('backlinks')}
          className={`flex-1 py-1.5 px-1 rounded flex items-center justify-center gap-1.5 font-medium transition ${
            activeInspectorTab === 'backlinks'
              ? 'bg-jade-600/20 text-jade-300 border border-jade-500/40 shadow-sm'
              : 'text-obsidian-muted hover:text-obsidian-text hover:bg-obsidian-hover'
          }`}
          title="Enlaces Entrantes (Backlinks)"
        >
          <Link2 size={13} />
          <span className="text-[13px]">Enlaces</span>
          {backlinks.length > 0 && (
            <span className="text-3xs px-1 rounded-full bg-jade-900/80 text-jade-300">
              {backlinks.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveInspectorTab('metadata')}
          className={`flex-1 py-1.5 px-1 rounded flex items-center justify-center gap-1.5 font-medium transition ${
            activeInspectorTab === 'metadata'
              ? 'bg-jade-600/20 text-jade-300 border border-jade-500/40 shadow-sm'
              : 'text-obsidian-muted hover:text-obsidian-text hover:bg-obsidian-hover'
          }`}
          title="Metadatos y Estadísticas"
        >
          <Info size={13} />
          <span className="text-[13px]">Info</span>
        </button>
      </div>

      {/* Tab 1: File Tree (Bóveda) */}
      {activeInspectorTab === 'tree' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Quick Creation Toolbar */}
          <div className="px-3 py-2 border-b border-obsidian-border/50 flex items-center justify-between text-xs text-obsidian-muted bg-obsidian-card/20">
            <span className="uppercase tracking-wider font-semibold text-3xs text-jade-400">
              Acciones Rápidas
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={handleCreateNote}
                title="Nueva Nota Markdown"
                className="p-1 hover:text-jade-400 hover:bg-obsidian-hover rounded transition"
              >
                <FilePlus size={14} />
              </button>
              <button
                onClick={handleCreateCanvas}
                title="Nuevo Lienzo Visual (.canvas)"
                className="p-1 hover:text-jade-400 hover:bg-obsidian-hover rounded transition"
              >
                <LayoutGrid size={14} />
              </button>
              <button
                onClick={handleCreateExcalidraw}
                title="Nuevo Dibujo Excalidraw (.excalidraw.md)"
                className="p-1 hover:text-purple-400 hover:bg-obsidian-hover rounded transition"
              >
                <Palette size={14} />
              </button>
              <button
                onClick={handleCreateFolder}
                title="Nueva Carpeta"
                className="p-1 hover:text-jade-400 hover:bg-obsidian-hover rounded transition"
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

      {/* Tab 2: Document Outline (Índice de Encabezados) */}
      {activeInspectorTab === 'outline' && (
        <div className="flex-1 overflow-y-auto p-3 min-h-0">
          <div className="text-3xs uppercase tracking-wider font-semibold text-obsidian-muted mb-2">
            Estructura del Documento
          </div>
          {activeMetadata?.headings && activeMetadata.headings.length > 0 ? (
            <div className="space-y-1">
              {activeMetadata.headings.map((h, i) => (
                <div
                  key={i}
                  onClick={() => scrollToHeading(h.text)}
                  style={{ paddingLeft: `${(h.level - 1) * 10}px` }}
                  className="group flex items-center gap-1.5 py-1 px-2 rounded text-xs text-obsidian-muted hover:text-jade-300 hover:bg-obsidian-hover cursor-pointer transition"
                >
                  <span className="text-3xs font-mono text-jade-500/70 group-hover:text-jade-400">
                    H{h.level}
                  </span>
                  <span className="truncate">{h.text}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-xs text-obsidian-muted/60 italic">
              {activePath
                ? 'No se encontraron encabezados (#, ##, ###) en esta nota.'
                : 'Abre una nota para ver su esquema.'}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Backlinks & Connections (Enlaces) */}
      {activeInspectorTab === 'backlinks' && (
        <div className="flex-1 overflow-y-auto p-3 min-h-0 space-y-4">
          <div>
            <div className="flex items-center gap-1.5 font-semibold text-obsidian-muted uppercase tracking-wider text-3xs mb-2">
              <Link2 size={13} className="text-jade-400" />
              <span>Notas que enlazan aquí ({backlinks.length})</span>
            </div>

            {backlinks.length === 0 ? (
              <div className="text-obsidian-muted/60 italic text-xs py-4 text-center">
                Ninguna otra nota enlaza a esta todavía.
              </div>
            ) : (
              <div className="space-y-1">
                {backlinks.map((link) => (
                  <div
                    key={link}
                    onClick={() => {
                      const p = findPathForTitle(link, tree);
                      if (p) openNote(p);
                    }}
                    className="flex items-center justify-between p-2 rounded-lg bg-obsidian-card/40 hover:bg-obsidian-hover border border-obsidian-border/40 cursor-pointer text-obsidian-text hover:text-jade-300 transition"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileText size={13} className="text-jade-500 flex-shrink-0" />
                      <span className="truncate text-xs">{link}</span>
                    </div>
                    <ExternalLink size={11} className="text-obsidian-muted flex-shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>

          <ConnectionsPanel />
        </div>
      )}

      {/* Tab 4: Metadata & Stats (Información) */}
      {activeInspectorTab === 'metadata' && (
        <div className="flex-1 overflow-y-auto p-3 min-h-0 space-y-4 text-xs">
          {/* Document Stats */}
          <div className="p-3 rounded-lg bg-obsidian-card/60 border border-obsidian-border/50 space-y-2">
            <div className="text-3xs uppercase tracking-wider font-semibold text-jade-400">
              Estadísticas
            </div>
            <div className="grid grid-cols-2 gap-2 text-2xs">
              <div className="flex items-center gap-1.5 text-obsidian-muted">
                <Hash size={12} className="text-jade-500" />
                <span>Palabras:</span>
                <strong className="text-obsidian-text ml-auto">
                  {activeMetadata?.word_count || 0}
                </strong>
              </div>
              <div className="flex items-center gap-1.5 text-obsidian-muted">
                <Clock size={12} className="text-jade-500" />
                <span>Lectura:</span>
                <strong className="text-obsidian-text ml-auto">~{readingTimeMin} min</strong>
              </div>
            </div>
          </div>

          {/* Tags */}
          <div>
            <div className="flex items-center gap-1.5 font-semibold text-obsidian-muted uppercase tracking-wider text-3xs mb-2">
              <Tag size={12} className="text-jade-400" />
              <span>Etiquetas ({activeMetadata?.tags?.length || 0})</span>
            </div>
            {activeMetadata?.tags && activeMetadata.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {activeMetadata.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded-full bg-jade-950/80 text-jade-300 border border-jade-800/50 text-2xs font-mono"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-obsidian-muted/60 italic text-2xs">Sin etiquetas</div>
            )}
          </div>

          {/* Frontmatter YAML Preview */}
          {activePath?.endsWith('.md') && <PropertiesEditor content={activeContent} path={activePath} />}
        </div>
      )}
    </aside>
  );
};
