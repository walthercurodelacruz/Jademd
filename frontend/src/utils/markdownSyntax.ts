const blank = (value: string) => value.replace(/[^\r\n]/g, ' ');

/** A same-length analysis view: never use it as a document to save. */
export function maskMarkdown(source: string): string {
  let fence: { marker: string; size: number } | null = null;
  let text = source.split(/(?<=\n)/).map((line) => {
    const candidate = line.replace(/^(?: {0,3}>[ \t]?)+/, '').replace(/\r?\n$/, '');
    const run = candidate.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (run && run[1][0] === fence.marker && run[1].length >= fence.size && !run[2].trim()) fence = null;
      return blank(line);
    }
    if (run && !(run[1][0] === '`' && run[2].includes('`'))) {
      fence = { marker: run[1][0], size: run[1].length };
      return blank(line);
    }
    return /^(?: {4}|\t)/.test(candidate) ? blank(line) : line;
  }).join('');
  let result = '';
  let cursor = 0;
  for (let i = 0; i < text.length;) {
    let end = i;
    if (text[i] === '\\' && /[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~]/.test(text[i + 1] || '')) end = i + 2;
    else if (text[i] === '`') {
      let runEnd = i + 1;
      while (text[runEnd] === '`') runEnd++;
      const size = runEnd - i;
      let next = runEnd;
      while ((next = text.indexOf('`', next)) !== -1) {
        let close = next + 1;
        while (text[close] === '`') close++;
        if (close - next === size) { end = close; break; }
        next = close;
      }
      if (end === i) { i = runEnd; continue; }
    } else if (text.startsWith('<!--', i) || text.startsWith('%%', i)) {
      const html = text.startsWith('<!--', i);
      const closing = html ? '-->' : '%%';
      const next = text.indexOf(closing, i + (html ? 4 : 2));
      end = next === -1 ? text.length : next + closing.length;
    }
    if (end > i) {
      result += text.slice(cursor, i) + blank(text.slice(i, end));
      cursor = end; i = end;
    } else i++;
  }
  return result + text.slice(cursor);
}

export function isAttachmentTarget(target: string): boolean {
  const path = target.split('#')[0].toLowerCase();
  return /\.(?:png|jpe?g|gif|svg|webp|avif|bmp|ico|pdf|mp4|webm|mov|mp3|wav|ogg|m4a|canvas|excalidraw|excalidrawlib)$/.test(path);
}

export function noteLinks(source: string): string[] {
  const visible = maskMarkdown(source);
  const found: { index: number; target: string }[] = [];
  for (const match of visible.matchAll(/!?\[\[([^\]\n|]+)(?:\|[^\]\n]*)?\]\]/g)) {
    const target = match[1].trim();
    if (target && !isAttachmentTarget(target)) found.push({ index: match.index!, target });
  }
  for (const match of visible.matchAll(/(!?)\[([^\]\n]*)\]\((?:<([^>\n]*)>|([^\s()]+(?:\([^)]*\)[^\s()]*)*))(?:[ \t]+["'][^\n]*?["'])?\)/g)) {
    if (match[1]) continue;
    const encoded = match[3] || match[4];
    if (!encoded || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(encoded)) continue;
    let target: string;
    try { target = decodeURIComponent(encoded); } catch { target = encoded; }
    if (!isAttachmentTarget(target)) found.push({ index: match.index!, target });
  }
  return [...new Set(found.sort((a, b) => a.index - b.index).map((item) => item.target))];
}
