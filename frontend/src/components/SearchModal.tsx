import React, { useEffect, useRef, useState } from 'react';
import { useVaultStore } from '../store/useVaultStore';
import { FileText, Search, X } from 'lucide-react';

export const SearchModal: React.FC = () => {
  const { searchOpen, setSearchOpen, searchQuery, performSearch, searchResults, searchError, openNote } = useVaultStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (searchOpen) {
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [searchOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchResults]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!searchOpen) return;
      if (e.key === 'Escape') {
        setSearchOpen(false);
      } else if (e.key === 'ArrowDown' && searchResults.length > 0) {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = (prev + 1) % searchResults.length;
          const el = listRef.current?.querySelectorAll<HTMLElement>('[data-search-result]')[next];
          el?.scrollIntoView?.({ block: 'nearest' });
          return next;
        });
      } else if (e.key === 'ArrowUp' && searchResults.length > 0) {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = (prev - 1 + searchResults.length) % searchResults.length;
          const el = listRef.current?.querySelectorAll<HTMLElement>('[data-search-result]')[next];
          el?.scrollIntoView?.({ block: 'nearest' });
          return next;
        });
      } else if (e.key === 'Enter' && searchResults.length > 0) {
        const target = searchResults[selectedIndex] || searchResults[0];
        if (target) {
          e.preventDefault();
          void openNote(target.path);
          setSearchOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchOpen, searchResults, selectedIndex, openNote, setSearchOpen]);

  if (!searchOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-24"
      onClick={() => setSearchOpen(false)}
    >
      <div role="dialog" aria-modal="true" aria-label="Buscar en la bóveda"
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

        <div className="px-4 py-2 text-xs text-obsidian-muted flex items-center justify-between gap-2 border-b border-obsidian-border/40">
          <span>Combina: texto tag:trabajo path:Notas [estado:activo] -tag:archivo. Usa comillas para frases. Máximo 200 notas.</span>
          <span className="text-3xs font-mono text-obsidian-muted/70 shrink-0 hidden sm:inline">↑↓ navegar · Enter abrir</span>
        </div>
        {searchError && <p role="alert" className="px-4 py-2 text-sm text-rose-300">{searchError}</p>}
        {/* Results List */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-1">
          {searchResults.length === 0 && searchQuery.trim() !== '' ? (
            <div className="text-center py-12 text-obsidian-muted text-sm">
              No se encontraron notas que coincidan con "{searchQuery}"
            </div>
          ) : searchResults.length === 0 ? (
            <div className="text-center py-12 text-obsidian-muted text-xs">
              Escribe el nombre de un archivo o contenido para buscar en toda la bóveda...
            </div>
          ) : (
            searchResults.map((res, idx) => (
              <div
                key={res.path}
                data-search-result={res.path}
                onMouseEnter={() => setSelectedIndex(idx)}
                onClick={() => {
                  openNote(res.path);
                  setSearchOpen(false);
                }}
                className={`p-2.5 rounded-lg cursor-pointer transition border group ${
                  idx === selectedIndex
                    ? 'bg-obsidian-hover border-jade-500/50'
                    : 'hover:bg-obsidian-hover border-transparent hover:border-obsidian-border'
                }`}
              >
                <div className={`flex items-center gap-2 text-sm font-medium ${idx === selectedIndex ? 'text-jade-300' : 'text-obsidian-text group-hover:text-jade-300'}`}>
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
