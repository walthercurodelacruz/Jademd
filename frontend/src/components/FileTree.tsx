import React, { useState } from 'react';
import { FileNode } from '../types';
import { useVaultStore } from '../store/useVaultStore';
import { ChevronDown, ChevronRight, FileText, Folder, FolderPlus, FilePlus, Trash2, LayoutGrid, Image as ImageIcon } from 'lucide-react';

interface Props {
  node: FileNode;
}

export const FileTree: React.FC<Props> = ({ node }) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ '': true, '/': true });
  const { activePath, openNote, createNewNote, createNewFolder, deleteItem } = useVaultStore();

  const toggleExpand = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const handleCreateNoteInFolder = (folderPath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const name = prompt('Nombre de la nueva nota (ej: Mi Nota):');
    if (!name) return;
    const cleanName = name.endsWith('.md') ? name : `${name}.md`;
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
    const isExp = expanded[item.path] ?? (level < 2);

    return (
      <div key={item.path || item.name} className="select-none text-sm">
        <div
          onClick={(e) => {
            if (isDir) {
              toggleExpand(item.path, e);
            } else {
              openNote(item.path);
            }
          }}
          style={{ paddingLeft: `${Math.max(8, level * 14)}px` }}
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
          <div className="hidden group-hover:flex items-center gap-1 opacity-80">
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
                  onClick={(e) => handleCreateSubFolder(item.path, e)}
                  title="Nueva carpeta aquí"
                  className="p-1 hover:text-jade-400 hover:bg-obsidian-border rounded"
                >
                  <FolderPlus size={13} />
                </button>
              </>
            )}
            {item.path && item.path !== '/' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteItem(item.path);
                }}
                title="Eliminar"
                className="p-1 hover:text-red-400 hover:bg-obsidian-border rounded"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
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

  return <div className="space-y-0.5">{renderNode(node)}</div>;
};
