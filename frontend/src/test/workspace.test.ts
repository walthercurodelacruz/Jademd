import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyPane, initialWorkspace, readWorkspace, writeWorkspace, readSavedWorkspaces, writeSavedWorkspaces } from '../utils/workspace';

beforeEach(() => {
  const items = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => items.set(key, value) });
});
afterEach(() => vi.unstubAllGlobals());
describe('Workspace persistence', () => {
  it('restores pane selections, pinned tabs and history within the correct vault', () => {
    const layout = initialWorkspace();
    layout.panes[0] = { id: 'main', tabs: ['A.md', 'B.md'], activePath: 'B.md', pinned: ['A.md'], history: [{ path: 'A.md' }, { path: 'B.md' }], historyIndex: 1 };
    layout.noteModes['A.md'] = 'source';
    writeWorkspace('one', layout);
    expect(readWorkspace('one')).toEqual(layout);
    expect(readWorkspace('two')).toEqual(initialWorkspace());
  });
  it('validates corrupted layouts and rejects external/traversal paths', () => {
    localStorage.setItem('jademd:workspace:bad', JSON.stringify({ panes: [{ id: 'main', tabs: ['A.md', '../outside.md', '/absolute.md'], activePath: '../outside.md' }] }));
    const layout = readWorkspace('bad');
    expect(layout.panes[0].tabs).toEqual(['A.md']);
    expect(layout.panes[0].activePath).toBe('A.md');
    localStorage.setItem('jademd:workspace:bad', 'not json');
    expect(readWorkspace('bad')).toEqual(initialWorkspace());
  });
});

it('migrates legacy layouts and retains nested sizes in named layouts scoped to a vault', () => {
  const panes = [emptyPane('main'), emptyPane('right'), emptyPane('bottom')];
  localStorage.setItem('jademd:workspace:one', JSON.stringify({ panes, paneDirection: 'vertical' }));
  const migrated = readWorkspace('one');
  expect(migrated.splitTree).toMatchObject({ direction: 'vertical', ratio: 1 / 3 });
  const layout = { ...migrated, splitTree: {
    id: 'root', direction: 'horizontal' as const, ratio: 0.7, first: { paneId: 'main' },
    second: { id: 'nested', direction: 'vertical' as const, ratio: 0.3, first: { paneId: 'right' }, second: { paneId: 'bottom' } },
  } };
  writeSavedWorkspaces('one', [{ name: 'Estudio', layout }]);
  expect(readSavedWorkspaces('one')).toEqual([{ name: 'Estudio', layout }]);
  expect(readSavedWorkspaces('two')).toEqual([]);
});
