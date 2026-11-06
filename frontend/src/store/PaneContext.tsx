import { createContext, useContext } from 'react';
import { useVaultStore } from './useVaultStore';

export const PaneContext = createContext<string | null>(null);
export function usePaneState() {
  const root = useVaultStore();
  const context = useContext(PaneContext);
  const id = context || root.activePaneId;
  const pane = root.panes.find((pane) => pane.id === id);
  const path = pane?.activePath || null;
  const doc = path ? root.documents[path] : undefined;
  return { ...root, paneId: id, pane, activePath: path, openTabs: pane?.tabs || [],
    activeContent: path ? root.drafts[path] ?? doc?.content ?? '' : '',
    activeMetadata: doc?.metadata || null, backlinks: doc?.backlinks || [],
    noteLoadState: doc?.loadState || 'idle', noteError: doc?.error || root.noteError,
    noteMode: path ? root.noteModes[path] || 'live' : 'live',
    navigationAnchor: pane?.history[pane.historyIndex]?.anchor || '',
    openNote: (path: string) => root.openNote(path, id),
    navigateToLink: (target: string, source?: string) => root.navigateToLink(target, source, id),
    closeTab: (path: string) => root.closeTab(path, id),
    setNoteMode: (mode: Parameters<typeof root.setNoteMode>[0]) => root.setNoteMode(mode, path || undefined),
    navigateHistory: (delta: -1 | 1) => root.navigateHistory(delta, id),
  };
}
