import React, { useEffect, useRef } from 'react';
import { useVaultStore } from '../store/useVaultStore';
import { FileText, Search, X } from 'lucide-react';

export const SearchModal: React.FC = () => {
  const { searchOpen, setSearchOpen, searchQuery, performSearch, searchResults, openNote } = useVaultStore();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [searchOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'o' || e.key === 'k' || e.key === 'f')) {
        e.preventDefault();
        setSearchOpen(!searchOpen);
      }
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchOpen]);

  if (!searchOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-24"
      onClick={() => setSearchOpen(false)}
    >
      <div
        className="w-full max-w-2xl bg-obsidian-card border border-obsidian-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-obsidian-border bg-obsidian-sidebar">
          <Search size={18} className="text-jade-400" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Buscar notas, palabras clave, etiquetas..."
            value={searchQuery}
            onChange={(e) => performSearch(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-obsidian-text placeholder-obsidian-muted text-base"
          />
          <button
            onClick={() => setSearchOpen(false)}
            className="text-obsidian-muted hover:text-white p-1 rounded"
          >
            <X size={16} />
          </button>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {searchResults.length === 0 && searchQuery.trim() !== '' ? (
            <div className="text-center py-12 text-obsidian-muted text-sm">
              No se encontraron notas que coincidan con "{searchQuery}"
            </div>
          ) : searchResults.length === 0 ? (
            <div className="text-center py-12 text-obsidian-muted text-xs">
              Escribe el nombre de un archivo o contenido para buscar en toda la bóveda...
            </div>
          ) : (
            searchResults.map((res) => (
              <div
                key={res.path}
                onClick={() => {
                  openNote(res.path);
                  setSearchOpen(false);
                }}
                className="p-2.5 rounded-lg hover:bg-obsidian-hover cursor-pointer transition border border-transparent hover:border-obsidian-border group"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-obsidian-text group-hover:text-jade-300">
                  <FileText size={15} className="text-jade-400" />
                  <span>{res.title}</span>
                  <span className="text-xs text-obsidian-muted font-normal ml-auto truncate max-w-[200px]">
                    {res.path}
                  </span>
                </div>

                {res.matches.length > 0 && (
                  <div className="mt-1.5 pl-6 space-y-1 text-xs text-obsidian-muted">
                    {res.matches.slice(0, 3).map((m, i) => (
                      <div key={i} className="truncate">
                        <span className="text-jade-500/80 mr-1.5 font-mono">{m.line}:</span>
                        <span>{m.content}</span>
                      </div>
                    ))}
                    {res.matches.length > 3 && (
                      <div className="text-2xs text-obsidian-muted/60">
                        +{res.matches.length - 3} coincidencias más...
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
