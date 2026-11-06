export interface SavedVault {
  key: string;
  name: string;
  kind: 'local' | 'webdav';
  path: string;
  username?: string;
  root?: string;
}
const KEY = 'jademd.vaults.v1';
const LAST = 'jademd.lastVault.v1';
export function savedVaults(): SavedVault[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(value) ? value.filter((v): v is SavedVault => v && typeof v.key === 'string' && typeof v.name === 'string' && typeof v.path === 'string' && ['local', 'webdav'].includes(v.kind)) : [];
  } catch { return []; }
}
export function lastVault(): string | null { return localStorage.getItem(LAST); }
export function rememberVault(vault: SavedVault) {
  const entries = savedVaults().filter((v) => v.key !== vault.key);
  localStorage.setItem(KEY, JSON.stringify([...entries, vault]));
  localStorage.setItem(LAST, vault.key);
}
export function forgetVault(key: string) {
  localStorage.setItem(KEY, JSON.stringify(savedVaults().filter((v) => v.key !== key)));
  if (lastVault() === key) localStorage.removeItem(LAST);
}
