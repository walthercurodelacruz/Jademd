export type WorkspaceNoteMode = 'live' | 'source' | 'reading' | 'split-preview';
export interface HistoryEntry { path: string; anchor?: string }
export interface WorkspacePane {
  id: string;
  tabs: string[];
  activePath: string | null;
  pinned: string[];
  history: HistoryEntry[];
  historyIndex: number;
}
export interface WorkspaceLayout {
  panes: WorkspacePane[];
  activePaneId: string;
  splitTree: SplitTree;
  noteModes: Record<string, WorkspaceNoteMode>;
}
export type SplitDirection = 'horizontal' | 'vertical';
export type SplitTree =
  | { paneId: string }
  | { id: string; direction: SplitDirection; ratio: number; first: SplitTree; second: SplitTree };

export const clampRatio = (ratio: number) => Math.max(0.15, Math.min(0.85, ratio));

export function replacePane(tree: SplitTree, paneId: string, replacement: SplitTree): SplitTree {
  if ('paneId' in tree) return tree.paneId === paneId ? replacement : tree;
  return { ...tree, first: replacePane(tree.first, paneId, replacement), second: replacePane(tree.second, paneId, replacement) };
}

export function removePane(tree: SplitTree, paneId: string): SplitTree | null {
  if ('paneId' in tree) return tree.paneId === paneId ? null : tree;
  const first = removePane(tree.first, paneId);
  const second = removePane(tree.second, paneId);
  return first && second ? { ...tree, first, second } : first ?? second;
}

export function resizeSplit(tree: SplitTree, id: string, ratio: number): SplitTree {
  if ('paneId' in tree) return tree;
  if (tree.id === id) return { ...tree, ratio: clampRatio(ratio) };
  return { ...tree, first: resizeSplit(tree.first, id, ratio), second: resizeSplit(tree.second, id, ratio) };
}

function legacyTree(panes: WorkspacePane[], direction: SplitDirection, index = 0): SplitTree {
  const first = { paneId: panes[index].id };
  const remaining = panes.length - index;
  if (remaining === 1) return first;
  return { id: `legacy-${index}`, direction, ratio: 1 / remaining, first, second: legacyTree(panes, direction, index + 1) };
}

function validateTree(value: unknown, paneIds: Set<string>): SplitTree | null {
  const leaves = new Set<string>();
  const splits = new Set<string>();
  function visit(value: unknown, depth: number): SplitTree | null {
    if (!value || typeof value !== 'object' || depth >= paneIds.size) return null;
    const node = value as Record<string, unknown>;
    if (typeof node.paneId === 'string') {
      if (!paneIds.has(node.paneId) || leaves.has(node.paneId)) return null;
      leaves.add(node.paneId);
      return { paneId: node.paneId };
    }
    if (typeof node.id !== 'string' || splits.has(node.id) ||
        (node.direction !== 'horizontal' && node.direction !== 'vertical') ||
        typeof node.ratio !== 'number' || !Number.isFinite(node.ratio)) return null;
    splits.add(node.id);
    const first = visit(node.first, depth + 1);
    const second = visit(node.second, depth + 1);
    if (!first || !second) return null;
    return { id: node.id, direction: node.direction, ratio: clampRatio(node.ratio), first, second };
  }
  const tree = visit(value, 0);
  return leaves.size === paneIds.size ? tree : null;
}

export function emptyPane(id = 'main'): WorkspacePane {
  return { id, tabs: [], activePath: null, pinned: [], history: [], historyIndex: -1 };
}
export const initialWorkspace = (): WorkspaceLayout => ({ panes: [emptyPane()], activePaneId: 'main', splitTree: { paneId: 'main' }, noteModes: {} });
const validPath = (value: unknown): value is string => typeof value === 'string' && !!value && !value.startsWith('/') && !value.includes('\\') && !value.split('/').includes('..');

function decodeWorkspace(value: any): WorkspaceLayout {
  if (!Array.isArray(value?.panes)) return initialWorkspace();
  const ids = new Set<string>();
  const panes = value.panes.slice(0, 4).flatMap((pane: any) => {
    if (typeof pane?.id !== 'string' || !/^[\w-]+$/.test(pane.id) || ids.has(pane.id)) return [];
    ids.add(pane.id);
    const tabs: string[] = [...new Set<string>((Array.isArray(pane.tabs) ? pane.tabs : []).filter(validPath))].slice(0, 100);
    const history: HistoryEntry[] = (Array.isArray(pane.history) ? pane.history : [])
      .filter((entry: any) => validPath(entry?.path))
      .slice(-100)
      .map((entry: any) => ({ path: entry.path, ...(typeof entry.anchor === 'string' ? { anchor: entry.anchor } : {}) }));
    return [{ id: pane.id, tabs, activePath: tabs.includes(pane.activePath) ? pane.activePath : tabs.at(-1) || null,
      pinned: (Array.isArray(pane.pinned) ? pane.pinned : []).filter((path: string) => tabs.includes(path)), history,
      historyIndex: Math.min(history.length - 1, Math.max(-1, Number.isInteger(pane.historyIndex) ? pane.historyIndex : history.length - 1)) }];
  });
  if (!panes.length) return initialWorkspace();
  const modes = ['live', 'source', 'reading', 'split-preview'];
  const noteModes = Object.fromEntries(Object.entries(value.noteModes || {}).filter(([path, mode]) => validPath(path) && modes.includes(String(mode)))) as Record<string, WorkspaceNoteMode>;
  return {
    panes, activePaneId: ids.has(value.activePaneId) ? value.activePaneId : panes[0].id,
    splitTree: validateTree(value.splitTree, ids) ?? legacyTree(panes, value.paneDirection === 'vertical' ? 'vertical' : 'horizontal'),
    noteModes,
  };
}

export function readWorkspace(vaultId: string): WorkspaceLayout {
  try {
    return decodeWorkspace(JSON.parse(localStorage.getItem(`jademd:workspace:${vaultId}`) || 'null'));
  } catch { return initialWorkspace(); }
}

export function writeWorkspace(vaultId: string, layout: WorkspaceLayout): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(`jademd:workspace:${vaultId}`, JSON.stringify(layout));
}

export function remapPath(path: string, from: string, to: string): string {
  return path === from ? to : path.startsWith(`${from}/`) ? to + path.slice(from.length) : path;
}

export interface SavedWorkspace { name: string; layout: WorkspaceLayout }

export function readSavedWorkspaces(vaultId: string): SavedWorkspace[] {
  try {
    const value = JSON.parse(localStorage.getItem(`jademd:layouts:${vaultId}`) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((item) => typeof item?.name === 'string' && item.name.trim() && item.name.length <= 80)
      .slice(0, 20).map((item) => ({ name: item.name, layout: decodeWorkspace(item.layout) }));
  } catch { return []; }
}

export function writeSavedWorkspaces(vaultId: string, layouts: SavedWorkspace[]): void {
  localStorage.setItem(`jademd:layouts:${vaultId}`, JSON.stringify(layouts));
}
