import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { initialWorkspace } from '../utils/workspace';
import { api } from '../api/client';
import { useVaultStore as store } from '../store/useVaultStore';
import { NoteMetadata, VaultInfo } from '../types';

vi.mock('../api/client', () => ({ api: {
  readNote: vi.fn(), getBacklinks: vi.fn(), saveNote: vi.fn(), search: vi.fn(),
  openLocalVault: vi.fn(), getVaultInfo: vi.fn(), getVaultTree: vi.fn(), getGraph: vi.fn(), resolveEntry: vi.fn(),
  moveEntry: vi.fn(), refreshVault: vi.fn(), createNote: vi.fn(), trashEntry: vi.fn(), listTrash: vi.fn(), restoreEntry: vi.fn(),
} }));
const vault: VaultInfo = { id: 'test', name: 'Test', path: '/test', storage_type: 'local', last_opened: 0 };
const meta = (path: string): NoteMetadata => ({ path, title: path, tags: [], outlinks: [], backlinks: [], headings: [], word_count: 1, character_count: 1 });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  store.setState({ ...initialWorkspace(), documents: {}, conflicts: {}, externalError: null, vault, isLoading: false, isSaving: false, drafts: {}, saveError: null, recoveryError: null,
    activePath: null, activeContent: '', noteLoadState: 'idle', openTabs: [], knownExcalidrawNotes: {}, noteModes: {} });
  vi.mocked(api.readNote).mockImplementation(async (path) => `Contenido ${path}`);
  vi.mocked(api.getBacklinks).mockResolvedValue([]);
  vi.mocked(api.saveNote).mockImplementation(async (path) => meta(path));
});
afterEach(async () => { await store.getState().flushPendingSaves(); vi.useRealTimers(); });

