import { NoteMetadata } from '../types';
import { parseFrontmatter } from './frontmatter';
import { maskMarkdown, noteLinks } from './markdownSyntax';

function isValidInlineTag(tag: string, body: string, matchStart: number, matchEnd: number): boolean {
  if (!tag || tag.startsWith('/') || tag.endsWith('/') || tag.includes('//') || /^\d+$/.test(tag)) {
    return false;
  }
  if (
    (tag.length === 3 || tag.length === 4 || tag.length === 6 || tag.length === 8) &&
    /^[0-9a-fA-F]+$/.test(tag) &&
    (/\d/.test(tag) || /^[0-9A-F]+$/.test(tag) || /^[;"')]/.test(body.slice(matchEnd, matchEnd + 1)))
  ) {
    return false;
  }
  const lineStart = body.lastIndexOf('\n', matchStart - 1) + 1;
  const prefix = body.slice(lineStart, matchStart);
  const lt = prefix.lastIndexOf('<');
  if (lt !== -1 && !prefix.slice(lt).includes('>') && /^[a-zA-Z]/.test(prefix.slice(lt + 1))) {
    return false;
  }
  return true;
}

export function noteMetadata(path: string, content: string, backlinks: string[]): NoteMetadata {
  const { frontmatter, markdownBody, bodyLine } = parseFrontmatter(content);
  const visible = maskMarkdown(markdownBody);
  const originalLines = markdownBody.split('\n');
  const headings = visible.split('\n').flatMap((line, index) => {
    const match = line.replace(/\r$/, '').match(/^ {0,3}(#{1,6})[ \t]+(.*)$/);
    return match ? [{ level: match[1].length, text: originalLines[index].replace(/\r$/, '').match(/^ {0,3}#{1,6}[ \t]+(.*)$/)![1].replace(/[ \t]+#+[ \t]*$/, '').trim(), line: bodyLine + index }] : [];
  });
  const tags = new Set<string>();
  const yamlTags = frontmatter?.tags;
  if (Array.isArray(yamlTags)) yamlTags.filter((tag): tag is string => typeof tag === 'string').forEach((tag) => tags.add(tag.replace(/^#/, '')));
  else if (typeof yamlTags === 'string') tags.add(yamlTags.replace(/^#/, ''));
  for (const match of visible.matchAll(/(?:^|\s)#([\p{L}\p{N}_\-/]+)/gu)) {
    const tag = match[1];
    const tagEnd = match.index! + match[0].length;
    const tagStart = tagEnd - tag.length;
    if (isValidInlineTag(tag, visible, tagStart, tagEnd)) {
      tags.add(tag);
    }
  }
  return { path, title: typeof frontmatter?.title === 'string' ? frontmatter.title : path.replace(/\.[^.]+$/, '').split('/').pop() || path,
    frontmatter: frontmatter || undefined, headings, tags: [...tags], outlinks: noteLinks(markdownBody),
    backlinks, word_count: content.split(/\s+/).filter(Boolean).length, character_count: [...content].length };
}
