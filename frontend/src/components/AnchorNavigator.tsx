import { usePaneState } from '../store/PaneContext';
import { useEffect } from 'react';

export function AnchorNavigator() {
  const { paneId, activePaneId, activePath, navigationAnchor: anchor, navigationNonce, noteLoadState } = usePaneState();
  useEffect(() => {
    if (paneId !== activePaneId || !anchor || noteLoadState !== 'ready') return;
    let frame = 0;
    let attempts = 0;
    const find = () => {
      // The source editor handles the same navigation event using literal source positions.
      window.dispatchEvent(new CustomEvent('jademd:navigate-anchor', { detail: { anchor, paneId } }));
      const block = anchor.startsWith('^');
      const heading = anchor.split('#').at(-1)?.trim().toLowerCase();
      const scope = document.querySelector(`[data-pane-id="${paneId}"]`) || document;
      const candidates = scope.querySelectorAll(block ? '.markdown-body p, .markdown-body li, .markdown-body blockquote' : '.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6');
      const target = Array.from(candidates).find((element) => block
        ? new RegExp(`(?:^|\\s)${anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`).test(element.textContent || '')
        : element.textContent?.trim().toLowerCase() === heading);
      if (target) target.scrollIntoView?.({ block: 'center' });
      else if (++attempts < 20) frame = requestAnimationFrame(find);
    };
    frame = requestAnimationFrame(find);
    return () => cancelAnimationFrame(frame);
  }, [paneId, activePaneId, activePath, anchor, navigationNonce, noteLoadState]);
  return null;
}
