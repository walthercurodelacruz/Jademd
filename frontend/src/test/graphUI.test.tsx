// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { GraphView } from '../components/GraphView';
import { useVaultStore } from '../store/useVaultStore';

it('keeps a graph with a highly connected note drawable as the layout settles', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const nodes = Array.from({ length: 360 }, (_, index) => ({
    id: `${index}.md`, label: String(index), group: 'note', weight: 1,
  }));
  const previous = useVaultStore.getState();
  useVaultStore.setState({
    graphData: { nodes, links: nodes.slice(1).map(({ id }) => ({ source: nodes[0].id, target: id })) },
    graphLoading: false, graphError: null,
  });

  let nextFrame: FrameRequestCallback | undefined;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    nextFrame = callback;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => { nextFrame = undefined; });
  vi.spyOn(HTMLCanvasElement.prototype, 'clientWidth', 'get').mockReturnValue(900);
  vi.spyOn(HTMLCanvasElement.prototype, 'clientHeight', 'get').mockReturnValue(700);
  const noop = () => {};
  const arc = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    save: noop, restore: noop, scale: noop, clearRect: noop, translate: noop,
    beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop, fill: noop, arc,
  } as unknown as CanvasRenderingContext2D);

  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(<GraphView />));
    for (let frame = 0; frame < 240; frame++) {
      arc.mockClear();
      nextFrame?.(frame * 16);
    }
    expect(arc).toHaveBeenCalledTimes(nodes.length);
    for (const [x, y] of arc.mock.calls) {
      expect(Math.abs(x)).toBeLessThan(3000);
      expect(Math.abs(y)).toBeLessThan(3000);
    }
  } finally {
    await act(async () => root.unmount());
    useVaultStore.setState(previous);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
