// Persist the original Markdown/JSON, scoped to a vault. A failed save must remain recoverable.
const key = (vaultId: string) => `jademd:drafts:${vaultId}`;

export function readDrafts(vaultId: string): Record<string, string> {
  try {
    const value = JSON.parse(localStorage.getItem(key(vaultId)) || '{}');
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  } catch {
    return {};
  }
}

export function persistDrafts(vaultId: string, drafts: Record<string, string>): void {
  if (typeof localStorage === 'undefined') return;
  // Let quota/access errors reach the store, where the UI can report that recovery is unavailable.
  if (Object.keys(drafts).length) localStorage.setItem(key(vaultId), JSON.stringify(drafts));
  else localStorage.removeItem(key(vaultId));
}

export function readDraftBases(vaultId: string): Record<string, string | null> {
  try {
    const value = JSON.parse(localStorage.getItem(`jademd:draft-bases:${vaultId}`) || '{}');
    return Object.fromEntries(Object.entries(value).filter((entry) => entry[1] === null || typeof entry[1] === 'string')) as Record<string, string | null>;
  } catch { return {}; }
}
export function persistDraftBases(vaultId: string, bases: Record<string, string | null | undefined>): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(`jademd:draft-bases:${vaultId}`, JSON.stringify(bases));
}
