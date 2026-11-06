import { api } from '../api/client';
import { exportNoteHtml } from './exportDocument';

export async function buildPublication(
  paths: string[], attachments: boolean, checkVault: () => void,
): Promise<string> {
  const pages = new Map([...new Set(paths)].map((path, index) => [path, `nota-${index + 1}`]));
  if (!pages.size || pages.size > 50) throw new Error('Selecciona entre 1 y 50 notas');
  let site: Document | undefined;
  let bytes = 0;
  const navigation = document.createElement('nav');
  navigation.setAttribute('aria-label', 'Índice de notas');
  const title = document.createElement('h1');
  title.textContent = 'Índice de notas';
  navigation.append(title);
  const list = document.createElement('ul');
  navigation.append(list);

  for (const [path, id] of pages) {
    checkVault();
    const source = await api.readNote(path);
    checkVault();
    const html = await exportNoteHtml(source, path, {
      attachments,
      resolveLink: async (target) => {
        checkVault();
        const resolved = await api.resolveEntry(target, path).catch(() => undefined);
        checkVault();
        const destination = resolved && pages.get(resolved);
        return destination ? `#${destination}` : undefined;
      },
    });
    bytes += new TextEncoder().encode(html).byteLength;
    if (bytes > 80 * 1024 * 1024) throw new Error('La publicación supera 80 MB');
    const rendered = new DOMParser().parseFromString(html, 'text/html');
    const article = rendered.querySelector('article')!;
    article.id = id;
    const entry = document.createElement('li');
    const link = document.createElement('a');
    link.href = `#${id}`;
    link.textContent = path.split('/').at(-1)!.replace(/\.md$/i, '');
    entry.append(link);
    list.append(entry);
    if (!site) site = rendered;
    else site.body.append(article);
  }
  checkVault();
  site!.title = 'Notas de Jademd';
  site!.body.prepend(navigation);
  return '<!doctype html>\n' + site!.documentElement.outerHTML;
}
