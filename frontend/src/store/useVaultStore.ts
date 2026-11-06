import { savedVaults, rememberVault } from '../utils/vaultRegistry';
import { useProductivityStore } from './useProductivityStore';
import { create } from 'zustand';
import { FileNode, GraphData, NoteMetadata, SearchResult, VaultInfo, TrashEntry } from '../types';
import { api } from '../api/client';
import { parseFrontmatter } from '../utils/frontmatter';
import { noteMetadata } from '../utils/noteMetadata';
import { emptyPane, initialWorkspace, readWorkspace, writeWorkspace, remapPath, WorkspacePane, WorkspaceLayout, SplitTree, replacePane, removePane, resizeSplit, readSavedWorkspaces, writeSavedWorkspaces } from '../utils/workspace';
import { readDrafts, persistDrafts, readDraftBases, persistDraftBases } from '../utils/draftStorage';

export const isExcalidrawFile = (path?: string | null, content?: string | null): boolean => {
  if (!path) return false;
  const lower = path.toLowerCase();
  if (lower.endsWith('.excalidraw.md') || lower.endsWith('.excalidraw')) return true;
  if (!lower.endsWith('.md')) return false;
  if (!content) return false;

  const parsed = parseFrontmatter(content);
  if (parsed.error || !parsed.frontmatter) return false;
  const plugin = parsed.frontmatter['excalidraw-plugin'];
  const tags = parsed.frontmatter.tags;
  const hasPlugin = typeof plugin === 'string' && plugin.toLowerCase() === 'parsed';
  const hasTag = (Array.isArray(tags) ? tags : [tags]).some((tag) => typeof tag === 'string' && tag.toLowerCase() === 'excalidraw');
  const hasData = /```(?:compressed-json|json:excalidraw|json)[ \t]*\r?\n/.test(parsed.markdownBody);
  return (hasPlugin || hasTag) && hasData;
};

export type SidebarPosition = 'right' | 'left';
export type NoteMode = 'live' | 'source' | 'reading' | 'split-preview';
export type InspectorTab = 'tree' | 'outline' | 'backlinks' | 'metadata';

export interface DocumentSnapshot {
  base?: string | null;
  content: string; metadata: NoteMetadata | null; backlinks: string[];
  loadState: 'loading' | 'ready' | 'error'; error: string | null;
}
export interface DocumentConflict { base: string | null | undefined; remote: string | null }
interface VaultState {
  conflicts: Record<string, DocumentConflict>;
  externalError: string | null;
  refreshExternalChanges: (manual?: boolean) => Promise<void>;
  recoverInterruptedOperation: (id: string, from: string, to: string) => Promise<void>;
  resolveConflict: (path: string, choice: "remote" | "merge" | "copy", content?: string, copyPath?: string) => Promise<void>;
  panes: WorkspacePane[];
  activePaneId: string;
  splitTree: SplitTree;
  documents: Record<string, DocumentSnapshot>;
  commandPaletteOpen: boolean;
  fileOperationPath: string | null;
  trashOpen: boolean;
  trashEntries: TrashEntry[];
  vault: VaultInfo | null;
  tree: FileNode | null;
  activePath: string | null;
  activeContent: string;
  navigationAnchor: string;
  navigationNonce: number;
  noteLoadState: 'idle' | 'loading' | 'ready' | 'error';
  noteError: string | null;
  saveError: string | null;
  recoveryError: string | null;
  drafts: Record<string, string>;
  activeMetadata: NoteMetadata | null;
  backlinks: string[];
  openTabs: string[];
  viewMode: 'editor' | 'graph' | 'split';
  noteMode: NoteMode;
  noteModes: Record<string, NoteMode>;
  graphData: GraphData | null;
  graphLoading: boolean;
  graphError: string | null;
  isSaving: boolean;
  isLoading: boolean;
  searchOpen: boolean;
  searchQuery: string;
  searchError: string | null;
  searchResults: SearchResult[];
  knownExcalidrawNotes: Record<string, boolean>;
  sidebarPosition: SidebarPosition;
  activeInspectorTab: InspectorTab;
  zenMode: boolean;

  // Actions
  openLocalVault: (path: string, name?: string) => Promise<void>;
  openWebdavVault: (endpoint: string, user?: string, pass?: string, root?: string, name?: string) => Promise<void>;
  openGdriveVault: (params: {
    name?: string;
    accessToken?: string;
    refreshToken?: string;
    clientId?: string;
    clientSecret?: string;
    root?: string;
  }) => Promise<void>;
  loadTree: () => Promise<void>;
  openNote: (path: string, paneId?: string, addHistory?: boolean) => Promise<void>;
  focusPane: (paneId: string) => void;
  splitPane: (direction: 'horizontal' | 'vertical', paneId?: string) => void;
  resizePaneSplit: (id: string, ratio: number) => void;
  restoreWorkspace: (layout: WorkspaceLayout) => Promise<void>;
  closePane: (paneId: string) => void;
  navigateHistory: (delta: -1 | 1, paneId?: string) => Promise<void>;
  togglePinTab: (path: string, paneId?: string) => void;
  reorderTab: (path: string, before: string, paneId?: string) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  navigateToLink: (target: string, source?: string, paneId?: string) => Promise<void>;
  closeTab: (path: string, paneId?: string) => void;
  initializeVault: () => Promise<void>;
  queueNoteSave: (content: string, path: string, delay?: number) => void;
  flushPendingSaves: () => Promise<void>;
  saveCurrentNote: (content: string, forPath?: string) => Promise<void>;
  createNewNote: (path: string) => Promise<void>;
  createNewFolder: (path: string) => Promise<void>;
  deleteItem: (path: string) => Promise<void>;
  moveItem: (from: string, to: string) => Promise<void>;
  restoreItem: (id: string) => Promise<void>;
  loadTrash: () => Promise<void>;
  setTrashOpen: (open: boolean) => void;
  setFileOperationPath: (path: string | null) => void;
  setViewMode: (mode: VaultState['viewMode']) => void;
  setNoteMode: (mode: VaultState['noteMode'], path?: string) => void;
  loadGraph: () => Promise<void>;
  setSearchOpen: (open: boolean) => void;
  performSearch: (query: string) => Promise<void>;
  setSidebarPosition: (position: SidebarPosition) => void;
  setActiveInspectorTab: (tab: InspectorTab) => void;
  toggleZenMode: () => void;
}

export const useVaultStore = create<VaultState>((set, get) => {
  let openSequence = 0;
  const documentRequests = new Map<string, number>();
  let linkSequence = 0;
  const linkRequests = new Map<string, number>();
  let searchSequence = 0;
  let graphSequence = 0;
  let refreshing = false;
  let fingerprint = "";
  let initializePromise: Promise<void> | undefined;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const writes = new Map<string, Promise<void>>();
  const saveFailures = new Map<string, string>();
  const saveGenerations = new Map<string, number>();
  const project = (state: VaultState, id = state.activePaneId): Partial<VaultState> => {
    const pane = state.panes.find((pane) => pane.id === id) || state.panes[0];
    const path = pane?.activePath || null;
    const doc = path ? state.documents[path] : null;
    return { activePaneId: pane?.id || 'main', openTabs: pane?.tabs || [], activePath: path,
      activeContent: path ? state.drafts[path] ?? doc?.content ?? '' : '', activeMetadata: doc?.metadata || null,
      backlinks: doc?.backlinks || [], noteLoadState: doc?.loadState || 'idle', noteError: doc?.error || null,
      navigationAnchor: pane?.history[pane.historyIndex]?.anchor || '',
      noteMode: path ? state.noteModes[path] || 'live' : 'live' };
  };
  const updatePanes = (panes: WorkspacePane[], id = get().activePaneId) => {
    set((state) => { const next = { ...state, panes }; return { panes, ...project(next, id) }; });
  };
  const documentOpen = (path: string) => get().panes.some((pane) => pane.tabs.includes(path));
  const recordDraft = (path: string, content: string) => {
    const drafts = { ...get().drafts, [path]: content };
    set((state) => ({ drafts,
      documents: { ...state.documents, [path]: { ...state.documents[path], content,
        metadata: path.endsWith('.md') ? noteMetadata(path, content, state.documents[path]?.backlinks || []) : state.documents[path]?.metadata || null } },
      activeContent: state.activePath === path ? content : state.activeContent }));
    try { persistDraftBases(get().vault?.id || 'default', Object.fromEntries(Object.keys(drafts).map((path) => [path, get().documents[path]?.base]))); persistDrafts(get().vault?.id || 'default', drafts); set({ recoveryError: null }); }
    catch { set({ recoveryError: 'No se pudo conservar el borrador local. Mantén esta ventana abierta hasta guardar.' }); }
  };
  const reloadWorkspace = async (from?: string, to?: string, removed?: string) => {
    documentRequests.clear(); linkRequests.clear(); graphSequence++;
    const map = (path: string) => from && to ? remapPath(path, from, to) : path;
    const keep = (path: string) => !removed || (path !== removed && !path.startsWith(`${removed}/`));
    const panes = get().panes.map((pane) => {
      const tabs = pane.tabs.filter(keep).map(map);
      const history = pane.history.filter((entry) => keep(entry.path)).map((entry) => ({ ...entry, path: map(entry.path) }));
      const previousIndex = pane.history.slice(0, pane.historyIndex + 1).filter((entry) => keep(entry.path)).length - 1;
      const activePath = pane.activePath && keep(pane.activePath) ? map(pane.activePath) : tabs.at(-1) || null;
      return { ...pane, tabs, activePath, pinned: pane.pinned.filter(keep).map(map), history, historyIndex: pane.activePath && keep(pane.activePath) ? previousIndex : history.map((entry) => entry.path).lastIndexOf(activePath || "") };
    });
    const noteModes = Object.fromEntries(Object.entries(get().noteModes).filter(([path]) => keep(path)).map(([path, mode]) => [map(path), mode]));
    const vaultId = get().vault?.id;
    if (vaultId && from && to) {
      const saved = readSavedWorkspaces(vaultId);
      if (saved.length) {
        try {
          writeSavedWorkspaces(vaultId, saved.map(({ name, layout }) => ({
            name,
            layout: {
              ...layout,
              panes: layout.panes.map((pane) => ({
                ...pane,
                tabs: pane.tabs.map(map),
                pinned: pane.pinned.map(map),
                activePath: pane.activePath ? map(pane.activePath) : null,
                history: pane.history.map((entry) => ({ ...entry, path: map(entry.path) })),
              })),
              noteModes: Object.fromEntries(Object.entries(layout.noteModes).map(([path, mode]) => [map(path), mode])),
            },
          })));
        } catch {
          set({ recoveryError: 'No se pudieron actualizar las rutas de los espacios guardados' });
        }
      }
    }
    set({ documents: {}, knownExcalidrawNotes: {}, noteModes });
    updatePanes(panes);
    await Promise.all([get().loadTree(), get().loadGraph()]);
    set({ isLoading: false });
    await Promise.all(panes.filter((pane) => pane.activePath).map((pane) => get().openNote(pane.activePath!, pane.id, false)));
  };
  const activateVault = async (vault: VaultInfo) => {
    openSequence++; fingerprint = "";
    documentRequests.clear(); linkRequests.clear();
    searchSequence++;
    saveFailures.clear();
    set({ ...initialWorkspace(), documents: {}, conflicts: {}, externalError: null, vault, openTabs: [], activePath: null, activeContent: '', activeMetadata: null, navigationAnchor: '', navigationNonce: 0,
      backlinks: [], graphData: null, graphLoading: false, graphError: null, tree: null, knownExcalidrawNotes: {},
      noteLoadState: 'idle', noteError: null, saveError: null, noteModes: {},
      drafts: readDrafts(vault.id), searchQuery: '', searchError: null, searchResults: [] });
    await Promise.all([get().loadTree(), get().loadGraph()]);
    const layout = readWorkspace(vault.id);
    set({ ...layout, isLoading: false });
    updatePanes(layout.panes, layout.activePaneId);
    await Promise.all(layout.panes.filter((pane) => pane.activePath).map((pane) => get().openNote(pane.activePath!, pane.id, false)));
    get().focusPane(layout.activePaneId);
  };
  return {
    ...initialWorkspace(), documents: {}, commandPaletteOpen: false, fileOperationPath: null, trashOpen: false, trashEntries: [],
    conflicts: {}, externalError: null,
    vault: null, tree: null, activePath: null, activeContent: '', activeMetadata: null, navigationAnchor: '', navigationNonce: 0,
    noteLoadState: 'idle', noteError: null, saveError: null, recoveryError: null, drafts: {},
    backlinks: [], openTabs: [], viewMode: 'editor', noteMode: 'live', noteModes: {}, graphData: null, graphLoading: false, graphError: null,
    isSaving: false, isLoading: false, searchOpen: false, searchQuery: '', searchError: null, searchResults: [],
    knownExcalidrawNotes: {},
    sidebarPosition: (typeof localStorage !== 'undefined' && localStorage.getItem('jademd_sidebar_position') === 'left') ? 'left' : 'right',
    activeInspectorTab: 'tree', zenMode: false,

    initializeVault: () => {
      if (!initializePromise) initializePromise = (async () => {
        set({ isLoading: true });
        try {
          const entries = savedVaults();
          if (entries.length === 1 && entries[0].kind === 'local') {
            const entry = entries[0];
            await activateVault(await api.openLocalVault(entry.path, entry.name));
            rememberVault(entry);
          } else if (entries.length === 0) {
            // Compatibility with an explicitly supplied CLI vault.
            try {
              const info = await api.getVaultInfo();
              await activateVault(info);
              if (info.storage_type === 'local') rememberVault({ key: `local:${info.path}`, kind: 'local', path: info.path, name: info.name });
            } catch (error) {
              if ((error as { status?: number }).status !== 404) throw error;
            }
          }
        }
        catch (e) { set({ noteError: e instanceof Error ? e.message : String(e) }); }
        finally { set({ isLoading: false }); }
      })();
      return initializePromise;
    },
    openLocalVault: async (path, name) => {
      if (get().isLoading) throw new Error('Hay otra operación de bóveda en curso');
      set({ isLoading: true });
      try { await get().flushPendingSaves(); const info = await api.openLocalVault(path, name); await activateVault(info);
        rememberVault({ key: `local:${info.path}`, kind: 'local', path: info.path, name: info.name }); }
      finally { set({ isLoading: false }); }
    },
    openWebdavVault: async (endpoint, user, pass, root, name) => {
      if (get().isLoading) throw new Error('Hay otra operación de bóveda en curso');
      set({ isLoading: true });
      try { await get().flushPendingSaves(); const info = await api.openWebdavVault(endpoint, user, pass, root, name); await activateVault(info);
        rememberVault({ key: `webdav:${endpoint}:${root || ''}:${user || ''}`, kind: 'webdav', path: endpoint, root, username: user, name: info.name }); }
      finally { set({ isLoading: false }); }
    },
    openGdriveVault: async (params) => {
      if (get().isLoading) throw new Error('Hay otra operación de bóveda en curso');
      set({ isLoading: true });
      try { await get().flushPendingSaves(); await activateVault(await api.openGdriveVault(params)); }
      finally { set({ isLoading: false }); }
    },
    loadTree: async () => {
      const vaultId = get().vault?.id;
      try { const tree = await api.getVaultTree(); if (get().vault?.id === vaultId) set({ tree }); }
      catch (e) { set({ noteError: e instanceof Error ? e.message : String(e) }); }
    },
    openNote: async (path, paneId, addHistory = true) => {
      if (get().isLoading) return;
      const id = paneId || get().activePaneId;
      const pane = get().panes.find((pane) => pane.id === id);
      if (!pane) return;
      const previous = pane.activePath;
      const history = addHistory && previous !== path ? [...pane.history.slice(0, pane.historyIndex + 1), { path }].slice(-100) : pane.history;
      updatePanes(get().panes.map((item) => item.id !== id ? item : { ...item, activePath: path,
        tabs: item.tabs.includes(path) ? item.tabs : [...item.tabs, path], history,
        historyIndex: history !== item.history ? history.length - 1 : item.historyIndex }));
      set({ viewMode: get().viewMode === 'graph' ? 'editor' : get().viewMode, navigationAnchor: '' });
      if (get().documents[path]?.loadState === 'ready') { set((state) => project(state)); return; }
      const sequence = ++openSequence;
      documentRequests.set(path, sequence);
      const vaultId = get().vault?.id;
      const current = () => documentRequests.get(path) === sequence && get().vault?.id === vaultId && documentOpen(path);
      set((state) => {
        const documents = { ...state.documents, [path]: { content: '', metadata: null, backlinks: [], loadState: 'loading' as const, error: null } };
        return { documents, ...project({ ...state, documents }) };
      });
      try {
        const isBinary = /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico|pdf)$/i.test(path);
        const content = isBinary ? '' : Object.hasOwn(get().drafts, path) ? get().drafts[path] : await api.readNote(path);
        if (!current()) return;
        const backlinks = path.endsWith('.md') ? await api.getBacklinks(path).catch(() => []) : [];
        if (!current()) return;
        set((state) => {
          const documents = { ...state.documents, [path]: { content: state.drafts[path] ?? content, loadState: 'ready' as const,
            error: null, base: Object.hasOwn(state.drafts, path) ? readDraftBases(vaultId || 'default')[path] : content, backlinks, metadata: isBinary ? null : noteMetadata(path, state.drafts[path] ?? content, backlinks) } };
          return { documents, ...project({ ...state, documents }), knownExcalidrawNotes: { ...state.knownExcalidrawNotes, [path]: isExcalidrawFile(path, content) } };
        });
      } catch (error) {
        if (current()) set((state) => {
          const documents = { ...state.documents, [path]: { ...state.documents[path], loadState: 'error' as const, error: error instanceof Error ? error.message : String(error) } };
          return { documents, ...project({ ...state, documents }) };
        });
      }
    },
    recoverInterruptedOperation: async (id, from, to) => {
      if (get().isLoading) throw new Error('Hay otra operación en curso');
      set({ isLoading: true });
      try {
        await get().flushPendingSaves(); await api.recoverOperation(id);
        const productivity = useProductivityStore.getState(); productivity.activate(get().vault!.id);
        try { productivity.remap(to, from); } catch (error) { set({ recoveryError: `La recuperación terminó, pero no se actualizaron los marcadores: ${error instanceof Error ? error.message : String(error)}` }); }
        await reloadWorkspace(to, from);
      }
      finally { set({ isLoading: false }); }
    },
    refreshExternalChanges: async (manual = false) => {
      const { vault, isLoading } = get();
      if (refreshing || isLoading || !vault) return;
      refreshing = true;
      const vaultId = vault.id;
      const fullRefresh = manual || vault.storage_type === 'local';
      try {
        if (fullRefresh) {
          const nextFingerprint = await api.refreshVault();
          if (get().vault?.id !== vaultId || get().isLoading) return;
          if (fingerprint !== nextFingerprint) {
            await Promise.all([get().loadTree(), get().loadGraph()]);
            if (get().vault?.id !== vaultId || get().isLoading) return;
            fingerprint = nextFingerprint;
          }
        }
        const visiblePaths = new Set(get().panes.map((pane) => pane.activePath));
        for (const [path, snapshot] of Object.entries(get().documents)) {
          if (!fullRefresh && !visiblePaths.has(path)) continue;
          if (snapshot.loadState !== 'ready' || /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico|pdf)$/i.test(path) || writes.has(path)) continue;
          let remote: string | null;
          try { remote = await api.readNote(path); } catch (error) { if ((error as { status?: number }).status !== 404) throw error; remote = null; }
          if (get().vault?.id !== vaultId || get().isLoading) return;
          if (writes.has(path) || get().documents[path]?.base !== snapshot.base) continue;
          if (remote === snapshot.base) continue;
          if (Object.hasOwn(get().drafts, path) || remote === null || get().conflicts[path]) {
            const timer = timers.get(path); if (timer) clearTimeout(timer); timers.delete(path);
            set((state) => ({ conflicts: { ...state.conflicts, [path]: { base: snapshot.base, remote } } }));
          } else {
            set((state) => {
              const documents = { ...state.documents, [path]: { ...state.documents[path], content: remote!, base: remote, metadata: noteMetadata(path, remote!, []) } };
              return { documents, ...project({ ...state, documents }) };
            });
          }
        }
        if (get().vault?.id === vaultId) set({ externalError: null });
      } catch (error) { if (get().vault?.id === vaultId) set({ externalError: `No se pudieron comprobar cambios externos: ${error instanceof Error ? error.message : String(error)}` }); }
      finally { refreshing = false; }
    },
    resolveConflict: async (path, choice, content, copyPath) => {
      const conflict = get().conflicts[path]; if (!conflict) return;
      const timer = timers.get(path); if (timer) clearTimeout(timer); timers.delete(path);
      saveGenerations.set(path, (saveGenerations.get(path) || 0) + 1);
      const local = get().drafts[path] ?? get().documents[path]?.content ?? '';
      if (choice === 'copy') {
        if (!copyPath?.trim()) throw new Error('Indica una ruta para la copia');
        await api.createNote(copyPath.trim(), local);
      }
      if (choice === 'merge') {
        // Reuse checked save: another external edit during the dialog remains a conflict.
        set((state) => { const conflicts = { ...state.conflicts }; delete conflicts[path]; return { conflicts, documents: { ...state.documents, [path]: { ...state.documents[path], base: conflict.remote } } }; });
        await get().saveCurrentNote(content ?? local, path);
      } else {
        const drafts = { ...get().drafts }; delete drafts[path];
        persistDrafts(get().vault!.id, drafts);
        const conflicts = { ...get().conflicts }; delete conflicts[path];
        const documents = { ...get().documents, [path]: { ...get().documents[path], base: conflict.remote, content: conflict.remote ?? '', metadata: conflict.remote === null ? null : noteMetadata(path, conflict.remote, []), loadState: conflict.remote === null ? 'error' as const : 'ready' as const, error: conflict.remote === null ? 'Archivo eliminado externamente. La copia local se ha conservado si elegiste guardar copia.' : null } };
        set((state) => ({ conflicts, drafts, documents, ...project({ ...state, documents, drafts }) }));
      }
      saveFailures.delete(path); set({ saveError: saveFailures.values().next().value || null });
      await Promise.all([get().loadTree(), get().loadGraph()]);
    },
    focusPane: (id) => set((state) => project(state, id)),
    splitPane: (direction, paneId = get().activePaneId) => {
      const state = get();
      if (state.isLoading || state.panes.length >= 4) return;
      const current = state.panes.find((pane) => pane.id === paneId);
      if (!current) return;
      const pane = emptyPane(`pane-${crypto.randomUUID()}`);
      if (current.activePath) { pane.activePath = current.activePath; pane.tabs = [current.activePath]; pane.history = [{ path: current.activePath }]; pane.historyIndex = 0; }
      const splitTree = replacePane(state.splitTree, current.id, {
        id: crypto.randomUUID(), direction, ratio: 0.5,
        first: { paneId: current.id }, second: { paneId: pane.id },
      });
      const panes = [...state.panes, pane];
      set({ panes, splitTree, ...project({ ...state, panes }, pane.id) });
    },
    closePane: (id) => {
      const state = get();
      if (state.isLoading || state.panes.length <= 1 || !state.panes.some((pane) => pane.id === id)) return;
      linkRequests.delete(id);
      const panes = state.panes.filter((pane) => pane.id !== id);
      const splitTree = removePane(state.splitTree, id)!;
      set({ panes, splitTree, ...project({ ...state, panes }, state.activePaneId === id ? panes[0].id : state.activePaneId) });
    },
    resizePaneSplit: (id, ratio) => {
      if (Number.isFinite(ratio) && !get().isLoading) set((state) => ({ splitTree: resizeSplit(state.splitTree, id, ratio) }));
    },
    restoreWorkspace: async (layout) => {
      if (!get().vault || get().isLoading) throw new Error('Espera a que termine la operación actual');
      set({ isLoading: true });
      try {
        await get().flushPendingSaves();
      } catch (error) {
        set({ isLoading: false });
        throw error;
      }
      linkRequests.clear();
      set((state) => ({
        ...layout, isLoading: false, viewMode: 'editor',
        ...project({ ...state, ...layout }, layout.activePaneId),
      }));
      await Promise.all(layout.panes.map((pane) => pane.activePath ? get().openNote(pane.activePath, pane.id, false) : undefined));
    },
    navigateHistory: async (delta, paneId) => {
      const id = paneId || get().activePaneId;
      const pane = get().panes.find((pane) => pane.id === id);
      if (!pane) return;
      linkRequests.delete(id);
      const index = pane.historyIndex + delta;
      if (index < 0 || index >= pane.history.length) return;
      updatePanes(get().panes.map((item) => item.id === id ? { ...item, historyIndex: index } : item));
      await get().openNote(pane.history[index].path, id, false);
      if (get().activePaneId === id) set((state) => ({ navigationAnchor: pane.history[index].anchor || '', navigationNonce: state.navigationNonce + 1 }));
    },
    togglePinTab: (path, paneId) => {
      const id = paneId || get().activePaneId;
      updatePanes(get().panes.map((pane) => pane.id !== id ? pane : { ...pane, pinned: pane.pinned.includes(path) ? pane.pinned.filter((item) => item !== path) : [...pane.pinned, path] }));
    },
    reorderTab: (path, before, paneId) => {
      const id = paneId || get().activePaneId;
      updatePanes(get().panes.map((pane) => {
        if (pane.id !== id || path === before || !pane.tabs.includes(path) || !pane.tabs.includes(before)) return pane;
        const tabs = pane.tabs.filter((item) => item !== path); tabs.splice(tabs.indexOf(before), 0, path); return { ...pane, tabs };
      }));
    },
    setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
    navigateToLink: async (target, source, paneId) => {
      const id = paneId || get().activePaneId;
      const owner = get().panes.find((pane) => pane.id === id)?.activePath;
      const origin = source || owner || '';
      const vaultId = get().vault?.id;
      const sequence = ++linkSequence;
      linkRequests.set(id, sequence);
      try {
        const path = await api.resolveEntry(target, origin);
        if (linkRequests.get(id) !== sequence || get().vault?.id !== vaultId || get().panes.find((pane) => pane.id === id)?.activePath !== owner) return;
        await get().openNote(path, id);
        if (linkRequests.get(id) !== sequence || get().panes.find((pane) => pane.id === id)?.activePath !== path) return;
        const anchor = target.includes('#') ? target.slice(target.indexOf('#') + 1) : '';
        updatePanes(get().panes.map((pane) => {
          if (pane.id !== id) return pane;
          const history = [...pane.history];
          if (owner === path && history[pane.historyIndex]?.anchor !== anchor) {
            const next = [...history.slice(0, pane.historyIndex + 1), { path, anchor }].slice(-100);
            return { ...pane, history: next, historyIndex: next.length - 1 };
          }
          if (pane.historyIndex >= 0) history[pane.historyIndex] = { path, anchor };
          return { ...pane, history };
        }));
        if (get().activePaneId === id) set((state) => ({ navigationAnchor: anchor, navigationNonce: state.navigationNonce + 1 }));
      } catch (error) { set({ noteError: error instanceof Error ? error.message : String(error) }); }
    },
    closeTab: (path, paneId) => {
      const id = paneId || get().activePaneId;
      const pane = get().panes.find((pane) => pane.id === id);
      if (!pane || pane.pinned.includes(path)) return;
      const tabs = pane.tabs.filter((tab) => tab !== path);
      const wasActive = pane.activePath === path;
      const next = wasActive ? tabs.at(-1) || null : pane.activePath;
      linkRequests.delete(id);
      updatePanes(get().panes.map((item) => item.id !== id ? item : { ...item, tabs, activePath: wasActive && next ? item.activePath : next }));
      if (wasActive && next) void get().openNote(next, id);
    },

    queueNoteSave: (content, path, delay = 400) => {
      if (get().isLoading || get().documents[path]?.loadState !== 'ready' || !documentOpen(path)) return;
      recordDraft(path, content);
      if (get().conflicts[path]) return;
      const previous = timers.get(path);
      if (previous) clearTimeout(previous);
      const vaultId = get().vault?.id;
      timers.set(path, setTimeout(() => {
        timers.delete(path);
        if (get().vault?.id === vaultId) void get().saveCurrentNote(content, path).catch(() => {});
      }, delay));
    },

    saveCurrentNote: async (content: string, forPath?: string) => {
      const targetPath = forPath || get().activePath;
      if (!targetPath) throw new Error('No hay documento para guardar');
      const timer = timers.get(targetPath);
      if (timer) { clearTimeout(timer); timers.delete(targetPath); }
      recordDraft(targetPath, content);
      const vaultId = get().vault?.id;
      const generation = saveGenerations.get(targetPath) || 0;
      const previous = writes.get(targetPath) || Promise.resolve();
      const task = previous.catch(() => {}).then(async () => {
        if (get().vault?.id !== vaultId) throw new Error('La bóveda cambió antes de guardar');
        if ((saveGenerations.get(targetPath) || 0) !== generation) throw new Error('Guardado anterior cancelado al resolver el conflicto');
        if (get().conflicts[targetPath]) throw Object.assign(new Error('Resuelve el conflicto antes de guardar'), { status: 409 });
        const knownBase = get().documents[targetPath]?.base;
        const base = knownBase !== undefined ? knownBase : readDraftBases(vaultId || 'default')[targetPath];
        if (base === undefined) throw Object.assign(new Error('El borrador no conserva una versión base; compara las versiones'), { status: 409 });
        const meta = await api.saveNote(targetPath, content, base);
        set((state) => ({ documents: { ...state.documents, [targetPath]: { ...state.documents[targetPath], base: content } } }));
        if (get().vault?.id !== vaultId) return;
        if (get().drafts[targetPath] === content) {
          const drafts = { ...get().drafts };
          delete drafts[targetPath];
          set({ drafts });
          try { persistDrafts(vaultId || 'default', drafts); }
          catch { set({ recoveryError: 'No se pudo actualizar la recuperación local.' }); }
        }
        set((state) => {
          const doc = state.documents[targetPath];
          if (!doc || doc.content !== content) return {};
          const documents = { ...state.documents, [targetPath]: { ...doc, metadata: meta } };
          return { documents, ...(state.activePath === targetPath ? { activeMetadata: meta } : {}) };
        });
        saveFailures.delete(targetPath);
        set({ saveError: saveFailures.values().next().value || null });
      });
      writes.set(targetPath, task);
      set({ isSaving: true });
      try { await task; }
      catch (e) {
        if ((e as { status?: number }).status === 409 && !get().conflicts[targetPath]) {
          try {
            let remote: string | null;
            try { remote = await api.readNote(targetPath); } catch (error) { if ((error as { status?: number }).status !== 404) throw error; remote = null; }
            if (get().vault?.id === vaultId) set((state) => ({ conflicts: { ...state.conflicts, [targetPath]: { base: state.documents[targetPath]?.base, remote } } }));
          } catch { /* Keep draft; retry will fetch the current version. */ }
        }
        const message = `No se guardó ${targetPath}: ${e instanceof Error ? e.message : String(e)}`;
        saveFailures.set(targetPath, message);
        set({ saveError: message });
        throw e;
      } finally {
        if (writes.get(targetPath) === task) writes.delete(targetPath);
        set({ isSaving: writes.size > 0 });
      }
    },

    flushPendingSaves: async () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      // Include recovered and failed drafts, not just scheduled timers.
      const results = await Promise.allSettled(Object.entries(get().drafts)
        .map(([path, content]) => get().saveCurrentNote(content, path)));
      await Promise.all(writes.values());
      const failed = results.find((result) => result.status === 'rejected');
      if (failed?.status === 'rejected') throw failed.reason;
    },

    createNewNote: async (path: string) => {
      try {
        await api.createNote(path);
        await get().loadTree();
        await get().openNote(path);
        await get().loadGraph();
      } catch (e) {
        set({ noteError: `No se creó la nota: ${e instanceof Error ? e.message : String(e)}` });
      }
    },

    createNewFolder: async (path: string) => {
      try {
        await api.createFolder(path);
        await get().loadTree();
      } catch (e) {
        set({ noteError: `No se creó la carpeta: ${e instanceof Error ? e.message : String(e)}` });
      }
    },

    deleteItem: async (path) => {
      if (get().isLoading || !confirm(`¿Mover "${path}" a la papelera de la bóveda?`)) return;
      set({ isLoading: true, noteError: null });
      try {
        await get().flushPendingSaves();
        await api.trashEntry(path);
        await reloadWorkspace(undefined, undefined, path);
      } catch (error) { set({ noteError: error instanceof Error ? error.message : String(error) }); }
      finally { set({ isLoading: false }); }
    },
    moveItem: async (from, to) => {
      if (get().isLoading) throw new Error('Hay otra operación en curso');
      set({ isLoading: true, noteError: null });
      try {
        await get().flushPendingSaves();
        await api.moveEntry(from, to);
        const productivity = useProductivityStore.getState();
        productivity.activate(get().vault!.id);
        try { productivity.remap(from, to); } catch (error) { set({ recoveryError: `El movimiento terminó, pero no se actualizaron los marcadores: ${error instanceof Error ? error.message : String(error)}` }); }
        await reloadWorkspace(from, to);
        set({ fileOperationPath: null });
      } catch (error) { set({ noteError: error instanceof Error ? error.message : String(error) }); throw error; }
      finally { set({ isLoading: false }); }
    },
    loadTrash: async () => {
      try { set({ trashEntries: await api.listTrash() }); }
      catch (error) { set({ noteError: error instanceof Error ? error.message : String(error) }); }
    },
    restoreItem: async (id) => {
      if (get().isLoading) return;
      set({ isLoading: true, noteError: null });
      try { await get().flushPendingSaves(); await api.restoreEntry(id); await reloadWorkspace(); await get().loadTrash(); }
      catch (error) { set({ noteError: error instanceof Error ? error.message : String(error) }); }
      finally { set({ isLoading: false }); }
    },
    setTrashOpen: (trashOpen) => set({ trashOpen }),
    setFileOperationPath: (fileOperationPath) => set({ fileOperationPath }),

    setViewMode: (mode) => set({ viewMode: mode }),
    setNoteMode: (mode, path) => set((state) => { const target = path || state.activePath; return { noteMode: target === state.activePath ? mode : state.noteMode, noteModes: target ? { ...state.noteModes, [target]: mode } : state.noteModes }; }),

    loadGraph: async () => {
      const sequence = ++graphSequence;
      const vaultId = get().vault?.id;
      if (!vaultId) return;
      set({ graphLoading: true, graphError: null });
      const isCurrent = () => get().vault?.id === vaultId && sequence === graphSequence;
      try {
        const graphData = await api.getGraph();
        if (isCurrent()) set({ graphData, graphLoading: false });
      } catch (error) {
        if (isCurrent()) set({ graphLoading: false, graphError: error instanceof Error ? error.message : String(error) });
      }
    },

    setSearchOpen: (open: boolean) => set({ searchOpen: open }),

    performSearch: async (query: string) => {
      const sequence = ++searchSequence;
      set({ searchQuery: query, searchError: null });
      if (!query.trim()) {
        set({ searchResults: [] });
        return;
      }
      try {
        const results = await api.search(query);
        if (sequence === searchSequence) set({ searchResults: results });
      } catch (e) {
        if (sequence === searchSequence) set({ searchResults: [], searchError: e instanceof Error ? e.message : String(e) });
      }
    },

    setSidebarPosition: (pos) => {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('jademd_sidebar_position', pos);
      }
      set({ sidebarPosition: pos });
    },

    setActiveInspectorTab: (tab) => set({ activeInspectorTab: tab }),

    toggleZenMode: () => set((state) => ({ zenMode: !state.zenMode })),
  };
});

if (typeof window !== 'undefined') {
  (window as any).useVaultStore = useVaultStore;
}

let lastWorkspace = '';
useVaultStore.subscribe((state) => {
  if (!state.vault || state.isLoading) return;
  const layout = { panes: state.panes, activePaneId: state.activePaneId, splitTree: state.splitTree, noteModes: state.noteModes };
  const serialized = state.vault.id + JSON.stringify(layout);
  if (serialized === lastWorkspace) return;
  lastWorkspace = serialized;
  try { writeWorkspace(state.vault.id, layout); } catch { /* Document drafts report their own persistence failures. */ }
});
