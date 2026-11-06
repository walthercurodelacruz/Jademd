/**
 * Utility functions for Obsidian Markdown conversions and Frontmatter parsing.
 */

export function decodeAssetPath(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

export { parseFrontmatter } from './frontmatter';
export type { FrontmatterResult } from './frontmatter';

/**
 * @deprecated Legacy single-fragment converter. Use SourceDocument and VaultReference for documents.
 * Preprocesses Obsidian markdown into TipTap-compatible markdown:
 * - Converts PDF wikilinks ![[file.pdf]] into clickable badges/links
 * - Converts Audio and Video wikilinks into HTML tags
 * - Converts Image wikilinks ![[image.png]] into ![alt](<image.png>) with angle brackets for safe spaces
 * - Ensures markdown images with spaces are wrapped in <...>
 */
export function preprocessForEditor(markdownBody: string): string {
  let res = markdownBody;

  // 1. PDF embeds ![[file.pdf]]
  res = res.replace(/!\[\[([^\]|]+\.pdf)(?:\|([^\]]+))?\]\]/gi, (_, target, opt) => {
    const clean = target.trim();
    const title = (opt || clean).trim();
    const pdfUrl = `/api/asset?path=${encodeURIComponent(clean)}`;
    return `\n\n[📄 Documento PDF: ${title} (${clean})](${pdfUrl})\n\n`;
  });

  // 2. Video embeds ![[video.mp4]]
  res = res.replace(/!\[\[([^\]|]+\.(?:mp4|webm|mov))(?:\|([^\]]+))?\]\]/gi, (_, target) => {
    const clean = target.trim();
    const vidUrl = `/api/asset?path=${encodeURIComponent(clean)}`;
    return `\n\n<video controls class="my-4 rounded-xl max-w-full border border-obsidian-border shadow-md" src="${vidUrl}"></video>\n\n`;
  });

  // 3. Audio embeds ![[audio.mp3]]
  res = res.replace(/!\[\[([^\]|]+\.(?:mp3|wav|ogg|m4a))(?:\|([^\]]+))?\]\]/gi, (_, target) => {
    const clean = target.trim();
    const audUrl = `/api/asset?path=${encodeURIComponent(clean)}`;
    return `\n\n<audio controls class="my-3 w-full" src="${audUrl}"></audio>\n\n`;
  });

  // 4. Obsidian image wikilinks ![[image.ext]] or ![[image.ext|alt]] with angle brackets <...>
  res = res.replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, opt) => {
    const clean = target.trim();
    const alt = (opt || clean).trim();
    return `![${alt}](<${clean}>)`;
  });

  // 5. Wrap existing standard markdown images with spaces in angle brackets if not already wrapped
  res = res.replace(/!\[([^\]]*)\]\(([^<][^)]*)\)/g, (match, alt, src) => {
    const cleanSrc = src.trim();
    if (cleanSrc.includes(' ') && !cleanSrc.startsWith('<')) {
      return `![${alt}](<${cleanSrc}>)`;
    }
    return match;
  });

  return res;
}

/**
 * @deprecated Legacy single-fragment converter. Do not apply it to a complete document.
 * Converts TipTap markdown output back to standard Obsidian Wikilink format: ![[image.png]]
 */
export function toObsidianMarkdown(md: string): string {
  let res = md;

  // Revert PDF embeds back to ![[file.pdf]]
  res = res.replace(/\[📄 Documento PDF:[^)]*?\(([^)]+\.pdf)\)\]\([^)]+\)/gi, (_, filename) => {
    return `![[${filename.trim()}]]`;
  });
  res = res.replace(/<div class="obsidian-pdf-embed[\s\S]*?<iframe src="\/api\/asset\?path=([^"&]+)[\s\S]*?<\/div>/gi, (_, path) => {
    return `![[${decodeAssetPath(path)}]]`;
  });

  // Revert video embeds
  res = res.replace(/<video controls[^>]*src="\/api\/asset\?path=([^"&]+)"[^>]*><\/video>/gi, (_, path) => {
    return `![[${decodeAssetPath(path)}]]`;
  });

  // Revert audio embeds
  res = res.replace(/<audio controls[^>]*src="\/api\/asset\?path=([^"&]+)"[^>]*><\/audio>/gi, (_, path) => {
    return `![[${decodeAssetPath(path)}]]`;
  });

  // Revert standard and angle-bracketed markdown images back to ![[image.png]]
  res = res.replace(/!\[([^\]]*)\]\((?:(?:\/api\/asset\?path=)?([^)]+))\)/g, (match, alt, src) => {
    let cleanSrc = src.trim().replace(/^<|>$/g, '');
    if (/^(https?:|data:)/.test(cleanSrc)) return match;
    cleanSrc = decodeAssetPath(cleanSrc).replace(/^\/api\/asset\?path=/, '').replace(/^\.\//, '');

    // Preserve external HTTP/HTTPS images and base64 data URLs as standard markdown
    if (cleanSrc.startsWith('http://') || cleanSrc.startsWith('https://') || cleanSrc.startsWith('data:')) {
      return `![${alt}](${cleanSrc})`;
    }

    // Obsidian wikilink with alias if custom alt text was provided
    if (alt && alt !== cleanSrc && alt !== cleanSrc.replace(/\.[^/.]+$/, '')) {
      return `![[${cleanSrc}|${alt}]]`;
    }
    return `![[${cleanSrc}]]`;
  });

  return res;
}

export { isAttachmentTarget as isAttachment, noteLinks as extractWikilinks } from './markdownSyntax';
