// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { useProductivityStore as tools } from '../store/useProductivityStore';
import { useVaultStore as vault } from '../store/useVaultStore';
import { initialWorkspace } from '../utils/workspace';
import { CommandPalette } from '../components/CommandPalette';
import { ProductivityPanel } from '../components/ProductivityPanel';
import { api } from '../api/client';
vi.mock('../api/client', () => ({ api: {
  readNote: vi.fn(async () => '# A'), getBacklinks: vi.fn(async () => []),
  tags: vi.fn(async () => [{ tag: 'trabajo', count: 2 }, { tag: 'trabajo/proyecto', count: 1 }]), search: vi.fn(async () => []),
} }));
let container: HTMLDivElement; let root: Root;
beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); tools.setState({ vaultId: null }); tools.getState().activate('ui');
  vault.setState({ ...initialWorkspace(), documents: {}, drafts: {}, conflicts: {}, isLoading: false, isSaving: false, commandPaletteOpen: false, searchOpen: false,
    vault: { id: 'ui', name: 'Test', path: '/test', storage_type: 'local', last_opened: 0 } });
  await vault.getState().openNote('A.md');
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  await act(async () => root.render(<><CommandPalette /><ProductivityPanel /></>));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function click(label: string) {
  const button = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === label)!;
  expect(button).toBeDefined(); await act(async () => button.click());
}
it('executes customized shortcuts and deactivates the old binding', async () => {
  await act(async () => tools.getState().assignShortcut('bookmark', 'Mod+Shift+m'));
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'B', ctrlKey: true, shiftKey: true, bubbles: true })));
  expect(tools.getState().settings.bookmarks).toEqual([]);
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'M', ctrlKey: true, shiftKey: true, bubbles: true })));
  expect(tools.getState().settings.bookmarks).toEqual(['A.md']);
});
it('captures shortcut conflicts inside settings without executing document commands', async () => {
  await act(async () => tools.getState().show('shortcuts'));
  const input = container.querySelector('[aria-label="Atajo: Abrir nota diaria de hoy"]')!;
  await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', ctrlKey: true, bubbles: true })));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Buscar en la bóveda');
  expect(vault.getState().searchOpen).not.toBe(true);
});
it('shows tag counts and uses the shared advanced search when selecting a tag', async () => {
  await act(async () => tools.getState().show('tags'));
  const tag = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.startsWith('#trabajo/proyecto'))!;
  expect(tag.textContent).toContain('1');
  await act(async () => tag.click());
  expect(api.search).toHaveBeenCalledWith('tag:"trabajo/proyecto"');
  expect(vault.getState().searchOpen).toBe(true);
  expect(tools.getState().open).toBe(false);
});
it('marks the active document through the productivity panel', async () => {
  await act(async () => tools.getState().show('bookmarks'));
  await click('Marcar documento actual');
  expect(container.textContent).toContain('A.md');
  expect(tools.getState().settings.bookmarks).toEqual(['A.md']);
  await click('Quitar');
  expect(tools.getState().settings.bookmarks).toEqual([]);
});
