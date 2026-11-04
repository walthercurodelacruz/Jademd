import React, { useMemo, useState } from 'react';
import { marked } from 'marked';
import { useVaultStore } from '../store/useVaultStore';
import { FileNode } from '../types';
import { Tag, FileText, ChevronDown, ChevronRight, ExternalLink, Eye, Edit3, Columns } from 'lucide-react';

interface Props {
  content: string;
  path: string;
}

export const MarkdownPreview: React.FC<Props> = ({ content, path }) => {
  const { openNote, tree, setSearchOpen, performSearch, noteMode, setNoteMode } = useVaultStore();
  const [propertiesCollapsed, setPropertiesCollapsed] = useState(false);

  // Helper: Find note path in vault tree given a title/filename
  const findNotePath = (title: string, node: FileNode | null): string | null => {
    if (!node) return null;
    const cleanTitle = title.replace(/\.md$/, '').toLowerCase();

    if (!node.is_dir) {
      const nodeNameWithoutExt = node.name.replace(/\.md$/, '').toLowerCase();
      if (nodeNameWithoutExt === cleanTitle) {
        return node.path;
      }
    }

    if (node.children) {
      for (const child of node.children) {
        const found = findNotePath(title, child);
        if (found) return found;
      }
    }
    return null;
  };

  // Extract YAML frontmatter
  const { frontmatter, markdownBody } = useMemo(() => {
    const trimmed = content.trimStart();
    if (trimmed.startsWith('---')) {
      const match = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
      if (match) {
        const rawYaml = match[1];
        const body = match[2];

        // Basic YAML parser for simple key-values
        const meta: Record<string, string | string[]> = {};
        rawYaml.split('\n').forEach((line) => {
          const colonIdx = line.indexOf(':');
          if (colonIdx > 0) {
            const key = line.slice(0, colonIdx).trim();
            const val = line.slice(colonIdx + 1).trim();
            if (val.startsWith('[') && val.endsWith(']')) {
              // Array [a, b, c]
              meta[key] = val
                .slice(1, -1)
                .split(',')
                .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
                .filter(Boolean);
            } else {
              meta[key] = val.replace(/^['"]|['"]$/g, '');
            }
          }
        });

        return { frontmatter: meta, markdownBody: body };
      }
    }
    return { frontmatter: null, markdownBody: content };
  }, [content]);

  // Transform Markdown with Wikilinks, Tags and Marked
  const htmlContent = useMemo(() => {
    // 1. Process Wikilinks: [[Target|Alias]] or [[Target]]
    let processed = markdownBody.replace(
      /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      (_, target, alias) => {
        const label = (alias || target).trim();
        const cleanTarget = target.trim();
        return `<a class="wikilink" data-target="${cleanTarget}" title="Abrir nota: ${cleanTarget}"><svg class="inline-block w-3.5 h-3.5 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>${label}</a>`;
      }
    );

    // 2. Process Tags: #tag (word boundaries, not followed by space or heading)
    processed = processed.replace(
      /(^|\s)#([a-zA-Z0-9_\u00C0-\u017F-]+)(?=[^a-zA-Z0-9_\u00C0-\u017F-]|$)/g,
      '$1<span class="tag-pill" data-tag="$2">#$2</span>'
    );

    // 3. Configure Marked options
    marked.setOptions({
      gfm: true,
      breaks: true,
    });

    try {
      return marked.parse(processed) as string;
    } catch (e) {
      console.error('Error parseando markdown', e);
      return `<pre>${processed}</pre>`;
    }
  }, [markdownBody]);

  // Click delegation for Wikilinks, Tags and Links
  const handleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    // 1. Wikilink click
    const wikilinkEl = target.closest('.wikilink') as HTMLElement | null;
    if (wikilinkEl) {
      e.preventDefault();
      const targetNote = wikilinkEl.getAttribute('data-target');
      if (targetNote) {
        const resolvedPath = findNotePath(targetNote, tree) || `${targetNote}.md`;
        openNote(resolvedPath);
      }
      return;
    }

    // 2. Tag click
    const tagEl = target.closest('.tag-pill') as HTMLElement | null;
    if (tagEl) {
      e.preventDefault();
      const tag = tagEl.getAttribute('data-tag');
      if (tag) {
        performSearch(`#${tag}`);
        setSearchOpen(true);
      }
      return;
    }

    // 3. Regular external links
    const linkEl = target.closest('a') as HTMLAnchorElement | null;
    if (linkEl && linkEl.href && !linkEl.classList.contains('wikilink')) {
      if (linkEl.href.startsWith('http://') || linkEl.href.startsWith('https://')) {
        linkEl.target = '_blank';
        linkEl.rel = 'noopener noreferrer';
      }
    }
  };

  return (
    <div className="h-full w-full flex flex-col bg-obsidian-bg overflow-hidden">
      {/* Top Reading View Toolbar */}
      <div className="h-9 px-4 border-b border-obsidian-border bg-obsidian-sidebar/80 backdrop-blur-sm flex items-center justify-between select-none flex-shrink-0 z-10">
        <div className="flex items-center gap-2 text-xs text-obsidian-muted">
          <span className="w-2 h-2 rounded-full bg-jade-400" />
          <span className="font-medium text-obsidian-text">Vista de Lectura Formateada</span>
        </div>
        <div className="flex items-center gap-1 text-obsidian-muted">
          <button
            onClick={() => setNoteMode('live')}
            title="Modo Edición"
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs transition hover:text-white hover:bg-obsidian-hover"
          >
            <Edit3 size={13} />
            <span>Editar</span>
          </button>
          <button
            onClick={() => setNoteMode('reading')}
            title="Modo Lectura"
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs transition text-jade-400 bg-obsidian-card font-medium"
          >
            <Eye size={13} />
            <span>Lectura</span>
          </button>
          <button
            onClick={() => setNoteMode('split-preview')}
            title="Modo Dividido"
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs transition hover:text-white hover:bg-obsidian-hover"
          >
            <Columns size={13} />
            <span>Dividido</span>
          </button>
        </div>
      </div>

      {/* Scrollable Document Container */}
      <div
        onClick={handleClick}
        className="flex-1 w-full overflow-y-auto p-8 md:px-16 lg:px-24 select-text"
      >
        <div className="max-w-4xl mx-auto">
        {/* Properties / Frontmatter Card (Obsidian Style) */}
        {frontmatter && Object.keys(frontmatter).length > 0 && (
          <div className="mb-6 rounded-lg border border-obsidian-border bg-obsidian-card/60 overflow-hidden text-xs">
            <button
              onClick={() => setPropertiesCollapsed(!propertiesCollapsed)}
              className="w-full flex items-center justify-between px-3.5 py-2 bg-obsidian-sidebar/60 text-obsidian-muted hover:text-white transition font-medium"
            >
              <div className="flex items-center gap-1.5">
                <FileText size={14} className="text-jade-400" />
                <span>Propiedades</span>
                <span className="text-[10px] text-obsidian-muted font-mono ml-1">
                  ({Object.keys(frontmatter).length})
                </span>
              </div>
              {propertiesCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </button>

            {!propertiesCollapsed && (
              <div className="p-3 divide-y divide-obsidian-border/50">
                {Object.entries(frontmatter).map(([k, v]) => (
                  <div key={k} className="py-1.5 first:pt-0 last:pb-0 flex items-start gap-4">
                    <span className="w-28 text-obsidian-muted font-mono truncate">{k}:</span>
                    <div className="flex-1 text-obsidian-text">
                      {Array.isArray(v) ? (
                        <div className="flex flex-wrap gap-1">
                          {v.map((item, idx) => (
                            <span
                              key={idx}
                              onClick={(e) => {
                                e.stopPropagation();
                                performSearch(item);
                                setSearchOpen(true);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-jade-950/70 border border-jade-800/50 text-jade-300 text-[11px] font-medium cursor-pointer hover:bg-jade-900/80 transition"
                            >
                              <Tag size={10} />
                              <span>{item}</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="font-sans font-medium">{String(v)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Compiled Markdown Body */}
        <div
          className="markdown-body select-text"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      </div>
    </div>
    </div>
  );
};
