// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useProductivityStore as tools } from '../store/useProductivityStore';
import { useVaultStore as vault } from '../store/useVaultStore';
import { initialWorkspace } from '../utils/workspace';
import { bindings, shortcutFromEvent } from '../utils/commands';
import { expandTemplate, localDate } from '../utils/productivity';
import { openDailyNote, insertTemplate } from '../utils/productivityActions';
import { api } from '../api/client';

vi.mock('../api/client', () => ({ api: { readNote: vi.fn(), createNote: vi.fn(), saveNote: vi.fn(), getBacklinks: vi.fn(), getVaultTree: vi.fn(), getGraph: vi.fn() } }));
let files: Map<string, string>;
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); files = new Map();
  tools.setState({ vaultId: null }); tools.getState().activate('test');
  vault.setState({ ...initialWorkspace(), vault: { id: 'test', name: 'Test', path: '/test', storage_type: 'local', last_opened: 0 }, documents: {}, drafts: {}, conflicts: {}, isLoading: false, isSaving: false, noteModes: {}, saveError: null });
  vi.mocked(api.readNote).mockImplementation(async (path) => { if (!files.has(path)) throw Object.assign(new Error('missing'), { status: 404 }); return files.get(path)!; });
  vi.mocked(api.createNote).mockImplementation(async (path, content) => { if (files.has(path)) throw Object.assign(new Error('exists'), { status: 409 }); files.set(path, content || ''); return {} as any; });
  vi.mocked(api.saveNote).mockImplementation(async (path, content, expected) => { if ((files.get(path) ?? null) !== expected) throw Object.assign(new Error('conflict'), { status: 409 }); files.set(path, content); return {} as any; });
  vi.mocked(api.getBacklinks).mockResolvedValue([]);
});
afterEach(async () => { await vault.getState().flushPendingSaves(); vi.restoreAllMocks(); });

