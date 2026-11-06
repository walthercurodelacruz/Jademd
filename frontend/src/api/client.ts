import { TrashEntry, MoveResult, FileNode, GraphData, NoteMetadata, SearchResult, VaultInfo } from '../types';

const API_BASE = '/api';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

let session: Promise<string> | undefined;
async function sessionToken(): Promise<string> {
  if (!session) session = fetch(`${API_BASE}/session`, { credentials: 'same-origin' }).then(async (response) => {
    const json: ApiResponse<string> = await response.json();
    if (!response.ok || !json.success || !json.data) throw new Error(json.error || 'No se pudo iniciar la sesión');
    return json.data;
  }).catch((error) => { session = undefined; throw error; });
  return session;
}

async function request<T>(endpoint: string, options?: RequestInit, retry = true): Promise<T> {
  const token = await sessionToken();
  const headers = new Headers(options?.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, credentials: 'same-origin', headers });
  if (res.status === 401 && retry) {
    session = undefined;
    return request<T>(endpoint, options, false);
  }
  const json: ApiResponse<T> = await res.json().catch(() => { throw new Error(`Respuesta inesperada del servidor (${res.status})`); });
  if (!res.ok || !json.success || json.data === undefined) throw Object.assign(new Error(json.error || `Error HTTP ${res.status}`), { status: res.status });
  return json.data;
}

export interface FolderListing {
  current: string | null;
  parent: string | null;
  folders: { label: string; path: string }[];
}

export const api = {
  browseFolders: (path?: string, signal?: AbortSignal) =>
    request<FolderListing>(`/vault/folders${path ? `?${new URLSearchParams({ path })}` : ''}`, { signal }),

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
  pendingOperations: () => request<{ id: string; from: string; to: string }[]>('/recovery'),
  recoverOperation: (id: string) => request<boolean>('/recovery/restore', { method: 'POST', body: JSON.stringify({ id }) }),
  refreshVault: () => request<string>('/vault/refresh', { method: 'POST' }),
  reindexVault: () => request<number>('/vault/reindex', { method: 'POST' }),

  // Notes
  readNote: (path: string) => request<string>(`/note?path=${encodeURIComponent(path)}`),
  saveNote: (path: string, content: string, expected: string | null) =>
    request<NoteMetadata>('/note', {
      method: 'POST',
      body: JSON.stringify({ path, content, check_version: true, expected_content: expected }),
    }),
  createNote: (path: string, content?: string, vaultId?: string) =>
    request<NoteMetadata>('/note/create', {
      method: 'POST',
      body: JSON.stringify({ path, content, vault_id: vaultId }),
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

  saveAsset: (path: string, content_base64: string) => request<string>('/asset', {
    method: 'POST', body: JSON.stringify({ path, content_base64 }),
  }),

  resolveEntry: (target: string, source: string) => request<string>(`/resolve?path=${encodeURIComponent(target)}&source=${encodeURIComponent(source)}`),

  moveEntry: (from: string, to: string) => request<MoveResult>('/entry/move', { method: 'POST', body: JSON.stringify({ from, to }) }),
  trashEntry: (path: string) => request<TrashEntry>('/trash', { method: 'POST', body: JSON.stringify({ path }) }),
  listTrash: () => request<TrashEntry[]>('/trash'),
  restoreEntry: (id: string) => request<TrashEntry>('/trash/restore', { method: 'POST', body: JSON.stringify({ id }) }),

  indexedNotes: () => request<NoteMetadata[]>('/notes/properties'),
  tags: () => request<{ tag: string; count: number }[]>('/tags'),
  connections: (path: string) => request<{ outgoing: { target: string; path: string | null }[]; unlinked: { path: string; line: number; content: string }[] }>(`/connections?path=${encodeURIComponent(path)}`),
  // Graph & Search
  getGraph: () => request<GraphData>('/graph'),
  getBacklinks: (title: string) =>
    request<string[]>(`/backlinks?title=${encodeURIComponent(title)}`),
  search: (query: string) =>
    request<SearchResult[]>(`/search?q=${encodeURIComponent(query)}`),
};
