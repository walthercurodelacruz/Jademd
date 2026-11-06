import React from 'react';
import { useVaultStore } from '../store/useVaultStore';
import { Link2, Tag, FileText, Info } from 'lucide-react';

export const BacklinksPanel: React.FC = () => {
  const { activePath, activeMetadata, backlinks, openNote, tree } = useVaultStore();

  if (!activePath) return null;

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

  return (
    <div className="w-64 border-l border-obsidian-border bg-obsidian-sidebar flex flex-col h-full text-xs select-none">
      {/* Header */}
      <div className="p-3 border-b border-obsidian-border font-medium text-obsidian-text flex items-center gap-2">
        <Info size={14} className="text-jade-400" />
        <span>Detalles de la Nota</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-5">
        {/* Backlinks */}
        <div>
          <div className="flex items-center gap-1.5 font-semibold text-obsidian-muted uppercase tracking-wider text-2xs mb-2">
            <Link2 size={13} className="text-jade-400" />
            <span>Enlaces Entrantes ({backlinks.length})</span>
          </div>

          {backlinks.length === 0 ? (
            <div className="text-obsidian-muted/60 italic text-2xs">
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
                  className="flex items-center gap-1.5 p-1.5 rounded hover:bg-obsidian-hover cursor-pointer text-obsidian-text hover:text-jade-300 transition"
                >
                  <FileText size={12} className="text-jade-500" />
                  <span className="truncate">{link}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tags */}
        {activeMetadata?.tags && activeMetadata.tags.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 font-semibold text-obsidian-muted uppercase tracking-wider text-2xs mb-2">
              <Tag size={13} className="text-jade-400" />
              <span>Etiquetas ({activeMetadata.tags.length})</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {activeMetadata.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded bg-jade-950/80 text-jade-300 border border-jade-800/50 text-2xs"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Headings Outline */}
        {activeMetadata?.headings && activeMetadata.headings.length > 0 && (
          <div>
            <div className="font-semibold text-obsidian-muted uppercase tracking-wider text-2xs mb-2">
              Estructura / Encabezados
            </div>
            <div className="space-y-1">
              {activeMetadata.headings.map((h, i) => (
                <div
                  key={i}
                  style={{ paddingLeft: `${(h.level - 1) * 8}px` }}
                  className="text-obsidian-muted hover:text-obsidian-text truncate py-0.5 cursor-pointer"
                >
                  {h.text}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
