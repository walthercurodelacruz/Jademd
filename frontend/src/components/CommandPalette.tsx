import { usePublicationPanel } from './PublicationPanel';
import { useExportPanel } from './ExportPanel';
import React, { useEffect, useRef, useState } from 'react';
import { COMMANDS, CommandId, bindings, displayShortcut, shortcutFromEvent } from '../utils/commands';
import { openDailyNote } from '../utils/productivityActions';
import { useProductivityStore } from '../store/useProductivityStore';
import { useVaultStore } from '../store/useVaultStore';

export function CommandPalette() {
  const state = useVaultStore();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const productivity = useProductivityStore();
  useEffect(() => { productivity.activate(state.vault?.id || null); }, [state.vault?.id]);
  const execute = async (id: CommandId) => {
    try {
      const current = useVaultStore.getState();
      const tools = useProductivityStore.getState();
      switch (id) {
        case 'palette': current.setCommandPaletteOpen(!current.commandPaletteOpen); break;
        case 'new': { const name = prompt('Nombre o ruta de la nota:'); if (name?.trim()) await current.createNewNote(name.trim().endsWith('.md') ? name.trim() : `${name.trim()}.md`); break; }
        case 'newBase': {
          const name = prompt('Nombre o ruta de la base:')?.trim();
          if (name) await current.createNewNote(/\.base$/i.test(name) ? name : `${name}.base`);
          break;
        }
        case 'refreshVault': await current.refreshExternalChanges(true); break;
        case 'search': current.setSearchOpen(true); break;
        case 'splitRight': current.splitPane('horizontal'); break;
        case 'splitDown': current.splitPane('vertical'); break;
        case 'back': await current.navigateHistory(-1); break;
        case 'forward': await current.navigateHistory(1); break;
        case 'save': await current.flushPendingSaves(); break;
        case 'rename': if (current.activePath) current.setFileOperationPath(current.activePath); break;
        case 'trash': current.setTrashOpen(true); break;
        case 'graph': current.setViewMode('graph'); break;
        case 'editor': current.setViewMode('editor'); break;
        case 'live': case 'source': case 'reading': case 'split-preview': current.setNoteMode(id); break;
        case 'zen': current.toggleZenMode(); break;
        case 'daily': await openDailyNote(); break;
        case 'template': tools.show('templates'); break;
        case 'bookmark': if (current.activePath) tools.toggleBookmark(current.activePath); break;
        case 'publication': if (current.vault) usePublicationPanel.getState().show(); break;
        case 'export': useExportPanel.getState().show(); break;
        case 'productivity': tools.show(); break;
      }
    } catch (error) { useVaultStore.setState({ noteError: error instanceof Error ? error.message : String(error) }); }
  };
  const matches = COMMANDS.filter((command) => command.id !== 'palette' && command.label.toLowerCase().includes(query.toLowerCase()));
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat || (event.target as HTMLElement)?.closest?.('[data-shortcut-capture]')) return;
      // Dialog inputs keep editing keys. The palette toggle remains available inside the palette.
      const key = shortcutFromEvent(event);
      const command = COMMANDS.find((command) => key && bindings(command.id, productivity.settings.shortcuts).includes(key));
      if (!command || (document.querySelector('[role="dialog"]') && command.id !== 'palette')) return;
      event.preventDefault(); event.stopPropagation();
      void execute(command.id);
    };
    window.addEventListener('keydown', keydown, true);
    return () => window.removeEventListener('keydown', keydown, true);
  }, [productivity.settings.shortcuts]);
  useEffect(() => { if (state.commandPaletteOpen) { setQuery(''); setIndex(0); input.current?.focus(); } }, [state.commandPaletteOpen]);
  if (!state.commandPaletteOpen) return null;
  const run = (at: number) => { const command = matches[at]; if (command) { state.setCommandPaletteOpen(false); void execute(command.id); } };
  return <div className="fixed inset-0 z-[90] bg-black/60 flex items-start justify-center pt-24 px-4" onClick={() => state.setCommandPaletteOpen(false)}>
    <section role="dialog" aria-modal="true" aria-label="Paleta de comandos" className="w-full max-w-xl bg-obsidian-card border border-obsidian-border rounded-xl shadow-xl overflow-hidden" onClick={(event) => event.stopPropagation()}>
      <input ref={input} aria-label="Buscar comando" value={query} onChange={(event) => { setQuery(event.target.value); setIndex(0); }} placeholder="Buscar comando…" className="w-full bg-obsidian-bg p-4 outline-none" onKeyDown={(event) => {
        if (event.key === 'Escape') state.setCommandPaletteOpen(false);
        if (event.key === 'ArrowDown') { event.preventDefault(); setIndex((value) => Math.min(matches.length - 1, value + 1)); }
        if (event.key === 'ArrowUp') { event.preventDefault(); setIndex((value) => Math.max(0, value - 1)); }
        if (event.key === 'Enter') { event.preventDefault(); run(index); }
      }} />
      <div role="listbox" className="max-h-[60vh] overflow-auto p-2">{matches.map((command, at) => <button key={command.label} role="option" aria-selected={index === at} onClick={() => run(at)} className={`w-full flex justify-between text-left px-3 py-2 rounded text-sm ${index === at ? 'bg-jade-950 text-jade-200' : 'hover:bg-obsidian-hover'}`}><span>{command.label}</span><kbd className="text-xs text-obsidian-muted">{bindings(command.id, productivity.settings.shortcuts).map(displayShortcut).join(' / ')}</kbd></button>)}{!matches.length && <p className="p-5 text-sm text-obsidian-muted">No hay comandos coincidentes.</p>}</div>
    </section>
  </div>;
}
