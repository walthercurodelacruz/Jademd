import { NoteMetadata } from '../types';
import { parseFrontmatter } from './frontmatter';
import { maskMarkdown, noteLinks } from './markdownSyntax';

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
  for (const match of visible.matchAll(/(?:^|\s)#([\p{L}\p{N}_\-/]+)/gu)) tags.add(match[1]);
  return { path, title: typeof frontmatter?.title === 'string' ? frontmatter.title : path.replace(/\.[^.]+$/, '').split('/').pop() || path,
    frontmatter: frontmatter || undefined, headings, tags: [...tags], outlinks: noteLinks(markdownBody),
    backlinks, word_count: content.split(/\s+/).filter(Boolean).length, character_count: [...content].length };
}
