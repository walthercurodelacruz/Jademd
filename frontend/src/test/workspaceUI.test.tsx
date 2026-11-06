// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentWorkspace } from '../components/DocumentWorkspace';
import { IntegrityPanel } from '../components/IntegrityPanel';
import { UnifiedSidebar } from '../components/UnifiedSidebar';
import { FileTree } from '../components/FileTree';
import { api } from '../api/client';
import { CommandPalette } from '../components/CommandPalette';
import { useVaultStore as store } from '../store/useVaultStore';
import { initialWorkspace, readSavedWorkspaces } from '../utils/workspace';

vi.mock('../api/client', () => ({ api: {
  readNote: vi.fn(async (path: string) => `# ${path}\n\nContenido editable.\n`), getBacklinks: vi.fn(async () => []),
  saveNote: vi.fn(async (path: string) => ({ path, title: path, tags: [], headings: [], backlinks: [], outlinks: [], word_count: 1, character_count: 1 })),
  indexedNotes: vi.fn(async () => [{ path: "Proyecto.md", title: "Proyecto", frontmatter: { estado: "Activo" }, tags: [], outlinks: [], backlinks: [], headings: [], word_count: 0, character_count: 0 }]),
  resolveEntry: vi.fn(), refreshVault: vi.fn(async () => "fingerprint"), pendingOperations: vi.fn(async () => []),
} }));

let container: HTMLDivElement;
let root: Root;
const props = { sidebarOpen: true, onToggleSidebar: vi.fn(), onToggleBacklinks: vi.fn(), backlinksOpen: false, onCreateNote: vi.fn(), emptyState: <p>Selecciona una nota.</p> };
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  store.setState({ ...initialWorkspace(), vault: { id: 'ui', name: 'Test', path: '/test', storage_type: 'local', last_opened: 0 },
    documents: {}, conflicts: {}, externalError: null, drafts: {}, activePath: null, activeContent: '', openTabs: [], isLoading: false, isSaving: false,
    noteLoadState: 'idle', noteError: null, saveError: null, recoveryError: null, commandPaletteOpen: false });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { await store.getState().flushPendingSaves(); root.unmount(); });
  container.remove(); vi.restoreAllMocks();
});
async function render(integrity = false) {
  await act(async () => { root.render(<><DocumentWorkspace {...props} /><CommandPalette />{integrity && <IntegrityPanel />}</>); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
}
async function click(element: Element | null) {
  expect(element).not.toBeNull();
  await act(async () => { (element as HTMLElement).click(); });
}

describe('Daily workspace interaction', () => {
  it('removes the redundant editor strip and navigates document history from the main header', async () => {
    await store.getState().openNote('A.md'); await store.getState().openNote('B.md');
    await render();
    const browserBack = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    expect(container.querySelectorAll('button[title="Atrás"]')).toHaveLength(0);
    expect(container.querySelectorAll('button[aria-label="Nota anterior"]')).toHaveLength(1);
    expect(container.querySelectorAll('button[title="Pantalla completa"]')).toHaveLength(1);
    await click(container.querySelector('[aria-label="Nota anterior"]'));
    expect(store.getState().activePath).toBe('A.md');
    expect(browserBack).not.toHaveBeenCalled();
    expect(container.querySelectorAll('.tiptap')).toHaveLength(1);
  });
  it('shows different notes in independent panes and keeps the same document synchronized when shared', async () => {
    await store.getState().openNote('A.md'); store.getState().splitPane('horizontal');
    await store.getState().openNote('B.md');
    await render();
    const panes = container.querySelectorAll('[data-pane-id]');
    expect(panes).toHaveLength(2);
    expect([panes[0].querySelector('.tiptap')?.textContent, ...Array.from(panes[0].querySelector('.tiptap')?.querySelectorAll('textarea') || []).map((input) => input.value)].join(' ')).toContain('A.md');
    expect([panes[1].querySelector('.tiptap')?.textContent, ...Array.from(panes[1].querySelector('.tiptap')?.querySelectorAll('textarea') || []).map((input) => input.value)].join(' ')).toContain('B.md');
    await act(async () => { await store.getState().openNote('A.md'); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
    await act(async () => { store.getState().queueNoteSave('# A.md\n\nCambio compartido.\n', 'A.md', 5000); });
    for (const pane of Array.from(panes)) expect(pane.querySelector('.tiptap')?.textContent).toContain('Cambio compartido.');
  });
  it('compares conflicting versions and saves the reviewed proposal against the external base', async () => {
    await store.getState().openNote('A.md');
    store.getState().queueNoteSave('Local proposal', 'A.md', 5000);
    vi.mocked(api.readNote).mockResolvedValue('External version');
    store.setState({ conflicts: { 'A.md': { base: '# A.md\n\nContenido editable.\n', remote: 'External version' } } });
    await render(true);
    await click(Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Comparar versiones') || null);
    expect((container.querySelector('[aria-label="Versión externa"]') as HTMLTextAreaElement).value).toBe('External version');
    expect((container.querySelector('[aria-label="Propuesta de combinación"]') as HTMLTextAreaElement).value).toBe('Local proposal');
    await click(Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Guardar propuesta') || null);
    expect(api.saveNote).toHaveBeenCalledWith('A.md', 'Local proposal', 'External version');
    expect(container.querySelector('[role="dialog"][aria-label="Resolver conflicto"]')).toBeNull();
  });
  it('saves pending documents from all panes once through the shared save shortcut', async () => {
    await store.getState().openNote('A.md'); store.getState().splitPane('horizontal');
    await store.getState().openNote('B.md'); await render();
    vi.mocked(api.saveNote).mockClear();
    await act(async () => { store.getState().queueNoteSave('Updated A', 'A.md', 5000); store.getState().queueNoteSave('Updated B', 'B.md', 5000); });
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true })); });
    expect(api.saveNote).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.saveNote).mock.calls.map(([path, content]) => [path, content])).toEqual([['A.md', 'Updated A'], ['B.md', 'Updated B']]);
    expect(store.getState().drafts).toEqual({});
  });
  it('opens the command palette by keyboard and executes a split command', async () => {
    await store.getState().openNote('A.md'); await render();
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'P', ctrlKey: true, shiftKey: true, bubbles: true })); });
    expect(container.querySelector('[role="dialog"][aria-label="Paleta de comandos"]')).not.toBeNull();
    const split = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Dividir panel abajo');
    await click(split || null);
    expect(store.getState().panes).toHaveLength(2);
    expect(store.getState().splitTree).toMatchObject({ direction: 'vertical' });
    expect(store.getState().commandPaletteOpen).toBe(false);
  });
});

