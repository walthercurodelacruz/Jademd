import { describe, it, expect } from 'vitest';
import { parseScene, serializeScene, sceneFingerprint } from '../utils/excalidrawDocument';

describe('Excalidraw compatibility and safe parsing', () => {
  it('preserves CRLF wrapper text and unknown scene fields through edits', () => {
    const original = '---\r\ncustom: keep\r\n---\r\n# Drawing\r\n```json:excalidraw\r\n{"elements":[],"extra":{"key":1},"appState":{"custom":true}}\r\n```\r\n%% after';
    const saved = serializeScene(original, true, [{ id: 'a', version: 1 }], { viewBackgroundColor: '#fff' }, {});
    expect(saved).toContain('custom: keep\r\n');
    expect(saved).toContain('```compressed-json\r\n');
    expect(saved).toContain('%% after');
    expect(parseScene(saved, true).extra).toEqual({ key: 1 });
    expect(parseScene(saved, true).appState?.custom).toBe(true);
  });
  it('refuses invalid scenes instead of silently creating an empty drawing', () => {
    for (const content of ['broken', '{}', '{"elements":null}', '{"elements":[null]}']) {
      expect(() => parseScene(content, false)).toThrow();
      expect(() => serializeScene(content, false, [], {}, {})).toThrow();
    }
    expect(() => parseScene('```compressed-json\ninvalid\n```', true)).toThrow();
  });
  it('includes background and embedded file changes, excluding viewport movement', () => {
    const baseline = sceneFingerprint([], { viewBackgroundColor: '#fff', scrollX: 0 }, {});
    expect(sceneFingerprint([], { viewBackgroundColor: '#fff', scrollX: 10 }, {})).toBe(baseline);
    expect(sceneFingerprint([], { viewBackgroundColor: '#000' }, {})).not.toBe(baseline);
    expect(sceneFingerprint([], { viewBackgroundColor: '#fff' }, { image: { dataURL: 'x' } })).not.toBe(baseline);
  });
  it('chooses the drawing region and leaves unrelated JSON and wrapper text unchanged', () => {
    const example = 'Example:\n```json\n{"elements":[],"sample":true}\n```\n';
    const drawing = '## Drawing\n````json\n{"elements":[{"id":"a","custom":17}],"appState":{"custom":true,"gridSize":20},"files":{"img":{"id":"img","extra":1}},"extra":"keep"}\n````\n%% End\n';
    const result = serializeScene(example + drawing, true, [{ id: 'a', version: 2 }], { viewBackgroundColor: '#000' }, { img: { id: 'img', dataURL: 'data:image/png;base64,x' } });
    expect(result.startsWith(example + '## Drawing\n')).toBe(true);
    expect(result.endsWith('\n%% End\n')).toBe(true);
    const scene = parseScene(result, true);
    expect(scene.extra).toBe('keep');
    expect(scene.elements[0].custom).toBe(17);
    expect(scene.appState?.gridSize).toBe(20);
    expect(scene.files?.img.extra).toBe(1);
  });
  it('refuses ambiguous drawings instead of replacing an arbitrary JSON block', () => {
    const block = '```json\n{"elements":[]}\n```\n';
    expect(() => parseScene(block + block, true)).toThrow('varios');
  });
});

it('detects external drawing edits even when an external editor did not increment element versions', () => {
  const original = [{ id: 'a', x: 0, y: 0, text: 'Original', version: 1, versionNonce: 7 }];
  expect(sceneFingerprint([{ ...original[0], x: 100 }], {}, {})).not.toBe(sceneFingerprint(original, {}, {}));
  expect(sceneFingerprint([{ ...original[0], text: 'External' }], {}, {})).not.toBe(sceneFingerprint(original, {}, {}));
});
