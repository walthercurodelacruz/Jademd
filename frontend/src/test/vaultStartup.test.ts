// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { rememberVault, savedVaults, lastVault, forgetVault } from '../utils/vaultRegistry';
const api = vi.hoisted(() => ({
  getVaultInfo: vi.fn(), openLocalVault: vi.fn(), getVaultTree: vi.fn(async () => null),
  getGraph: vi.fn(async () => ({ nodes: [], links: [] })),
}));
vi.mock('../api/client', () => ({ api }));
beforeEach(() => { localStorage.clear(); vi.resetModules(); vi.clearAllMocks(); });
const entry = (path: string) => ({ key: `local:${path}`, name: path, path, kind: 'local' as const });
const info = (path: string) => ({ id: path, name: path, path, storage_type: 'local', last_opened: 0 });
it('starts empty without a missing-vault error', async () => {
  api.getVaultInfo.mockRejectedValue(Object.assign(new Error('No vault'), { status: 404 }));
  const { useVaultStore: store } = await import('../store/useVaultStore');
  await store.getState().initializeVault();
  expect(store.getState().vault).toBeNull();
  expect(store.getState().noteError).toBeNull();
});
it('automatically opens the only local vault', async () => {
  rememberVault(entry('/one'));
  api.openLocalVault.mockResolvedValue(info('/one'));
  const { useVaultStore: store } = await import('../store/useVaultStore');
  await store.getState().initializeVault();
  expect(api.openLocalVault).toHaveBeenCalledWith('/one', '/one');
  expect(store.getState().vault?.path).toBe('/one');
});
it('waits for selection with multiple vaults and remembers the last', async () => {
  rememberVault(entry('/one')); rememberVault(entry('/two'));
  const { useVaultStore: store } = await import('../store/useVaultStore');
  await store.getState().initializeVault();
  expect(api.openLocalVault).not.toHaveBeenCalled();
  expect(api.getVaultInfo).not.toHaveBeenCalled();
  expect(store.getState().vault).toBeNull();
  expect(lastVault()).toBe('local:/two');
});
it('keeps an unavailable vault in the list and reports its error', async () => {
  rememberVault(entry('/missing'));
  api.openLocalVault.mockRejectedValue(new Error('Unidad desconectada'));
  const { useVaultStore: store } = await import('../store/useVaultStore');
  await store.getState().initializeVault();
  expect(store.getState().vault).toBeNull();
  expect(store.getState().noteError).toBe('Unidad desconectada');
  expect(savedVaults()).toHaveLength(1);
});
it('deduplicates and removes only registry entries', () => {
  rememberVault(entry('/one')); rememberVault(entry('/one'));
  expect(savedVaults()).toHaveLength(1);
  forgetVault('local:/one');
  expect(savedVaults()).toEqual([]); expect(lastVault()).toBeNull();
});