it('resizes nested splits independently and keeps the existing editor mounted', async () => {
  await store.getState().openNote('A.md');
  await render();
  const original = container.querySelector('[data-pane-id="main"] .tiptap');
  expect(original).not.toBeNull();
  await act(async () => {
    store.getState().splitPane('horizontal');
    store.getState().splitPane('vertical');
  });
  expect(container.querySelector('[data-pane-id="main"] .tiptap')).toBe(original);
  const divider = container.querySelector('[role="separator"][aria-orientation="horizontal"]')!;
  await act(async () => divider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
  expect(store.getState().splitTree).toMatchObject({ ratio: 0.5, second: { direction: 'vertical', ratio: 0.55 } });
  const outer = container.querySelector('[role="separator"][aria-orientation="vertical"]')!;
  vi.spyOn(outer.parentElement!, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 800));
  Object.defineProperty(outer, 'setPointerCapture', { value: vi.fn() });
  const pointer = (type: string, clientX: number) => {
    const event = new MouseEvent(type, { clientX, bubbles: true });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    outer.dispatchEvent(event);
  };
  await act(async () => { pointer('pointerdown', 500); pointer('pointermove', 650); });
  expect(outer.getAttribute('aria-valuenow')).toBe('65');
  expect(store.getState().splitTree).toMatchObject({ ratio: 0.5 });
  await act(async () => pointer('pointerup', 650));
  expect(store.getState().splitTree).toMatchObject({ ratio: 0.65 });
  await act(async () => store.getState().closePane(store.getState().activePaneId));
  expect(container.querySelectorAll('[role="separator"]')).toHaveLength(1);
  expect(container.querySelector('[data-pane-id="main"] .tiptap')).toBe(original);
});

