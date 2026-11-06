import { FileNode } from '../types';
export function validVaultPath(path: string, allowEmpty = false): boolean {
  return (allowEmpty && path === '') || (!!path && !path.startsWith('/') && !/[\\\0\r\n#|\[\]]/.test(path) && path.split('/').every((part) => !!part && !part.startsWith('.')));
}
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function expandTemplate(source: string, title: string, now = new Date(), date = localDate(now)): string {
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return source.replace(/\{\{(date|time|title)\}\}/g, (_, name: string) => ({ date, time, title })[name as 'date']);
}
export function markdownFiles(tree: FileNode | null): string[] {
  if (!tree) return [];
  if (tree.is_dir) return (tree.children || []).flatMap(markdownFiles);
  return tree.path.endsWith('.md') && !tree.path.endsWith('.excalidraw.md') ? [tree.path] : [];
}