describe('Productivity preferences and commands', () => {
  it('persists bookmarks per vault and remaps documents and template folders', () => {
    tools.getState().toggleBookmark('Folder/A.md');
    tools.getState().update({ templateFolder: 'Folder', dailyTemplate: 'Folder/Template.md' });
    tools.getState().remap('Folder', 'Renamed');
    tools.getState().activate('other'); expect(tools.getState().settings.bookmarks).toEqual([]);
    tools.getState().activate('test');
    expect(tools.getState().settings.bookmarks).toEqual(['Renamed/A.md']);
    expect(tools.getState().settings.dailyTemplate).toBe('Renamed/Template.md');
    expect(() => tools.getState().update({ dailyFolder: '../outside' })).toThrow();
  });
  it('rejects shortcut collisions including search aliases, reserves editing keys and allows disabling', () => {
    expect(() => tools.getState().assignShortcut('daily', 'Mod+k')).toThrow('Buscar');
    expect(() => tools.getState().assignShortcut('daily', 'Mod+v')).toThrow();
    tools.getState().assignShortcut('search', null);
    tools.getState().assignShortcut('daily', 'Mod+k');
    tools.getState().activate('other'); tools.getState().activate('test');
    expect(bindings('daily', tools.getState().settings.shortcuts)).toEqual(['Mod+k']);
    expect(shortcutFromEvent({ key: 'D', metaKey: true, ctrlKey: false, shiftKey: true, altKey: false })).toBe('Mod+Shift+d');
  });
  it('does not claim to save preferences when storage fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(() => tools.getState().toggleBookmark('A.md')).toThrow('conservar');
    expect(tools.getState().settings.bookmarks).toEqual([]);
  });
  it('uses local calendar values and leaves unknown template variables unchanged', () => {
    const date = new Date(2026, 10, 5, 23, 45);
    expect(localDate(date)).toBe('2026-11-05');
    expect(expandTemplate('{{title}} {{date}} {{time}} {{unknown}}', 'Reunión', date)).toBe('Reunión 2026-11-05 23:45 {{unknown}}');
  });
});
describe('Daily notes and template insertion', () => {
  it('creates a daily note from the full template once and opens existing notes without overwriting', async () => {
    files.set('Plantillas/Diario.md', '---\r\nfecha: {{date}}\r\n---\r\n# {{title}}\r\n');
    tools.getState().update({ dailyTemplate: 'Plantillas/Diario.md' });
    await Promise.all([openDailyNote('2026-11-05'), openDailyNote('2026-11-05')]);
    expect(api.createNote).toHaveBeenCalledTimes(1);
    expect(files.get('Diario/2026-11-05.md')).toBe('---\r\nfecha: 2026-11-05\r\n---\r\n# 2026-11-05\r\n');
    files.set('Diario/2026-11-05.md', 'Existing content');
    await openDailyNote('2026-11-05');
    expect(api.createNote).toHaveBeenCalledTimes(1);
    expect(files.get('Diario/2026-11-05.md')).toBe('Existing content');
    expect(vault.getState().activePath).toBe('Diario/2026-11-05.md');
    expect(vault.getState().activeContent).toBe('Existing content');
  });
  it('rejects invalid dates and missing templates without creating an empty note', async () => {
    await expect(openDailyNote('2026-02-30')).rejects.toThrow('Fecha');
    tools.getState().update({ dailyTemplate: 'Missing.md' });
    await expect(openDailyNote('2026-11-05')).rejects.toThrow('missing');
    expect(api.createNote).not.toHaveBeenCalled(); expect(vault.getState().isLoading).toBe(false);
  });
  it('inserts only the template body into the latest draft, preserving the destination properties', async () => {
    const original = '---\r\ncustom: true # keep\r\n---\r\nOriginal.\r\n';
    files.set('A.md', original); await vault.getState().openNote('A.md');
    let resolve!: (value: string) => void;
    vi.mocked(api.readNote).mockReturnValueOnce(new Promise((yes) => { resolve = yes; }));
    const inserting = insertTemplate('Plantillas/Meeting.md');
    vault.getState().queueNoteSave(original.replace('Original.', 'Latest.'), 'A.md', 5000);
    resolve('---\nignored: true\n---\n# {{title}}\nTemplate body.\n'); await inserting;
    expect(vault.getState().drafts['A.md']).toBe(original.replace('Original.', 'Latest.') + '\r\n# A\r\nTemplate body.\r\n');
    await vault.getState().flushPendingSaves();
    expect(api.saveNote).toHaveBeenCalledWith('A.md', original.replace('Original.', 'Latest.') + '\r\n# A\r\nTemplate body.\r\n', original);
  });
  it('does not create a daily note if an existing draft cannot be saved', async () => {
    files.set('A.md', 'base'); await vault.getState().openNote('A.md');
    vault.getState().queueNoteSave('draft', 'A.md', 5000);
    vi.mocked(api.saveNote).mockRejectedValueOnce(new Error('disk full'));
    await expect(openDailyNote('2026-11-06')).rejects.toThrow();
    expect(api.createNote).not.toHaveBeenCalled();
    expect(vault.getState().drafts['A.md']).toBe('draft');
    expect(vault.getState().isLoading).toBe(false);
    await vault.getState().flushPendingSaves();
  });
  it('does not insert a loaded template into a different vault', async () => {
    files.set('A.md', 'base'); await vault.getState().openNote('A.md');
    let resolve!: (value: string) => void;
    vi.mocked(api.readNote).mockReturnValueOnce(new Promise((yes) => { resolve = yes; }));
    const pending = insertTemplate('Plantillas/T.md');
    vault.setState({ vault: { ...vault.getState().vault!, id: 'other' } });
    resolve('Template text');
    await expect(pending).rejects.toThrow('bóveda');
    expect(vault.getState().drafts).toEqual({});
  });
  it('does not insert templates into reading mode', async () => {
    files.set('A.md', 'Original'); await vault.getState().openNote('A.md'); vault.getState().setNoteMode('reading');
    await expect(insertTemplate('Plantillas/Meeting.md')).rejects.toThrow('edición');
    expect(vault.getState().drafts).toEqual({});
  });
});
