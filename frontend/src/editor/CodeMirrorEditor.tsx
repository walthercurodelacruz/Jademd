import React, { useEffect, useRef } from 'react';
import { EditorState, Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { autocompletion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { useVaultStore } from '../store/useVaultStore';
import { FileNode } from '../types';

interface Props {
  initialContent: string;
  path: string;
}

export const CodeMirrorEditor: React.FC<Props> = ({ initialContent, path }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const saveTimeoutRef = useRef<any>(null);
  const { saveCurrentNote, tree } = useVaultStore();

  // Helper to extract all note titles from the vault tree for autocompletion
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

  // Wikilink [[note]] autocompletion extension
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

  useEffect(() => {
    if (!editorRef.current) return;

    // Destroy existing view if present
    if (viewRef.current) {
      viewRef.current.destroy();
    }

    const customTheme = EditorView.theme({
      '&': {
        height: '100%',
        fontSize: '15px',
        backgroundColor: '#18181b',
        color: '#f4f4f5',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      },
      '.cm-scroller': {
        overflow: 'auto',
        lineHeight: '1.7',
        padding: '24px 48px',
        maxWidth: '900px',
        margin: '0 auto',
      },
      '.cm-content': {
        caretColor: '#4ade80',
      },
      '&.cm-focused .cm-cursor': {
        borderLeftColor: '#4ade80',
      },
      '.cm-line': {
        padding: '0 4px',
      },
      '.cm-gutters': {
        backgroundColor: '#18181b',
        color: '#52525b',
        border: 'none',
      },
      '.cm-activeLine': {
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
      },
    });

    const extensions: Extension[] = [
      lineNumbers(),
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
          }, 500);
        }
      }),
    ];

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
  }, [path]);

  return (
    <div className="h-full w-full relative flex flex-col bg-obsidian-bg">
      <div ref={editorRef} className="h-full w-full overflow-hidden" />
    </div>
  );
};
