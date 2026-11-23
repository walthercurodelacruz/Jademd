// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { useVaultStore as store } from '../store/useVaultStore';
import { initialWorkspace } from '../utils/workspace';
import { CanvasView } from '../components/CanvasView';
import { ExcalidrawView } from '../components/ExcalidrawView';
import { LiveView } from '../components/LiveView';
import { ExportPanel, useExportPanel } from '../components/ExportPanel';
import { settleRendering } from '../utils/advancedRendering';
import { api } from '../api/client';

vi.mock('../api/client', () => ({ api: { readNote: vi.fn(), getBacklinks: vi.fn(async () => []), saveNote: vi.fn(async () => ({})) } }));
const drawing = vi.hoisted(() => ({ api: { addFiles: vi.fn(), updateScene: vi.fn() } }));
vi.mock('@excalidraw/excalidraw', async () => {
  const React = await import('react');
  return { Excalidraw: (props: any) => React.createElement('div', { 'data-testid': 'drawing' }, React.createElement('button', { onClick: () => props.excalidrawAPI(drawing.api) }, 'Register API'), React.createElement('button', { onClick: () => props.onChange([{ id: 'a', x: 0, version: 1 }], { viewBackgroundColor: '#18181b' }, {}) }, 'Normalize scene'), React.createElement('button', { onClick: () => props.onChange([{ id: 'a', x: 100, version: 1 }], { viewBackgroundColor: '#18181b' }, {}) }, 'Move once'), React.createElement('button', { onClick: () => props.onChange([{ id: 'a', x: 200, version: 1 }], { viewBackgroundColor: '#18181b' }, {}) }, 'Move again')), exportToBlob: vi.fn(async () => { throw new Error('export failure'); }), exportToSvg: vi.fn() };
});
let container: HTMLDivElement; let root: Root;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; drawing.api.updateScene.mockClear(); drawing.api.addFiles.mockClear();
  store.setState({ ...initialWorkspace(), vault: { id: 'editing', name: 'Test', path: '/test', storage_type: 'local', last_opened: 0 }, documents: {}, drafts: {}, conflicts: {}, isLoading: false, isSaving: false, noteModes: {}, saveError: null });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => { await store.getState().flushPendingSaves(); root.unmount(); }); container.remove(); vi.restoreAllMocks(); });
async function open(path: string, content: string) { vi.mocked(api.readNote).mockResolvedValue(content); await store.getState().openNote(path); }
async function click(label: string) { const button = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === label)!; expect(button).toBeDefined(); await act(async () => button.click()); }

