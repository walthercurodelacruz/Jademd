import { FileNode, GraphData, NoteMetadata, SearchResult, VaultInfo } from '../types';

const API_BASE = '/api';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const json: ApiResponse<T> = await res.json();
  if (!json.success || json.data === undefined) {
    throw new Error(json.error || 'Error en la petición a la API');
  }

  return json.data;
}

export const api = {
  // Vault
  openLocalVault: (path: string, name?: string) =>
    request<VaultInfo>('/vault/open-local', {
      method: 'POST',
      body: JSON.stringify({ path, name }),
    }),

  openWebdavVault: (endpoint: string, username?: string, password?: string, root?: string, name?: string) =>
    request<VaultInfo>('/vault/open-webdav', {
      method: 'POST',
      body: JSON.stringify({ endpoint, username, password, root, name }),
    }),

  openGdriveVault: (params: {
    name?: string;
    accessToken?: string;
    refreshToken?: string;
    clientId?: string;
    clientSecret?: string;
    root?: string;
  }) =>
    request<VaultInfo>('/vault/open-gdrive', {
      method: 'POST',
      body: JSON.stringify({
        name: params.name,
        access_token: params.accessToken,
        refresh_token: params.refreshToken,
        client_id: params.clientId,
        client_secret: params.clientSecret,
        root: params.root,
      }),
    }),

  getVaultInfo: () => request<VaultInfo>('/vault/info'),
  getVaultTree: () => request<FileNode>('/vault/tree'),
  reindexVault: () => request<number>('/vault/reindex', { method: 'POST' }),

  // Notes
  readNote: (path: string) => request<string>(`/note?path=${encodeURIComponent(path)}`),
  saveNote: (path: string, content: string) =>
    request<NoteMetadata>('/note', {
      method: 'POST',
      body: JSON.stringify({ path, content }),
    }),
  createNote: (path: string) =>
    request<NoteMetadata>('/note/create', {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),
  createFolder: (path: string) =>
    request<boolean>('/folder/create', {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),
  deleteEntry: (path: string) =>
    request<boolean>(`/note?path=${encodeURIComponent(path)}`, {
      method: 'DELETE',
    }),

  // Graph & Search
  getGraph: () => request<GraphData>('/graph'),
  getBacklinks: (title: string) =>
    request<string[]>(`/backlinks?title=${encodeURIComponent(title)}`),
  search: (query: string) =>
    request<SearchResult[]>(`/search?q=${encodeURIComponent(query)}`),
};
