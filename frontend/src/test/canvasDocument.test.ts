import { describe, it, expect } from 'vitest';
import { parseCanvas, serializeCanvas, canvasColor, edgeGeometry, removeCanvasNode, connectCanvasNodes, canvasViewBounds, extractYouTubeId } from '../utils/canvasDocument';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Canvas document preservation', () => {
  it('preserves unknown root, node and edge fields while editing text', () => {
    const document = parseCanvas(JSON.stringify({ metadata: { future: true }, nodes: [
      { id: 'a', type: 'text', x: 0, y: 0, width: 100, height: 100, text: 'old', custom: [1, 2] },
    ], edges: [{ id: 'e', fromNode: 'a', toNode: 'a', unknown: 9 }] }));
    const edited = { ...document, nodes: document.nodes.map((node) => ({ ...node, text: 'new' })) };
    const reopened = parseCanvas(JSON.stringify(edited));
    expect(reopened.metadata).toEqual({ future: true });
    expect(reopened.nodes[0].custom).toEqual([1, 2]);
    expect(reopened.edges[0].unknown).toBe(9);
  });
  it('accepts an existing empty canvas without creating template cards', () => {
    expect(parseCanvas('{"nodes":[],"edges":[]}')).toEqual({ nodes: [], edges: [] });
  });
  it('refuses malformed documents rather than treating them as new', () => {
    for (const content of ['', '[]', '{"nodes":[null],"edges":[]}', '{"nodes":[],"edges":[null]}']) {
      expect(() => parseCanvas(content)).toThrow();
    }
  });
  it('accepts optional top-level arrays and preserves untouched files exactly', () => {
    for (const source of ['{}', '{"nodes":[]}', '{"edges":[],"custom":true}']) {
      expect(parseCanvas(source).nodes).toEqual([]);
      expect(serializeCanvas(source, parseCanvas(source))).toBe(source);
    }
  });
  it('round-trips every standard node and edge option through a text edit', () => {
    const source = readFileSync(resolve(process.cwd(), '../tests/fixtures/compatibility/all-nodes.canvas'), 'utf8');
    const original = parseCanvas(source);
    const edited = { ...original, nodes: original.nodes.map((node) => node.id === 'a' ? { ...node, text: 'Edited' } : node) };
    const saved = parseCanvas(serializeCanvas(source, edited));
    expect(saved).toEqual(edited);
    expect(saved.nodes[0]).toEqual(original.nodes[0]);
    expect(saved.edges).toEqual(original.edges);
    expect(edgeGeometry(original.nodes[1], original.nodes[2], original.edges[0]).start).toEqual({ x: 120, y: 200, dx: 0, dy: 1 });
    expect(edgeGeometry(original.nodes[1], original.nodes[2], original.edges[0]).end).toEqual({ x: 400, y: 50, dx: 0, dy: -1 });
    expect(canvasColor('2')).toBe('#f97316');
  });
});

describe('Canvas editing operations', () => {
  const data = () => parseCanvas(JSON.stringify({ custom: { keep: true }, nodes: [
    { id: 'a', type: 'text', x: -200, y: -100, width: 100, height: 100, custom: 1 },
    { id: 'b', type: 'group', x: 100, y: 100, width: 300, height: 200, custom: 2 },
  ], edges: [{ id: 'old', fromNode: 'b', toNode: 'b', future: 7 }] }));
  it('creates connections with sides and labels while preserving unrelated fields', () => {
    const original = data(); const updated = connectCanvasNodes(original, 'a', 'b', { fromSide: 'bottom', toSide: 'top', label: 'Relación', toEnd: 'arrow' });
    expect(updated.custom).toEqual({ keep: true }); expect(updated.edges[0]).toEqual(original.edges[0]);
    expect(updated.edges[1]).toMatchObject({ fromNode: 'a', toNode: 'b', fromSide: 'bottom', toSide: 'top', label: 'Relación' });
    expect(() => connectCanvasNodes(original, 'missing', 'b')).toThrow();
  });
  it('removes only the selected card and its attached connections', () => {
    const original = connectCanvasNodes(data(), 'a', 'b'); const updated = removeCanvasNode(original, 'a');
    expect(updated.nodes.map((node) => node.id)).toEqual(['b']); expect(updated.nodes[0].custom).toBe(2);
    expect(updated.edges).toEqual([original.edges[0]]); expect(updated.custom).toEqual(original.custom);
  });
  it('fits negative and positive coordinates inside the viewport', () => {
    const view = canvasViewBounds(data(), 1000, 700);
    for (const node of data().nodes) {
      expect(node.x*view.zoom+view.pan.x).toBeGreaterThanOrEqual(39);
      expect((node.x+node.width)*view.zoom+view.pan.x).toBeLessThanOrEqual(961);
    }
    expect(canvasViewBounds({ nodes: [], edges: [] }, 1000, 700).zoom).toBe(1);
  });
  it('extracts YouTube video IDs from watch, short, embed, shorts and live URLs (JMD-BUG-004)', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=WUN7p3D8FyY')).toBe('WUN7p3D8FyY');
    expect(extractYouTubeId('https://www.youtube.com/watch?v=WUN7p3D8FyY&t=45s')).toBe('WUN7p3D8FyY');
    expect(extractYouTubeId('https://youtu.be/WUN7p3D8FyY?si=abc')).toBe('WUN7p3D8FyY');
    expect(extractYouTubeId('https://www.youtube.com/embed/WUN7p3D8FyY')).toBe('WUN7p3D8FyY');
    expect(extractYouTubeId('https://www.youtube.com/shorts/WUN7p3D8FyY')).toBe('WUN7p3D8FyY');
    expect(extractYouTubeId('https://m.youtube.com/live/WUN7p3D8FyY')).toBe('WUN7p3D8FyY');
    expect(extractYouTubeId('https://example.com/watch?v=WUN7p3D8FyY')).toBeNull();
    expect(extractYouTubeId('not a url')).toBeNull();
  });
});
