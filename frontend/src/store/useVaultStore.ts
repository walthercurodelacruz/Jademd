import { create } from 'zustand';
import { FileNode, GraphData, NoteMetadata, SearchResult, VaultInfo } from '../types';
import { api } from '../api/client';

interface VaultState {
  vault: VaultInfo | null;
  tree: FileNode | null;
  activePath: string | null;
  activeContent: string;
  activeMetadata: NoteMetadata | null;
  backlinks: string[];
  openTabs: string[];
  viewMode: 'editor' | 'graph' | 'split';
  noteMode: 'live' | 'reading' | 'split-preview';
  graphData: GraphData | null;
  isSaving: boolean;
  isLoading: boolean;
  searchOpen: boolean;
  searchQuery: string;
  searchResults: SearchResult[];

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
  openNote: (path: string) => Promise<void>;
  closeTab: (path: string) => void;
  saveCurrentNote: (content: string) => Promise<void>;
  createNewNote: (path: string) => Promise<void>;
  createNewFolder: (path: string) => Promise<void>;
  deleteItem: (path: string) => Promise<void>;
  setViewMode: (mode: 'editor' | 'graph' | 'split') => void;
  setNoteMode: (mode: 'live' | 'reading' | 'split-preview') => void;
  loadGraph: () => Promise<void>;
  setSearchOpen: (open: boolean) => void;
  performSearch: (query: string) => Promise<void>;
}

export const useVaultStore = create<VaultState>((set, get) => ({
  vault: null,
  tree: null,
  activePath: null,
  activeContent: '',
  activeMetadata: null,
  backlinks: [],
  openTabs: [],
  viewMode: 'editor',
  noteMode: 'live',
  graphData: null,
  isSaving: false,
  isLoading: false,
  searchOpen: false,
  searchQuery: '',
  searchResults: [],

  openLocalVault: async (path: string, name?: string) => {
    set({ isLoading: true });
    try {
      const vault = await api.openLocalVault(path, name);
      set({ vault, openTabs: [], activePath: null, activeContent: '' });
      await get().loadTree();
      await get().loadGraph();
    } catch (e) {
      console.error(e);
      alert(`No se pudo abrir la bóveda: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      set({ isLoading: false });
    }
  },

  openWebdavVault: async (endpoint: string, user?: string, pass?: string, root?: string, name?: string) => {
    set({ isLoading: true });
    try {
      const vault = await api.openWebdavVault(endpoint, user, pass, root, name);
      set({ vault, openTabs: [], activePath: null, activeContent: '' });
      await get().loadTree();
    } catch (e) {
      console.error(e);
      alert(`Error al conectar con WebDAV: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      set({ isLoading: false });
    }
  },

  openGdriveVault: async (params) => {
    set({ isLoading: true });
    try {
      const vault = await api.openGdriveVault(params);
      set({ vault, openTabs: [], activePath: null, activeContent: '' });
      await get().loadTree();
    } catch (e) {
      console.error(e);
      alert(`Error al conectar con Google Drive: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      set({ isLoading: false });
    }
  },

  loadTree: async () => {
    try {
      const tree = await api.getVaultTree();
      set({ tree });
    } catch (e) {
      console.error('Error cargando el árbol de archivos', e);
    }
  },

  openNote: async (path: string) => {
    if (!path.endsWith('.md')) return;
    try {
      const content = await api.readNote(path);
      const title = path.replace(/\.md$/, '').split('/').pop() || path;
      const backlinks = await api.getBacklinks(title).catch(() => []);

      set((state) => ({
        activePath: path,
        activeContent: content,
        backlinks,
        openTabs: state.openTabs.includes(path) ? state.openTabs : [...state.openTabs, path],
      }));
    } catch (e) {
      console.error(`Error abriendo nota ${path}:`, e);
    }
  },

  closeTab: (path: string) => {
    set((state) => {
      const newTabs = state.openTabs.filter((t) => t !== path);
      let nextActive = state.activePath;
      if (state.activePath === path) {
        nextActive = newTabs.length > 0 ? newTabs[newTabs.length - 1] : null;
      }
      return {
        openTabs: newTabs,
        activePath: nextActive,
      };
    });

    const next = get().activePath;
    if (next) {
      get().openNote(next);
    } else {
      set({ activeContent: '', activeMetadata: null, backlinks: [] });
    }
  },

  saveCurrentNote: async (content: string) => {
    const { activePath } = get();
    if (!activePath) return;

    set({ isSaving: true, activeContent: content });
    try {
      const meta = await api.saveNote(activePath, content);
      set({ activeMetadata: meta });
    } catch (e) {
      console.error('Error guardando la nota:', e);
    } finally {
      set({ isSaving: false });
    }
  },

  createNewNote: async (path: string) => {
    try {
      await api.createNote(path);
      await get().loadTree();
      await get().openNote(path);
      await get().loadGraph();
    } catch (e) {
      console.error('Error creando nota:', e);
    }
  },

  createNewFolder: async (path: string) => {
    try {
      await api.createFolder(path);
      await get().loadTree();
    } catch (e) {
      console.error('Error creando carpeta:', e);
    }
  },

  deleteItem: async (path: string) => {
    if (!confirm(`¿Estás seguro de eliminar "${path}"?`)) return;
    try {
      await api.deleteEntry(path);
      get().closeTab(path);
      await get().loadTree();
      await get().loadGraph();
    } catch (e) {
      console.error('Error eliminando elemento:', e);
    }
  },

  setViewMode: (mode) => set({ viewMode: mode }),
  setNoteMode: (mode) => set({ noteMode: mode }),

  loadGraph: async () => {
    try {
      const graphData = await api.getGraph();
      set({ graphData });
    } catch (e) {
      console.error('Error cargando el grafo:', e);
    }
  },

  setSearchOpen: (open: boolean) => set({ searchOpen: open }),

  performSearch: async (query: string) => {
    set({ searchQuery: query });
    if (!query.trim()) {
      set({ searchResults: [] });
      return;
    }
    try {
      const results = await api.search(query);
      set({ searchResults: results });
    } catch (e) {
      console.error('Error buscando:', e);
    }
  },
}));
