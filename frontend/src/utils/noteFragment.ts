import { parseFrontmatter } from './frontmatter';
import { maskMarkdown } from './markdownSyntax';

/** Select only the requested section for display; the original file is never modified. */
export function noteFragment(content: string, fragment: string): string {
  const body = parseFrontmatter(content).markdownBody;
  if (!fragment) return body;
  const rawLines = body.split(/(?<=\n)/);
  const visible = maskMarkdown(body).split(/(?<=\n)/);
  let start = -1; let end = rawLines.length;
  if (fragment.startsWith('^')) {
    const marker = fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const index = visible.findIndex((line) => new RegExp(`(?:^|\\s)${marker}\\s*$`).test(line));
    if (index >= 0) {
      start = index;
      if (rawLines[index].trim() === fragment) { while (start > 0 && !rawLines[start - 1].trim()) start--; start--; }
      while (start > 0 && rawLines[start - 1].trim()) start--;
      end = index + 1;
    }
  } else {
    const title = fragment.split('#').at(-1)!.trim().toLowerCase();
    let level = 0;
    for (let index = 0; index < visible.length; index++) {
      const match = visible[index].replace(/\r?\n$/, '').match(/^ {0,3}(#{1,6})[ \t]+(.*)$/);
      if (!match) continue;
      if (start >= 0 && match[1].length <= level) { end = index; break; }
      if (start < 0 && match[2].replace(/[ \t]+#+[ \t]*$/, '').trim().toLowerCase() === title) { start = index; level = match[1].length; }
    }
  }
  if (start < 0) throw new Error('No se encontró el encabezado o bloque enlazado.');
  return rawLines.slice(start, end).join('');
}
