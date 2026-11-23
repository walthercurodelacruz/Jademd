import LZString from 'lz-string';

export interface SceneDocument {
  [key: string]: unknown;
  elements: any[];
  appState?: Record<string, any>;
  files?: Record<string, any>;
}
interface DrawingBlock { start: number; bodyStart: number; end: number; language: string; scene: SceneDocument }

function decodeScene(json: string): SceneDocument {
  const scene = JSON.parse(json);
  if (!scene || !Array.isArray(scene.elements) || scene.elements.some((element: unknown) => !element || typeof element !== 'object' || Array.isArray(element)) ||
    (scene.appState !== undefined && (!scene.appState || typeof scene.appState !== 'object' || Array.isArray(scene.appState))) ||
    (scene.files !== undefined && (!scene.files || typeof scene.files !== 'object' || Array.isArray(scene.files)))) {
    throw new Error('La escena Excalidraw no contiene datos válidos.');
  }
  return scene;
}

function drawingBlock(content: string): DrawingBlock {
  const heading = /^## Drawing[ \t]*\r?$/m.exec(content);
  const blocks: DrawingBlock[] = [];
  const opening = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)\r?\n/gm;
  let match: RegExpExecArray | null;
  while ((match = opening.exec(content))) {
    const marker = match[1][0];
    const close = new RegExp(`^ {0,3}${marker === '`' ? '`' : '~'}{${match[1].length},}[ \\t]*(?=\\r?$)`, 'gm');
    close.lastIndex = opening.lastIndex;
    const end = close.exec(content);
    if (!end) break;
    const bodyStart = opening.lastIndex;
    opening.lastIndex = end.index + end[0].length;
    const language = match[2].trim();
    if (!['compressed-json', 'json:excalidraw', 'json'].includes(language) || (heading && match.index < heading.index)) continue;
    const body = content.slice(bodyStart, end.index);
    try {
      const json = language === 'compressed-json' ? LZString.decompressFromBase64(body.replace(/\s/g, '')) || '' : body;
      blocks.push({ start: match.index, bodyStart, end: opening.lastIndex, language, scene: decodeScene(json) });
    } catch { /* Invalid samples are not editable scenes. */ }
  }
  if (blocks.length !== 1) throw new Error(blocks.length ? 'El documento contiene varios dibujos; elige el bloque en código fuente.' : 'No se encontró un bloque de dibujo válido.');
  return blocks[0];
}

export function parseScene(content: string, markdown: boolean): SceneDocument {
  return markdown ? drawingBlock(content).scene : decodeScene(content);
}

export function serializeScene(content: string, markdown: boolean, elements: readonly any[], appState: Record<string, any>, files: Record<string, any>): string {
  const original = parseScene(content, markdown);
  const originals = new Map(original.elements.map((element) => [element.id, element]));
  const nextState = { ...original.appState };
  for (const key of ['viewBackgroundColor', 'currentItemStrokeColor', 'currentItemBackgroundColor', 'gridSize']) {
    if (Object.hasOwn(appState, key)) nextState[key] = appState[key];
  }
  const nextFiles = { ...original.files };
  for (const [id, file] of Object.entries(files)) nextFiles[id] = { ...original.files?.[id], ...file };
  const scene = { ...original, elements: elements.map((element) => ({ ...originals.get(element.id), ...element })), files: nextFiles, appState: nextState };
  if (!markdown) {
    const newline = content.includes('\r\n') ? '\r\n' : '\n';
    return JSON.stringify(scene, null, 2).replace(/\n/g, newline) + (content.endsWith('\n') ? newline : '');
  }
  const block = drawingBlock(content);
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  return content.slice(0, block.start) + `\`\`\`compressed-json${newline}${LZString.compressToBase64(JSON.stringify(scene))}${newline}\`\`\`` + content.slice(block.end);
}

export function sceneFingerprint(elements: readonly any[], appState: Record<string, any>, files: Record<string, any>): string {
  return JSON.stringify([elements,
    appState.viewBackgroundColor, appState.gridSize, appState.currentItemStrokeColor, appState.currentItemBackgroundColor, files]);
}

export interface ExcalidrawViewport {
  scrollX: number;
  scrollY: number;
  zoom: { value: number };
}

const excalidrawViewportKey = (vaultId: string | undefined, path: string) =>
  `jademd:excalidraw-viewport:${vaultId || 'default'}:${path}`;

/**
 * Reads persisted Excalidraw camera position (scrollX, scrollY, zoom) for a document.
 * (JMD-BUG-006)
 */
export function readExcalidrawViewport(vaultId: string | undefined, path: string): ExcalidrawViewport | null {
  try {
    const raw = localStorage.getItem(excalidrawViewportKey(vaultId, path));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const zoomValue = parsed?.zoom?.value;
    if (
      typeof parsed?.scrollX === 'number' && Number.isFinite(parsed.scrollX) &&
      typeof parsed?.scrollY === 'number' && Number.isFinite(parsed.scrollY) &&
      typeof zoomValue === 'number' && Number.isFinite(zoomValue) && zoomValue > 0
    ) {
      return { scrollX: parsed.scrollX, scrollY: parsed.scrollY, zoom: { value: zoomValue } };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Persists Excalidraw camera position (scrollX, scrollY, zoom) in localStorage without dirtying the file.
 * (JMD-BUG-006)
 */
export function writeExcalidrawViewport(
  vaultId: string | undefined,
  path: string,
  appState: Record<string, any> | null | undefined,
): void {
  if (!appState) return;
  const zoomValue = typeof appState.zoom === 'number' ? appState.zoom : appState.zoom?.value;
  if (
    typeof appState.scrollX !== 'number' || !Number.isFinite(appState.scrollX) ||
    typeof appState.scrollY !== 'number' || !Number.isFinite(appState.scrollY) ||
    typeof zoomValue !== 'number' || !Number.isFinite(zoomValue) || zoomValue <= 0
  ) {
    return;
  }
  try {
    localStorage.setItem(
      excalidrawViewportKey(vaultId, path),
      JSON.stringify({ scrollX: appState.scrollX, scrollY: appState.scrollY, zoom: { value: zoomValue } }),
    );
  } catch {
    /* ignore storage quota errors */
  }
}
