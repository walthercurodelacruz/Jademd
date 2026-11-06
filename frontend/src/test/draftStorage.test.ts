import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistDrafts, readDrafts } from '../utils/draftStorage';

beforeEach(() => {
  const items = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => items.set(key, value),
    removeItem: (key: string) => items.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());
describe('Vault-scoped draft recovery', () => {
  it('recovers exact source text, including empty notes and CRLF, isolated by vault', () => {
    const drafts = { 'Empty.md': '', 'Carpeta/Nota.md': '---\r\ntags:\r\n  - español\r\n---\r\n[[Nota]]' };
    persistDrafts('one', drafts); persistDrafts('two', { 'Empty.md': 'other vault' });
    expect(readDrafts('one')).toEqual(drafts);
    expect(readDrafts('two')).toEqual({ 'Empty.md': 'other vault' });
    persistDrafts('one', {});
    expect(readDrafts('one')).toEqual({});
    expect(readDrafts('two')['Empty.md']).toBe('other vault');
  });
  it('tolerates corrupt recovery data but propagates quota failures while writing', () => {
    localStorage.setItem('jademd:drafts:test', 'invalid JSON');
    expect(readDrafts('test')).toEqual({});
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('quota'); } });
    expect(() => persistDrafts('test', { 'A.md': 'keep in memory' })).toThrow('quota');
  });
});