describe('Document loading and durable save lifecycle', () => {
  it('checks visible remote documents without rebuilding the index until requested', async () => {
    store.setState({ vault: { ...vault, storage_type: 'webdav' } });
    await store.getState().openNote('Background.md');
    await store.getState().openNote('Folder/Remote.md');
    vi.mocked(api.readNote).mockClear();
    vi.mocked(api.refreshVault).mockResolvedValue('remote-revision');
    vi.mocked(api.readNote).mockResolvedValue('remote update');
    await store.getState().refreshExternalChanges();
    expect(api.refreshVault).not.toHaveBeenCalled();
    expect(vi.mocked(api.readNote).mock.calls).toEqual([['Folder/Remote.md']]);
    expect(store.getState().activeContent).toBe('remote update');
    await store.getState().refreshExternalChanges(true);
    expect(api.refreshVault).toHaveBeenCalledOnce();
    expect(api.readNote).toHaveBeenCalledWith('Background.md');
  });

  it('refreshes clean documents but retains dirty drafts when external edits arrive', async () => {
    await store.getState().openNote('A.md');
    vi.mocked(api.refreshVault).mockResolvedValue('revision1');
    vi.mocked(api.readNote).mockResolvedValue('external');
    await store.getState().refreshExternalChanges();
    expect(store.getState().activeContent).toBe('external');
    store.getState().queueNoteSave('local', 'A.md');
    vi.mocked(api.readNote).mockResolvedValue('external2');
    await store.getState().refreshExternalChanges();
    expect(store.getState().activeContent).toBe('local');
    expect(store.getState().conflicts['A.md']).toEqual({ base: 'external', remote: 'external2' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.saveNote).not.toHaveBeenCalled();
    await store.getState().resolveConflict('A.md', 'merge', 'combined');
    expect(api.saveNote).toHaveBeenCalledWith('A.md', 'combined', 'external2');
    expect(store.getState().drafts).toEqual({});
  });
  it('retains both versions after a rejected save and refuses a stale conflict resolution', async () => {
    await store.getState().openNote('A.md');
    vi.mocked(api.saveNote).mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409 }));
    vi.mocked(api.readNote).mockResolvedValue('external');
    await expect(store.getState().saveCurrentNote('local')).rejects.toThrow('conflict');
    expect(store.getState().drafts['A.md']).toBe('local');
    expect(store.getState().conflicts['A.md'].remote).toBe('external');
    vi.mocked(api.saveNote).mockRejectedValueOnce(Object.assign(new Error('changed again'), { status: 409 }));
    vi.mocked(api.readNote).mockResolvedValue('new external');
    await expect(store.getState().resolveConflict('A.md', 'merge', 'combined')).rejects.toThrow();
    expect(store.getState().conflicts['A.md'].remote).toBe('new external');
    expect(store.getState().drafts['A.md']).toBe('combined');
    await store.getState().resolveConflict('A.md', 'remote');
    expect(store.getState().activeContent).toBe('new external');
    expect(store.getState().drafts).toEqual({});
  });
  it('does not recreate externally deleted files until an explicit resolution', async () => {
    await store.getState().openNote('A.md');
    vi.mocked(api.refreshVault).mockResolvedValue('deleted');
    vi.mocked(api.readNote).mockRejectedValue(Object.assign(new Error('deleted'), { status: 404 }));
    await store.getState().refreshExternalChanges();
    expect(store.getState().conflicts['A.md'].remote).toBeNull();
    expect(api.saveNote).not.toHaveBeenCalled();
    await store.getState().resolveConflict('A.md', 'merge', 'recreated deliberately');
    expect(api.saveNote).toHaveBeenCalledWith('A.md', 'recreated deliberately', null);
  });
  it('ignores an external read that started before a newer successful save', async () => {
    await store.getState().openNote('A.md');
    vi.mocked(api.refreshVault).mockResolvedValue('late-read');
    const remote = deferred<string>();
    vi.mocked(api.readNote).mockReturnValue(remote.promise);
    const checking = store.getState().refreshExternalChanges();
    await vi.waitFor(() => expect(api.readNote).toHaveBeenCalledTimes(2));
    await store.getState().saveCurrentNote('new saved content');
    remote.resolve('old disk snapshot'); await checking;
    expect(store.getState().activeContent).toBe('new saved content');
    expect(store.getState().conflicts).toEqual({});
  });
  it('creates a separate conflict copy without overwriting the external original', async () => {
    await store.getState().openNote('A.md');
    store.getState().queueNoteSave('local copy', 'A.md');
    store.setState({ conflicts: { 'A.md': { base: 'Contenido A.md', remote: 'external' } } });
    await store.getState().resolveConflict('A.md', 'copy', undefined, 'Copy.md');
    expect(api.createNote).toHaveBeenCalledWith('Copy.md', 'local copy');
    expect(api.saveNote).not.toHaveBeenCalled();
    expect(store.getState().activeContent).toBe('external');
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.saveNote).not.toHaveBeenCalled();
  });
  it('keeps independent pane selections and saves background documents to their own paths', async () => {
    await store.getState().openNote('A.md');
    store.getState().splitPane('horizontal');
    const second = store.getState().activePaneId;
    await store.getState().openNote('B.md');
    expect(store.getState().panes[0].activePath).toBe('A.md');
    expect(store.getState().panes[1].activePath).toBe('B.md');
    store.getState().queueNoteSave('background A', 'A.md');
    expect(store.getState().activeContent).toBe('Contenido B.md');
    expect(store.getState().documents['A.md'].content).toBe('background A');
    await store.getState().flushPendingSaves();
    expect(api.saveNote).toHaveBeenCalledWith('A.md', 'background A', 'Contenido A.md');
    store.getState().focusPane('main');
    expect(store.getState().activeContent).toBe('background A');
    store.getState().focusPane(second);
    expect(store.getState().activeContent).toBe('Contenido B.md');
  });
  it('uses per-pane history and discards the forward branch after opening a different note', async () => {
    await store.getState().openNote('A.md'); await store.getState().openNote('B.md');
    await store.getState().navigateHistory(-1);
    expect(store.getState().activePath).toBe('A.md');
    await store.getState().openNote('C.md');
    expect(store.getState().panes[0].history.map((entry) => entry.path)).toEqual(['A.md', 'C.md']);
    await store.getState().navigateHistory(1);
    expect(store.getState().activePath).toBe('C.md');
  });
  it('retains section history and resolves links concurrently in independent panes', async () => {
    await store.getState().openNote('A.md');
    vi.mocked(api.resolveEntry).mockResolvedValue('A.md');
    await store.getState().navigateToLink('A#first');
    await store.getState().navigateToLink('A#second');
    await store.getState().navigateHistory(-1);
    expect(store.getState().navigationAnchor).toBe('first');
    store.getState().splitPane('horizontal');
    const second = store.getState().activePaneId;
    const left = deferred<string>(); const right = deferred<string>();
    vi.mocked(api.resolveEntry).mockReturnValueOnce(left.promise).mockReturnValueOnce(right.promise);
    const openingLeft = store.getState().navigateToLink('Left#one', undefined, 'main');
    const openingRight = store.getState().navigateToLink('Right#two', undefined, second);
    right.resolve('Right.md'); await openingRight;
    left.resolve('Left.md'); await openingLeft;
    expect(store.getState().panes[0].activePath).toBe('Left.md');
    expect(store.getState().panes[1].activePath).toBe('Right.md');
    store.getState().focusPane('main');
    expect(store.getState().navigationAnchor).toBe('one');
    store.getState().focusPane(second);
    expect(store.getState().navigationAnchor).toBe('two');
  });
  it('supports pinning, reordering and safe panel closure with pending drafts', async () => {
    await store.getState().openNote('A.md'); await store.getState().openNote('B.md');
    store.getState().togglePinTab('A.md'); store.getState().closeTab('A.md');
    expect(store.getState().openTabs).toEqual(['A.md', 'B.md']);
    store.getState().reorderTab('B.md', 'A.md');
    expect(store.getState().openTabs).toEqual(['B.md', 'A.md']);
    store.getState().splitPane('vertical');
    const second = store.getState().activePaneId;
    await store.getState().openNote('C.md');
    store.getState().queueNoteSave('last panel edit', 'C.md');
    store.getState().closePane(second);
    expect(store.getState().panes).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(400);
    expect(api.saveNote).toHaveBeenCalledWith('C.md', 'last panel edit', 'Contenido C.md');
  });
  it('flushes before moving and remaps tabs, pins and navigation paths', async () => {
    await store.getState().openNote('Folder/A.md');
    store.getState().togglePinTab('Folder/A.md');
    store.getState().queueNoteSave('pending', 'Folder/A.md');
    vi.mocked(api.moveEntry).mockResolvedValue({ from: 'Folder', to: 'Renamed', updated_files: [] });
    await store.getState().moveItem('Folder', 'Renamed');
    expect(vi.mocked(api.saveNote).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(api.moveEntry).mock.invocationCallOrder[0]);
    expect(store.getState().activePath).toBe('Renamed/A.md');
    expect(store.getState().panes[0].pinned).toEqual(['Renamed/A.md']);
    expect(store.getState().panes[0].history[0].path).toBe('Renamed/A.md');
    expect(api.readNote).toHaveBeenCalledWith('Renamed/A.md');
  });
  it('does not expose an editable document or save during a delayed Canvas read', async () => {
    const read = deferred<string>();
    vi.mocked(api.readNote).mockReturnValue(read.promise);
    const opening = store.getState().openNote('Mapa.canvas');
    expect(store.getState().noteLoadState).toBe('loading');
    store.getState().queueNoteSave('accidental template', 'Mapa.canvas');
    expect(api.saveNote).not.toHaveBeenCalled();
    expect(store.getState().drafts).toEqual({});
    read.resolve('{"nodes":[],"edges":[],"custom":42}'); await opening;
    expect(store.getState().noteLoadState).toBe('ready');
    expect(api.saveNote).not.toHaveBeenCalled();
  });
  it('ignores stale content after the backlinks await', async () => {
    const backlinks = deferred<string[]>();
    vi.mocked(api.getBacklinks).mockImplementation((path) => path === 'A.md' ? backlinks.promise : Promise.resolve([]));
    const openingA = store.getState().openNote('A.md');
    await vi.waitFor(() => expect(api.getBacklinks).toHaveBeenCalledWith('A.md'));
    await store.getState().openNote('B.md');
    backlinks.resolve(['old.md']); await openingA;
    expect(store.getState().activePath).toBe('B.md');
    expect(store.getState().activeContent).toBe('Contenido B.md');
    expect(store.getState().backlinks).toEqual([]);
  });
  it('rejects stale reads even when reopening the same path', async () => {
    const first = deferred<string>();
    vi.mocked(api.readNote).mockReturnValueOnce(first.promise).mockResolvedValueOnce('nuevo');
    const stale = store.getState().openNote('A.md');
    const fresh = store.getState().openNote('A.md');
    await fresh; first.resolve('viejo'); await stale;
    expect(store.getState().activeContent).toBe('nuevo');
  });
  it('saves an empty document', async () => {
    await store.getState().openNote('A.md');
    await store.getState().saveCurrentNote('', 'A.md');
    expect(api.saveNote).toHaveBeenCalledWith('A.md', '', 'Contenido A.md');
    expect(store.getState().drafts).toEqual({});
  });
  it('keeps an autosave alive after closing its tab', async () => {
    await store.getState().openNote('A.md');
    store.getState().queueNoteSave('último cambio', 'A.md', 600);
    store.getState().closeTab('A.md');
    await vi.advanceTimersByTimeAsync(600);
    expect(api.saveNote).toHaveBeenCalledWith('A.md', 'último cambio', 'Contenido A.md');
    expect(store.getState().drafts).toEqual({});
  });
  it('does not reload or clear the active editor when closing another tab', async () => {
    await store.getState().openNote('A.md'); await store.getState().openNote('B.md');
    store.getState().queueNoteSave('borrador B', 'B.md');
    store.getState().closeTab('A.md');
    expect(store.getState().activeContent).toBe('borrador B');
    expect(api.readNote).toHaveBeenCalledTimes(2);
  });
  it('propagates failures and retains the exact draft for retry', async () => {
    await store.getState().openNote('A.md');
    vi.mocked(api.saveNote).mockRejectedValueOnce(new Error('disco lleno'));
    await expect(store.getState().saveCurrentNote('sin perder', 'A.md')).rejects.toThrow('disco lleno');
    expect(store.getState().saveError).toContain('disco lleno');
    expect(store.getState().drafts['A.md']).toBe('sin perder');
    await store.getState().flushPendingSaves();
    expect(store.getState().drafts).toEqual({});
  });
  it('serializes writes and never removes a newer pending draft', async () => {
    await store.getState().openNote('A.md');
    const first = deferred<NoteMetadata>();
    vi.mocked(api.saveNote).mockReturnValueOnce(first.promise);
    const oldWrite = store.getState().saveCurrentNote('primero', 'A.md');
    const newWrite = store.getState().saveCurrentNote('segundo', 'A.md');
    await vi.waitFor(() => expect(api.saveNote).toHaveBeenCalledTimes(1));
    expect(store.getState().drafts['A.md']).toBe('segundo');
    first.resolve(meta('A.md')); await oldWrite; await newWrite;
    expect(vi.mocked(api.saveNote).mock.calls.map((call) => call[1])).toEqual(['primero', 'segundo']);
    expect(store.getState().drafts).toEqual({});
  });
  it('does not switch vaults if an existing draft cannot be saved', async () => {
    await store.getState().openNote('A.md');
    store.getState().queueNoteSave('local', 'A.md');
    vi.mocked(api.saveNote).mockRejectedValueOnce(new Error('sin conexión'));
    await expect(store.getState().openLocalVault('/other')).rejects.toThrow('sin conexión');
    expect(api.openLocalVault).not.toHaveBeenCalled();
    expect(store.getState().vault?.id).toBe('test');
  });
  it('opens failed drafts without re-reading an older disk version', async () => {
    store.setState({ drafts: { 'A.md': 'recuperado' } });
    await store.getState().openNote('A.md');
    expect(store.getState().activeContent).toBe('recuperado');
    expect(api.readNote).not.toHaveBeenCalled();
    await expect(store.getState().flushPendingSaves()).rejects.toThrow();
    expect(store.getState().conflicts['A.md']).toBeDefined();
    await store.getState().resolveConflict('A.md', 'remote');
  });
  it('reports read failure instead of opening a blank editable document', async () => {
    vi.mocked(api.readNote).mockRejectedValue(new Error('lectura fallida'));
    await store.getState().openNote('A.md');
    expect(store.getState().noteLoadState).toBe('error');
    expect(store.getState().noteError).toBe('lectura fallida');
  });
  it('remembers the editing mode for each note independently', async () => {
    await store.getState().openNote('A.md'); store.getState().setNoteMode('source');
    await store.getState().openNote('B.md'); expect(store.getState().noteMode).toBe('live');
    store.getState().setNoteMode('reading');
    await store.getState().openNote('A.md'); expect(store.getState().noteMode).toBe('source');
  });
  it('navigates resolved paths and retains heading/block targets', async () => {
    await store.getState().openNote('A.md');
    vi.mocked(api.resolveEntry).mockResolvedValue('Folder/B.md');
    await store.getState().navigateToLink('Guide#^block', 'A.md');
    expect(api.resolveEntry).toHaveBeenCalledWith('Guide#^block', 'A.md');
    expect(store.getState().activePath).toBe('Folder/B.md');
    expect(store.getState().navigationAnchor).toBe('^block');
  });
  it('does not navigate a stale link after the user selected another document', async () => {
    await store.getState().openNote('A.md');
    const resolution = deferred<string>();
    vi.mocked(api.resolveEntry).mockReturnValue(resolution.promise);
    const navigation = store.getState().navigateToLink('Old', 'A.md');
    await store.getState().openNote('B.md'); resolution.resolve('Old.md'); await navigation;
    expect(store.getState().activePath).toBe('B.md');
  });
  it('resolves a link inside an embed relative to the embedded note, while keeping the active pane as owner', async () => {
    await store.getState().openNote('Main.md');
    vi.mocked(api.resolveEntry).mockResolvedValue('Embedded/Target.md');
    await store.getState().navigateToLink('Target', 'Embedded/Origin.md');
    expect(api.resolveEntry).toHaveBeenCalledWith('Target', 'Embedded/Origin.md');
    expect(store.getState().activePath).toBe('Embedded/Target.md');
  });
  it('ignores results from an older search', async () => {
    const first = deferred<[]>();
    vi.mocked(api.search).mockReturnValueOnce(first.promise).mockResolvedValueOnce([{ path: 'B.md', title: 'B', matches: [] }]);
    const old = store.getState().performSearch('A');
    await store.getState().performSearch('B'); first.resolve([]); await old;
    expect(store.getState().searchResults[0]?.path).toBe('B.md');
  });
});
