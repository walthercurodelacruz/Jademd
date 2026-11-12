// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { FileTree } from '../components/FileTree';
import { CreateEntryModal } from '../components/CreateEntryModal';
import { useVaultStore } from '../store/useVaultStore';
import { api } from '../api/client';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  localStorage.clear();
  useVaultStore.setState({
    vault: { id: 'test-vault', name: 'Test', path: '/test', storage_type: 'local', last_opened: Date.now() },
    tree: null,
    createModal: null,
    isLoading: false,
    noteError: null,
  });
});

afterEach(async () => {
  await act(async () => root.render(null));
  container.remove();
  useVaultStore.setState({ createModal: null });
});

const click = async (element: Element | null) => {
  if (!element) throw new Error('Element not found');
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
};

const rightClick = async (element: Element | null) => {
  if (!element) throw new Error('Element not found');
  await act(async () => {
    element.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 100,
        clientY: 100,
      })
    );
  });
};

const setInputValue = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

it('shows floating context menu when right clicking a folder and opens creation modal', async () => {
  const tree = {
    name: 'Vault',
    path: '',
    is_dir: true,
    children: [
      { name: 'Docs', path: 'Docs', is_dir: true, children: [] },
    ],
  };

  await act(async () => {
    root.render(
      <>
        <FileTree node={tree} />
        <CreateEntryModal />
      </>
    );
  });

  const docsFolder = container.querySelector('[data-tree-path="Docs"]');
  expect(docsFolder).not.toBeNull();

  // Right-click on Docs folder
  await rightClick(docsFolder);

  // Context menu should appear
  const contextMenu = container.querySelector('[role="menu"][aria-label="Acciones de archivo"]');
  expect(contextMenu).not.toBeNull();
  expect(contextMenu?.textContent).toContain('Nueva subcarpeta');
  expect(contextMenu?.textContent).toContain('Nueva nota');
  expect(contextMenu?.textContent).toContain('Nuevo dibujo Excalidraw');
  expect(contextMenu?.textContent).toContain('Nuevo lienzo Canvas');

  // Click "Nueva subcarpeta"
  const newSubfolderBtn = Array.from(contextMenu!.querySelectorAll('button')).find((b) =>
    b.textContent?.includes('Nueva subcarpeta')
  );
  expect(newSubfolderBtn).toBeDefined();
  await click(newSubfolderBtn!);

  // Modal should be open
  const modal = container.querySelector('[role="dialog"][aria-label="Nueva carpeta"]');
  expect(modal).not.toBeNull();
  expect(modal?.textContent).toContain('Ubicación: /Docs');

  // Test creating a folder
  const createFolderSpy = vi.spyOn(api, 'createFolder').mockResolvedValue(true);
  const getTreeSpy = vi.spyOn(api, 'getVaultTree').mockResolvedValue({
    name: 'Vault',
    path: '',
    is_dir: true,
    children: [
      {
        name: 'Docs',
        path: 'Docs',
        is_dir: true,
        children: [{ name: 'Guides', path: 'Docs/Guides', is_dir: true, children: [] }],
      },
    ],
  });

  const input = modal?.querySelector('input') as HTMLInputElement;
  expect(input).not.toBeNull();

  await setInputValue(input, 'Guides');

  const submitBtn = Array.from(modal!.querySelectorAll('button')).find((b) =>
    b.textContent?.includes('Crear')
  );
  await click(submitBtn!);

  expect(createFolderSpy).toHaveBeenCalledWith('Docs/Guides');

  createFolderSpy.mockRestore();
  getTreeSpy.mockRestore();
});

it('expands parent folder automatically so newly created subfolder is immediately visible', async () => {
  const initialTree = {
    name: 'Vault',
    path: '',
    is_dir: true,
    children: [
      {
        name: 'Parent',
        path: 'Parent',
        is_dir: true,
        children: [{ name: 'Child', path: 'Parent/Child', is_dir: true, children: [] }],
      },
    ],
  };

  await act(async () => {
    root.render(
      <>
        <FileTree node={initialTree} />
        <CreateEntryModal />
      </>
    );
  });

  // Initially Parent is at level 1, so it is collapsed
  expect(container.querySelector('[data-tree-path="Parent/Child"]')).toBeNull();

  // Dispatch folder expansion event as done when creating inside Parent
  await act(async () => {
    window.dispatchEvent(
      new CustomEvent('jademd:expand-folder', { detail: { path: 'Parent/Child' } })
    );
  });

  // Now Parent is expanded, and Parent/Child is rendered
  expect(container.querySelector('[data-tree-path="Parent/Child"]')).not.toBeNull();
});

it('validates illegal characters when creating a folder', async () => {
  await act(async () => {
    root.render(
      <>
        <CreateEntryModal />
      </>
    );
  });

  await act(async () => {
    useVaultStore.getState().openCreateModal('folder', 'Folder');
  });

  const modal = container.querySelector('[role="dialog"][aria-label="Nueva carpeta"]');
  expect(modal).not.toBeNull();

  const input = modal?.querySelector('input') as HTMLInputElement;
  await setInputValue(input, 'Invalid:Name*');

  const submitBtn = Array.from(modal!.querySelectorAll('button')).find((b) =>
    b.textContent?.includes('Crear')
  );
  await click(submitBtn!);

  const alert = container.querySelector('[role="alert"]');
  expect(alert).not.toBeNull();
  expect(alert?.textContent).toContain('caracteres inválidos');
});