it('adds and removes Canvas cards and connections while preserving unknown document fields', async () => {
  const data = { future: { keep: 7 }, nodes: [{ id: 'a', type: 'text', x: 0, y: 0, width: 200, height: 100, text: 'Existing', extra: 17 }], edges: [] };
  await open('Map.canvas', JSON.stringify(data)); await act(async () => root.render(<CanvasView />));
  await click('Grupo');
  expect(container.querySelector('[aria-label="Propiedades de tarjeta"]')).not.toBeNull();
  let saved = JSON.parse(store.getState().drafts['Map.canvas']);
  expect(saved.future).toEqual({ keep: 7 }); expect(saved.nodes[0].extra).toBe(17); expect(saved.nodes).toHaveLength(2);
  await click('Crear conexión');
  saved = JSON.parse(store.getState().drafts['Map.canvas']); expect(saved.edges).toHaveLength(1);
  vi.spyOn(window, 'confirm').mockReturnValue(true); await click('Eliminar');
  saved = JSON.parse(store.getState().drafts['Map.canvas']); expect(saved.edges).toEqual([]); expect(saved.nodes).toEqual(data.nodes);
});
it('shows invalid Excalidraw source as an error instead of an endless loader', async () => {
  await open('Invalid.excalidraw', 'not json'); await act(async () => root.render(<ExcalidrawView />));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('No se puede editar');
  expect(container.textContent).not.toContain('Cargando lienzo');
  expect(store.getState().drafts).toEqual({});
});
it('reports drawing export failures visibly', async () => {
  await open('Drawing.excalidraw', '{"elements":[]}'); await act(async () => root.render(<ExcalidrawView />));
  const png = container.querySelector<HTMLButtonElement>('[title*="PNG"]')!;
  expect(png).not.toBeNull(); await act(async () => png.click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('export failure');
});
it('does not save Excalidraw initialization, but preserves consecutive edits during one interaction', async () => {
  await open('Drawing.excalidraw', '{"elements":[{"id":"a","x":0,"version":1,"custom":17}]}');
  await act(async () => root.render(<ExcalidrawView />));
  await click('Register API'); await click('Normalize scene');
  expect(store.getState().drafts).toEqual({});
  const first = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Move once')!;
  await act(async () => { first.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); first.click(); });
  await click('Move again');
  const saved = JSON.parse(store.getState().drafts['Drawing.excalidraw']);
  expect(saved.elements[0]).toMatchObject({ id: 'a', x: 200, custom: 17 });
});
it('applies the newest shared drawing when its API becomes ready', async () => {
  await open('Drawing.excalidraw', '{"elements":[{"id":"a","x":0}]}');
  await act(async () => root.render(<ExcalidrawView />));
  await act(async () => store.getState().queueNoteSave('{"elements":[{"id":"a","x":99}]}', 'Drawing.excalidraw', 5000));
  await click('Register API');
  expect(drawing.api.updateScene).toHaveBeenLastCalledWith(expect.objectContaining({ elements: [{ id: 'a', x: 99 }] }));
});
it('navigates from a footnote reference to its definition and back in reading mode', async () => {
  const raw = 'Text[^long].\n\n[^long]: Definition.\n'; await open('A.md', raw);
  const scroll = vi.fn(); HTMLElement.prototype.scrollIntoView = scroll;
  await act(async () => root.render(<LiveView content={raw} path="A.md" readOnly />));
  const reference = container.querySelector<HTMLButtonElement>('[data-footnote-target]')!;
  await act(async () => reference.click());
  expect(document.activeElement).toBe(container.querySelector('[data-footnote-definition]'));
  await act(async () => container.querySelector<HTMLButtonElement>('[data-footnote-return]')!.click());
  expect(document.activeElement).toBe(container.querySelector('[data-footnote-reference]'));
  expect(scroll).toHaveBeenCalledTimes(2); expect(store.getState().drafts).toEqual({});
});
it('renders formulas in editable mode without creating an automatic draft', async () => {
  const raw = 'Formula $x^2$.\n\n$$y^2$$\n'; await open('Math.md', raw);
  await act(async () => { root.render(<LiveView content={raw} path="Math.md" />); });
  await act(async () => { await settleRendering(container); });
  expect(container.querySelectorAll('.katex')).toHaveLength(2);
  expect(store.getState().drafts).toEqual({});
});
it('opens the print document before registering its load handler and waits for that load to print', async () => {
  await open('Print.md', '# Print'); useExportPanel.getState().show();
  const events: string[] = []; let loaded = () => {};
  const print = vi.fn();
  const preview = { document: { open: () => events.push('open'), write: (html: string) => { expect(html).toContain('<!doctype html>'); events.push('write'); }, close: () => { events.push('close'); loaded(); } }, addEventListener: (_event: string, handler: () => void) => { events.push('listener'); loaded = handler; }, print, focus: vi.fn(), close: vi.fn() };
  vi.spyOn(window, 'open').mockReturnValue(preview as unknown as Window);
  await act(async () => root.render(<ExportPanel />)); await click('Imprimir / PDF');
  expect(events).toEqual(['open', 'listener', 'write', 'close']); expect(print).toHaveBeenCalledOnce();
  useExportPanel.getState().close();
});
it('downloads a binary original through the asset endpoint instead of an empty text snapshot', async () => {
  await open('Picture.png', ''); useExportPanel.getState().show();
  const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { expect(this.getAttribute('href')).toBe('/api/asset?path=Picture.png'); expect(this.download).toBe('Picture.png'); });
  await act(async () => root.render(<ExportPanel />)); await click('Descargar original');
  expect(download).toHaveBeenCalledOnce(); useExportPanel.getState().close();
});
it('renders YouTube thumbnail previews on Canvas link cards and switches to embedded player on play (JMD-BUG-004)', async () => {
  const data = {
    nodes: [{ id: 'yt1', type: 'link', x: 0, y: 0, width: 320, height: 220, url: 'https://www.youtube.com/watch?v=WUN7p3D8FyY' }],
    edges: [],
  };
  await open('Calculadoras.canvas', JSON.stringify(data));
  await act(async () => root.render(<CanvasView />));
  const thumb = container.querySelector<HTMLImageElement>('img[src*="i.ytimg.com/vi/WUN7p3D8FyY/hqdefault.jpg"]');
  expect(thumb).not.toBeNull();
  const playBtn = container.querySelector<HTMLButtonElement>('[aria-label="Reproducir video de YouTube"]')!;
  expect(playBtn).not.toBeNull();
  await act(async () => playBtn.click());
  const iframe = container.querySelector<HTMLIFrameElement>('iframe[src*="youtube-nocookie.com/embed/WUN7p3D8FyY"]');
  expect(iframe).not.toBeNull();
});
it('renders embedded PDF iframes for both external PDF links and local PDF files on Canvas (JMD-BUG-005)', async () => {
  const data = {
    nodes: [
      { id: 'pdf-link', type: 'link', x: 0, y: 0, width: 320, height: 320, url: 'https://dpetersanderson.github.io/fp288-vollmar.pdf' },
      { id: 'pdf-file', type: 'file', x: 360, y: 0, width: 320, height: 320, file: 'Recursos Generales/Pdfs/sare_vn.pdf' },
    ],
    edges: [],
  };
  await open('Referencia Articulos.canvas', JSON.stringify(data));
  await act(async () => root.render(<CanvasView />));
  const linkFrame = container.querySelector<HTMLIFrameElement>('iframe[src="https://dpetersanderson.github.io/fp288-vollmar.pdf"]');
  const fileFrame = container.querySelector<HTMLIFrameElement>('iframe[src*="/api/asset?path=Recursos%20Generales%2FPdfs%2Fsare_vn.pdf"]');
  expect(linkFrame).not.toBeNull();
  expect(fileFrame).not.toBeNull();
});
