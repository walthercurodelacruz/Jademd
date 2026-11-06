// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { useVaultStore as store } from '../store/useVaultStore';
import { initialWorkspace } from '../utils/workspace';
import { ConnectionsPanel } from '../components/ConnectionsPanel';
import { SearchModal } from '../components/SearchModal';

vi.mock('../api/client', () => ({ api: {
  readNote: vi.fn(async () => 'Content'), getBacklinks: vi.fn(async () => []), resolveEntry: vi.fn(async () => 'Folder/B.md'),
  search: vi.fn(), connections: vi.fn(async () => ({ outgoing: [{ target: './B#Heading', path: 'Folder/B.md' }], unlinked: [{ path: 'Mention.md', line: 3, content: 'Mention text' }] })),
} }));
let container: HTMLDivElement; let root: Root;
beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  store.setState({ ...initialWorkspace(), documents: {}, drafts: {}, conflicts: {}, vault: { id: 'knowledge', name: 'Test', path: '/test', storage_type: 'local', last_opened: 0 }, isLoading: false, searchOpen: false, searchError: null, searchQuery: '', searchResults: [] });
  await store.getState().openNote('Folder/A.md');
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
it('shows outgoing links and unlinked mentions, navigating with the originating path', async () => {
  await act(async () => root.render(<ConnectionsPanel />));
  expect(container.textContent).toContain('Mention.md:3');
  expect(container.textContent).toContain('Mention text');
  const outgoing = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('./B#Heading'))!;
  await act(async () => outgoing.click());
  expect(api.resolveEntry).toHaveBeenCalledWith('./B#Heading', 'Folder/A.md');
  expect(store.getState().activePath).toBe('Folder/B.md');
});
it('shows query errors instead of retaining stale search results', async () => {
  vi.mocked(api.search).mockRejectedValueOnce(new Error('Cierra las comillas'));
  store.setState({ searchOpen: true, searchResults: [{ path: 'Old.md', title: 'Old result', matches: [] }] });
  await store.getState().performSearch('tag:work "unfinished');
  await act(async () => root.render(<SearchModal />));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Cierra las comillas');
  expect(container.textContent).not.toContain('Old result');
  expect(api.search).toHaveBeenCalledWith('tag:work "unfinished');
});