it('saves a named space and restores its tabs and proportions after closing a pane', async () => {
  await store.getState().openNote('A.md');
  store.getState().splitPane('horizontal');
  await store.getState().openNote('B.md');
  const layout = store.getState().splitTree;
  if ('paneId' in layout) throw new Error('Expected a split');
  store.getState().resizePaneSplit(layout.id, 0.65);
  await render();

  await click(container.querySelector('button[aria-label="Espacios guardados"]'));
  const input = container.querySelector<HTMLInputElement>('[aria-label="Nombre del espacio"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Lectura');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const dialog = () => container.querySelector('[role="dialog"][aria-label="Espacios guardados"]');
  const button = (label: string) => Array.from(dialog()!.querySelectorAll('button')).find((item) => item.textContent === label)!;
  await click(button('Guardar actual'));
  expect(readSavedWorkspaces('ui')).toHaveLength(1);
  await click(button('Cerrar'));
  await act(async () => store.getState().closePane(store.getState().activePaneId));
  expect(store.getState().panes).toHaveLength(1);

  await click(container.querySelector('button[aria-label="Espacios guardados"]'));
  await click(button('Abrir'));
  expect(dialog()).toBeNull();
  expect(store.getState().splitTree).toMatchObject({ ratio: 0.65 });
  expect(store.getState().panes.map((pane) => pane.activePath)).toEqual(['A.md', 'B.md']);
  expect(store.getState().activePath).toBe('B.md');
});

it('opens an indexed base in the document workspace and navigates to a row', async () => {
  vi.mocked(api.readNote).mockResolvedValueOnce('views: [{type: table, order: [note.estado]}]');
  await store.getState().openNote('Proyectos.base');
  await render();
  const table = container.querySelector('table');
  expect(table?.textContent).toContain('Activo');
  await click(table?.querySelector('button[title="Proyecto.md"]') ?? null);
  expect(store.getState().activePath).toBe('Proyecto.md');
});

it.each([['left', 80], ['right', -80]] as const)(
  'widens the %s sidebar by dragging its inner edge',
  async (sidebarPosition, delta) => {
    const onResize = vi.fn();
    store.setState({ sidebarPosition, activeInspectorTab: 'tree' });
    await act(async () => {
      root.render(<UnifiedSidebar width={288} onResize={onResize} onClose={vi.fn()} onOpenVaultModal={vi.fn()} />);
    });
    const handle = container.querySelector<HTMLElement>('[aria-label="Redimensionar panel lateral"]')!;
    handle.setPointerCapture = vi.fn();
    vi.spyOn(handle.parentElement!, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 288, 500));
    await act(async () => {
      handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 300 }));
      handle.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 300 + delta }));
    });
    expect(onResize).toHaveBeenLastCalledWith(368);
  },
);

it('requires confirmation before moving a dragged file into a folder', async () => {
  const move = vi.spyOn(store.getState(), 'moveItem').mockResolvedValue();
  await act(async () => {
    root.render(<FileTree node={{ name: 'Vault', path: '', is_dir: true, children: [
      { name: 'A.md', path: 'A.md', is_dir: false },
      { name: 'Folder', path: 'Folder', is_dir: true, children: [] },
    ] }} />);
  });
  const drag = async () => {
    await act(async () => {
      const start = new Event('dragstart', { bubbles: true });
      Object.defineProperty(start, 'dataTransfer', { value: { setData: vi.fn() } });
      container.querySelector('[data-tree-path="A.md"]')!.dispatchEvent(start);
      container.querySelector('[data-tree-path="Folder"]')!.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    });
  };
  await drag();
  expect(move).not.toHaveBeenCalled();
  await click(Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Cancelar')!);
  expect(move).not.toHaveBeenCalled();
  await drag();
  await click(Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Mover')!);
  expect(move).toHaveBeenCalledWith('A.md', 'Folder/A.md');
});

it('restores expanded folders after remount and keeps vault preferences separate', async () => {
  const tree = { name: 'Vault', path: '', is_dir: true, children: [
    { name: 'Folder', path: 'Folder', is_dir: true, children: [
      { name: 'Child.md', path: 'Folder/Child.md', is_dir: false },
    ] },
  ] };
  const renderTree = async () => { await act(async () => { root.render(<FileTree node={tree} />); }); };
  await renderTree();
  expect(container.querySelector('[data-tree-path="Folder/Child.md"]')).toBeNull();
  await click(container.querySelector('[data-tree-path="Folder"]'));
  expect(container.querySelector('[data-tree-path="Folder/Child.md"]')).not.toBeNull();
  await act(async () => root.render(null));
  await renderTree();
  expect(container.querySelector('[data-tree-path="Folder/Child.md"]')).not.toBeNull();
  await click(container.querySelector('[data-tree-path="Folder"]'));
  await act(async () => root.render(null));
  await renderTree();
  expect(container.querySelector('[data-tree-path="Folder/Child.md"]')).toBeNull();
  await click(container.querySelector('[data-tree-path="Folder"]'));
  await act(async () => store.setState({ vault: { ...store.getState().vault!, id: 'other-vault' } }));
  expect(container.querySelector('[data-tree-path="Folder/Child.md"]')).toBeNull();
});
