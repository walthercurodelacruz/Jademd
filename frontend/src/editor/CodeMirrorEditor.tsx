import React, { useEffect, useRef, useState } from 'react';
import { EditorState, Extension } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
  WidgetType,
  MatchDecorator,
  Decoration,
  ViewPlugin,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { oneDark } from '@codemirror/theme-one-dark';
import { autocompletion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { useVaultStore } from '../store/useVaultStore';
import { FileNode } from '../types';
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  Link,
  List,
  CheckSquare,
  Quote,
  Code,
  Hash,
  Eye,
  Edit3,
  Columns,
} from 'lucide-react';

interface Props {
  initialContent: string;
  path: string;
}

// Custom Markdown Highlighting for Live Preview styling
const obsidianHighlightStyle = HighlightStyle.define([
  { tag: tags.heading1, fontSize: '1.85rem', fontWeight: '700', color: '#4ade80' },
  { tag: tags.heading2, fontSize: '1.5rem', fontWeight: '700', color: '#38bdf8' },
  { tag: tags.heading3, fontSize: '1.25rem', fontWeight: '600', color: '#a78bfa' },
  { tag: tags.heading4, fontSize: '1.1rem', fontWeight: '600', color: '#facc15' },
  { tag: tags.heading5, fontSize: '1.0rem', fontWeight: '600', color: '#f472b6' },
  { tag: tags.heading6, fontSize: '0.95rem', fontWeight: '600', color: '#94a3b8' },
  { tag: tags.strong, fontWeight: '700', color: '#ffffff' },
  { tag: tags.emphasis, fontStyle: 'italic', color: '#e4e4e7' },
  { tag: tags.quote, fontStyle: 'italic', color: '#a1a1aa' },
  { tag: tags.link, color: '#34d399', textDecoration: 'underline' },
  { tag: tags.monospace, fontFamily: 'ui-monospace, monospace', backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px' },
  { tag: tags.strikethrough, textDecoration: 'line-through', color: '#71717a' },
]);

// Obsidian Live Preview Inline Image Widget
class InlineImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly width?: string,
    readonly height?: string
  ) {
    super();
  }

  eq(other: InlineImageWidget) {
    return (
      this.src === other.src &&
      this.alt === other.alt &&
      this.width === other.width &&
      this.height === other.height
    );
  }

  toDOM() {
    const wrap = document.createElement('div');
    wrap.className = 'cm-inline-image-wrap my-3 flex flex-col items-center select-none';

    const isExternal =
      this.src.startsWith('http://') ||
      this.src.startsWith('https://') ||
      this.src.startsWith('data:');
    const assetUrl = isExternal
      ? this.src
      : `/api/asset?path=${encodeURIComponent(this.src.replace(/^\.\//, ''))}`;

    const img = document.createElement('img');
    img.src = assetUrl;
    img.alt = this.alt;
    img.className =
      'rounded-xl border border-obsidian-border/80 shadow-lg max-w-full h-auto max-h-[420px] object-contain hover:shadow-2xl transition cursor-pointer';
    if (this.width) img.style.maxWidth = `${this.width}px`;
    if (this.height) img.style.maxHeight = `${this.height}px`;

    img.onerror = () => {
      wrap.innerHTML = `<span class="text-2xs text-amber-400 bg-amber-950/40 border border-amber-900/50 px-2.5 py-1 rounded-md inline-flex items-center gap-1 font-mono">🖼️ Imagen no encontrada: ${this.src}</span>`;
    };

    wrap.appendChild(img);
    return wrap;
  }
}

const wikilinkImageDecorator = new MatchDecorator({
  regexp: /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
  decoration: (match) => {
    const src = match[1].trim();
    const opt = (match[2] || '').trim();
    let width: string | undefined;
    let height: string | undefined;
    let alt = src;

    if (/^\d+$/.test(opt)) {
      width = opt;
    } else if (/^(\d+)x(\d+)$/.test(opt)) {
      const m = opt.match(/^(\d+)x(\d+)$/);
      if (m) {
        width = m[1];
        height = m[2];
      }
    } else if (opt) {
      alt = opt;
    }

    return Decoration.widget({
      widget: new InlineImageWidget(src, alt, width, height),
      side: 1,
      block: true,
    });
  },
});

const standardImageDecorator = new MatchDecorator({
  regexp: /!\[([^\]]*)\]\(([^)]+)\)/g,
  decoration: (match) => {
    const rawAlt = (match[1] || '').trim();
    const src = (match[2] || '').trim();
    let width: string | undefined;
    let height: string | undefined;
    let alt = rawAlt;

    if (rawAlt.includes('|')) {
      const parts = rawAlt.split('|');
      alt = parts[0].trim();
      const opt = parts[1].trim();
      if (/^\d+$/.test(opt)) {
        width = opt;
      } else if (/^(\d+)x(\d+)$/.test(opt)) {
        const m = opt.match(/^(\d+)x(\d+)$/);
        if (m) {
          width = m[1];
          height = m[2];
        }
      }
    }

    return Decoration.widget({
      widget: new InlineImageWidget(src, alt, width, height),
      side: 1,
      block: true,
    });
  },
});

