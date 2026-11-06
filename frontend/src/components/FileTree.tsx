import React, { useState } from 'react';
import { FileNode } from '../types';
import { useVaultStore } from '../store/useVaultStore';
import {
  Pencil,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderPlus,
  FilePlus,
  Trash2,
  LayoutGrid,
  Image as ImageIcon,
  Palette,
} from 'lucide-react';

interface Props {
  node: FileNode;
}

export const FileTree: React.FC<Props> = ({ node }) => {
  const vaultId = useVaultStore((state) => state.vault?.id);
  return <VaultFileTree key={vaultId || 'unopened'} node={node} vaultId={vaultId} />;
};

const VaultFileTree: React.FC<Props & { vaultId?: string }> = ({ node, vaultId }) => {
  const storageKey = vaultId ? `jademd:tree-expanded:${vaultId}` : null;

  const dragging = React.useRef<FileNode | null>(null);
  const [dropPath, setDropPath] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<{ from: string; to: string } | null>(null);
  const [moveError, setMoveError] = useState('');
  const { moveItem, isLoading } = useVaultStore();
  const destinationFor = (folder: FileNode) => {
    const source = dragging.current;
    if (!source || !folder.is_dir || isLoading) return null;
    const folderPath = folder.path === '/' ? '' : folder.path;
    const to = folderPath ? folderPath + '/' + source.name : source.name;
    if (to === source.path || folderPath === source.path || folderPath.startsWith(source.path + '/')) return null;
    return { from: source.path, to };
  };
  const [contextPath, setContextPath] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    try {
      const saved = JSON.parse(storageKey ? localStorage.getItem(storageKey) || '{}' : '{}');
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
      return Object.fromEntries(Object.entries(saved).filter(([, value]) => typeof value === 'boolean')) as Record<string, boolean>;
    } catch { return {}; }
  });
  const { activePath, openNote, createNewNote, createNewFolder, deleteItem, setViewMode, setFileOperationPath } = useVaultStore();

  const toggleExpand = (path: string, currentlyExpanded: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = { ...expanded, [path]: !currentlyExpanded };
    setExpanded(next);
    if (storageKey) {
      try { localStorage.setItem(storageKey, JSON.stringify(next)); }
      catch { useVaultStore.setState({ noteError: 'No se pudo guardar el estado de las carpetas para la próxima sesión.' }); }
    }
  };

  const handleCreateNoteInFolder = (folderPath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const name = prompt('Nombre de la nueva nota (ej: Mi Nota):');
    if (!name) return;
    const cleanName = name.endsWith('.md') ? name : `${name}.md`;
    const fullPath = folderPath ? `${folderPath.replace(/^\//, '')}/${cleanName}` : cleanName;
    createNewNote(fullPath);
  };

  const handleCreateExcalidrawInFolder = (folderPath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const name = prompt('Nombre del dibujo Excalidraw (ej: Diagrama de Arquitectura):');
    if (!name) return;
    const cleanName = name.endsWith('.excalidraw.md')
      ? name
      : name.endsWith('.excalidraw')
      ? name
      : `${name}.excalidraw.md`;
    const fullPath = folderPath ? `${folderPath.replace(/^\//, '')}/${cleanName}` : cleanName;
    createNewNote(fullPath);
  };

  const handleCreateSubFolder = (folderPath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const name = prompt('Nombre de la nueva carpeta:');
    if (!name) return;
    const fullPath = folderPath ? `${folderPath.replace(/^\//, '')}/${name}` : name;
    createNewFolder(fullPath);
  };

  const renderNode = (item: FileNode, level = 0) => {
    const isDir = item.is_dir;
    const isSelected = activePath === item.path;
    const isExp = expanded[item.path] ?? (level === 0);
    const isExcalidraw = item.name.includes('.excalidraw');

    return (
      <div key={item.path || item.name} className="select-none text-sm">
        <div
          data-tree-path={item.path}
          draggable={!!item.path && item.path !== '/' && !isLoading}
          onDragStart={(event) => {
            event.stopPropagation();
            dragging.current = item;
            setContextPath(null);
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/jademd-file', item.path);
          }}
          onDragEnd={() => { dragging.current = null; setDropPath(null); }}
          onDragOver={(event) => {
            if (!destinationFor(item)) return;
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = 'move';
            setDropPath(item.path);
          }}
          onDragLeave={() => setDropPath(null)}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const destination = destinationFor(item);
            dragging.current = null;
            setDropPath(null);
            if (destination) { setMoveError(''); setPendingMove(destination); }
          }}
          onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); setContextPath(item.path); }}
          onClick={(e) => {
            setContextPath(null);
            if (isDir) {
              toggleExpand(item.path, isExp, e);
            } else {
              setViewMode('editor');
              openNote(item.path);
            }
          }}
          style={{ outline: dropPath === item.path ? '2px solid #22c55e' : undefined, paddingLeft: `${Math.max(8, level * 14)}px` }}
          className={`group flex items-center justify-between py-1.5 pr-2 rounded-md cursor-pointer transition-colors ${
            isSelected
              ? 'bg-jade-950/60 text-jade-300 font-medium border-l-2 border-jade-500'
              : 'text-obsidian-muted hover:text-obsidian-text hover:bg-obsidian-hover'
          }`}
        >
          <div className="flex items-center gap-1.5 truncate">
            {isDir ? (
              <>
                <span className="text-obsidian-muted/60 p-0.5">
                  {isExp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
                <Folder size={15} className="text-jade-400/80 flex-shrink-0" />
              </>
            ) : (
              <>
                <span className="w-3.5" />
                {item.name.endsWith('.canvas') ? (
                  <LayoutGrid size={14} className={isSelected ? 'text-jade-400' : 'text-emerald-400/80'} />
                ) : isExcalidraw ? (
                  <Palette size={14} className={isSelected ? 'text-purple-400' : 'text-purple-400/90'} />
                ) : /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico)$/i.test(item.name) ? (
                  <ImageIcon size={14} className={isSelected ? 'text-sky-400' : 'text-sky-400/80'} />
                ) : (
                  <FileText size={14} className={isSelected ? 'text-jade-400' : 'text-obsidian-muted/70'} />
                )}
              </>
            )}
            <span className="truncate">{item.name.replace(/\.md$/, '')}</span>
          </div>

          {/* Quick Actions Hover */}
          {contextPath === item.path && <div role="menu" aria-label="Acciones del archivo" className="flex items-center gap-1 bg-obsidian-card border border-obsidian-border rounded p-1" onClick={() => setContextPath(null)}>
            {isDir && (
              <>
                <button
                  onClick={(e) => handleCreateNoteInFolder(item.path, e)}
                  title="Nueva nota aquí"
                  className="p-1 hover:text-jade-400 hover:bg-obsidian-border rounded"
                >
                  <FilePlus size={13} />
                </button>
                <button
                  onClick={(e) => handleCreateExcalidrawInFolder(item.path, e)}
                  title="Nuevo dibujo Excalidraw aquí"
                  className="p-1 hover:text-purple-400 hover:bg-obsidian-border rounded"
                >
                  <Palette size={13} />
                </button>
                <button
                  onClick={(e) => handleCreateSubFolder(item.path, e)}
                  title="Nueva carpeta aquí"
                  className="p-1 hover:text-jade-400 hover:bg-obsidian-border rounded"
                >
                  <FolderPlus size={13} />
                </button>
              </>
            )}
            {item.path && item.path !== '/' && <button aria-label={`Renombrar o mover ${item.path}`} title="Renombrar o mover" className="p-1 hover:text-jade-300 rounded" onClick={(event) => { event.stopPropagation(); setFileOperationPath(item.path); }}><Pencil size={13} /></button>}
            {item.path && item.path !== '/' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteItem(item.path);
                }}
                title="Mover a la papelera"
                className="p-1 hover:text-red-400 hover:bg-obsidian-border rounded"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>}
        </div>

        {/* Children */}
        {isDir && isExp && item.children && (
          <div>
            {item.children.map((child) => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return <><div className="space-y-0.5" onKeyDown={(event) => { if (event.key === 'Escape') setContextPath(null); }}>{renderNode(node)}</div>
    {pendingMove && <div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-6">
      <section role="dialog" aria-modal="true" aria-label="Confirmar movimiento" className="bg-obsidian-card border border-obsidian-border rounded-xl p-5 w-full max-w-lg">
        <h2 className="font-semibold mb-3">Confirmar movimiento</h2>
        <p className="break-all">Origen: {pendingMove.from}</p>
        <p className="break-all">Destino: {pendingMove.to}</p>
        {moveError && <p role="alert" className="text-rose-300">{moveError}</p>}
        <div className="flex justify-end gap-3 mt-4">
          <button disabled={isLoading} onClick={() => setPendingMove(null)}>Cancelar</button>
          <button disabled={isLoading} className="bg-jade-700 rounded px-4 py-2" onClick={async () => {
            try { await moveItem(pendingMove.from, pendingMove.to); setPendingMove(null); }
            catch (error) { setMoveError(error instanceof Error ? error.message : String(error)); }
          }}>{isLoading ? 'Moviendo…' : 'Mover'}</button>
        </div>
      </section>
    </div>}
  </>;
};