const wikilinkImagePlugin = ViewPlugin.fromClass(
  class {
    decorations;
    constructor(view: EditorView) {
      this.decorations = wikilinkImageDecorator.createDeco(view);
    }
    update(u: any) {
      if (u.docChanged || u.viewportChanged) {
        this.decorations = wikilinkImageDecorator.createDeco(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

const standardImagePlugin = ViewPlugin.fromClass(
  class {
    decorations;
    constructor(view: EditorView) {
      this.decorations = standardImageDecorator.createDeco(view);
    }
    update(u: any) {
      if (u.docChanged || u.viewportChanged) {
        this.decorations = standardImageDecorator.createDeco(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

export const CodeMirrorEditor: React.FC<Props> = ({ initialContent, path }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const saveTimeoutRef = useRef<any>(null);
  const [showLineNumbers, setShowLineNumbers] = useState(false);
  const { saveCurrentNote, tree, noteMode, setNoteMode } = useVaultStore();

  // Helper: Extract note titles from vault for wikilink autocomplete
  const getNoteTitles = (node: FileNode | null): string[] => {
    if (!node) return [];
    let titles: string[] = [];
    if (!node.is_dir && node.name.endsWith('.md')) {
      titles.push(node.name.replace(/\.md$/, ''));
    }
    if (node.children) {
      for (const child of node.children) {
        titles = titles.concat(getNoteTitles(child));
      }
    }
    return titles;
  };

  // Wikilink [[note]] autocompletion
  const wikilinkCompletion = (context: CompletionContext): CompletionResult | null => {
    const word = context.matchBefore(/\[\[([^\]]*)$/);
    if (!word) return null;

    const query = word.text.slice(2).toLowerCase();
    const availableTitles = getNoteTitles(tree);

    const options = availableTitles
      .filter((title) => title.toLowerCase().includes(query))
      .map((title) => ({
        label: title,
        apply: `${title}]]`,
        type: 'keyword',
        detail: 'Nota vinculada',
      }));

    return {
      from: word.from + 2,
      options,
    };
  };

  // Quick insertion helpers for editor toolbar
  const insertText = (prefix: string, suffix: string = '') => {
    const view = viewRef.current;
    if (!view) return;

    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);
    const replacement = `${prefix}${selected || 'texto'}${suffix}`;

    view.dispatch({
      changes: { from, to, insert: replacement },
      selection: { anchor: from + prefix.length, head: from + replacement.length - suffix.length },
    });
    view.focus();
  };

  useEffect(() => {
    if (!editorRef.current) return;

    if (viewRef.current) {
      viewRef.current.destroy();
    }

    const customTheme = EditorView.theme({
      '&': {
        height: '100%',
        fontSize: '15.5px',
        backgroundColor: '#18181b',
        color: '#f4f4f5',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      },
      '.cm-scroller': {
        overflow: 'auto',
        lineHeight: '1.8',
        padding: '24px 48px',
        maxWidth: '920px',
        margin: '0 auto',
      },
      '.cm-content': {
        caretColor: '#4ade80',
      },
      '&.cm-focused .cm-cursor': {
        borderLeftColor: '#4ade80',
      },
      '.cm-line': {
        padding: '2px 4px',
      },
      '.cm-gutters': {
        backgroundColor: '#18181b',
        color: '#52525b',
        border: 'none',
        paddingRight: '12px',
        display: showLineNumbers ? 'flex' : 'none',
      },
      '.cm-activeLine': {
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
      },
    });

    const extensions: Extension[] = [
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      markdown(),
      syntaxHighlighting(obsidianHighlightStyle),
      wikilinkImagePlugin,
      standardImagePlugin,
      oneDark,
      customTheme,
      autocompletion({ override: [wikilinkCompletion] }),
      keymap.of([
        indentWithTab,
        {
          key: 'Mod-s',
          run: (view) => {
            const content = view.state.doc.toString();
            saveCurrentNote(content);
            return true;
          },
        },
        ...defaultKeymap,
        ...historyKeymap,
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const content = update.state.doc.toString();
          if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = setTimeout(() => {
            saveCurrentNote(content);
          }, 400);
        }
      }),
    ];

    if (showLineNumbers) {
      extensions.unshift(lineNumbers());
    }

    const state = EditorState.create({
      doc: initialContent,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      view.destroy();
    };
  }, [path, showLineNumbers]);

  return (
    <div className="h-full w-full relative flex flex-col bg-obsidian-bg overflow-hidden">
      {/* Floating Obsidian Style Editor Toolbar */}
      <div className="h-9 px-4 border-b border-obsidian-border bg-obsidian-sidebar/80 backdrop-blur-sm flex items-center justify-between select-none flex-shrink-0 z-10">
        {/* Quick Markdown Formatting Controls */}
        <div className="flex items-center gap-1 text-obsidian-muted">
          <button
            onClick={() => insertText('**', '**')}
            title="Negrita (**)"
            className="p-1 hover:text-white hover:bg-obsidian-hover rounded transition"
          >
            <Bold size={14} />
          </button>
          <button
            onClick={() => insertText('*', '*')}
            title="Cursiva (*)"
            className="p-1 hover:text-white hover:bg-obsidian-hover rounded transition"
          >
            <Italic size={14} />
          </button>
          <div className="w-[1px] h-4 bg-obsidian-border mx-1" />
          <button
            onClick={() => insertText('# ')}
            title="Encabezado 1 (#)"
            className="p-1 hover:text-white hover:bg-obsidian-hover rounded transition"
          >
            <Heading1 size={14} />
          </button>
          <button
            onClick={() => insertText('## ')}
            title="Encabezado 2 (##)"
            className="p-1 hover:text-white hover:bg-obsidian-hover rounded transition"
          >
            <Heading2 size={14} />
          </button>
          <button
            onClick={() => insertText('### ')}
            title="Encabezado 3 (###)"
            className="p-1 hover:text-white hover:bg-obsidian-hover rounded transition"
          >
            <Heading3 size={14} />
          </button>
          <div className="w-[1px] h-4 bg-obsidian-border mx-1" />
          <button
            onClick={() => insertText('[[', ']]')}
            title="Enlace [[Wikilink]]"
            className="p-1 hover:text-jade-400 hover:bg-obsidian-hover rounded transition"
          >
            <Link size={14} />
          </button>
          <button
            onClick={() => insertText('- ')}
            title="Lista con viñetas (-)"
            className="p-1 hover:text-white hover:bg-obsidian-hover rounded transition"
          >
            <List size={14} />
          </button>
          <button
            onClick={() => insertText('- [ ] ')}
            title="Lista de tareas (- [ ])"
            className="p-1 hover:text-white hover:bg-obsidian-hover rounded transition"
          >
            <CheckSquare size={14} />
          </button>
          <button
            onClick={() => insertText('> ')}
            title="Cita (>)"
            className="p-1 hover:text-white hover:bg-obsidian-hover rounded transition"
          >
            <Quote size={14} />
          </button>
          <button
            onClick={() => insertText('`', '`')}
            title="Código en línea (`)"
            className="p-1 hover:text-white hover:bg-obsidian-hover rounded transition"
          >
            <Code size={14} />
          </button>
        </div>

        {/* View Mode & Preferences Selector */}
        <div className="flex items-center gap-1 text-obsidian-muted">
          <button
            onClick={() => setShowLineNumbers(!showLineNumbers)}
            title={showLineNumbers ? 'Ocultar números de línea' : 'Mostrar números de línea'}
            className={`p-1.5 rounded transition ${
              showLineNumbers ? 'text-jade-400 bg-obsidian-card' : 'hover:text-white hover:bg-obsidian-hover'
            }`}
          >
            <Hash size={13} />
          </button>
          <div className="w-[1px] h-4 bg-obsidian-border mx-1" />
          <button
            onClick={() => setNoteMode('live')}
            title="Modo Edición"
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition ${
              noteMode === 'live' ? 'text-jade-400 bg-obsidian-card font-medium' : 'hover:text-white hover:bg-obsidian-hover'
            }`}
          >
            <Edit3 size={13} />
            <span>Editar</span>
          </button>
          <button
            onClick={() => setNoteMode('reading')}
            title="Modo Lectura (Formateado limpio)"
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition ${
              noteMode === 'reading' ? 'text-jade-400 bg-obsidian-card font-medium' : 'hover:text-white hover:bg-obsidian-hover'
            }`}
          >
            <Eye size={13} />
            <span>Lectura</span>
          </button>
          <button
            onClick={() => setNoteMode('split-preview')}
            title="Modo Dividido (Editor + Vista Previa)"
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition ${
              noteMode === 'split-preview' ? 'text-jade-400 bg-obsidian-card font-medium' : 'hover:text-white hover:bg-obsidian-hover'
            }`}
          >
            <Columns size={13} />
            <span>Dividido</span>
          </button>
        </div>
      </div>

      {/* Editor Body */}
      <div ref={editorRef} className="flex-1 w-full overflow-hidden" />
    </div>
  );
};
