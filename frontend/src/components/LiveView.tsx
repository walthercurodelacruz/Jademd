import { numberFootnotes } from '../utils/advancedRendering';
import { usePaneState } from '../store/PaneContext';
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { createVaultExtensions } from '../editor/vaultExtensions';
import { SourceDocument } from '../editor/sourceDocument';
import { api } from '../api/client';
import { useVaultStore } from '../store/useVaultStore';
import { parseFrontmatter } from '../utils/markdownConverter';
import {
  Sparkles,
  Undo,
  Redo,
  Eraser,
  Heading1,
  Heading2,
  Heading3,
  Bold,
  Italic,
  Strikethrough,
  Underline as UnderlineIcon,
  Code,
  Highlighter,
  Quote,
  SquareCode,
  CheckSquare,
  List,
  ListOrdered,
  Table as TableIcon,
  Minus,
  Link as LinkIcon,
  Image as ImageIcon,
  X,
  Upload,
} from 'lucide-react';

interface Props {
  content: string;
  path: string;
  onToggleBacklinks?: () => void;
  backlinksOpen?: boolean;
  readOnly?: boolean;
}


export const LiveView: React.FC<Props> = ({ content, path, readOnly = false }) => {
  const { queueNoteSave, performSearch, setSearchOpen, setNoteMode, navigateToLink } = usePaneState();
  const [requiresSource, setRequiresSource] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [uploadToast, setUploadToast] = useState<string | null>(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkInput, setLinkInput] = useState('');

  const sourceRef = useRef<SourceDocument | null>(null);
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Extract YAML frontmatter if present
  const { frontmatter, frontmatterHeader, markdownBody, error: frontmatterError } = useMemo(() => {
    return parseFrontmatter(content);
  }, [content]);

  // Convert Obsidian Wikilink images and resources ![[image.ext]] into Markdown ![image.ext](<image.ext>) for TipTap
  const preprocessedBody = useMemo(() => {
    return markdownBody;
  }, [markdownBody]);

  // Upload an image file to the vault backend and insert it into TipTap
  const uploadAndInsertImage = useCallback(async (file: File) => {
    try {
      setUploadToast('Guardando imagen en la bóveda...');
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const now = new Date();
        const dateStr =
          now.getFullYear().toString() +
          String(now.getMonth() + 1).padStart(2, '0') +
          String(now.getDate()).padStart(2, '0') +
          String(now.getHours()).padStart(2, '0') +
          String(now.getMinutes()).padStart(2, '0') +
          String(now.getSeconds()).padStart(2, '0');

        let ext = file.name.split('.').pop() || 'png';
        if (ext === 'blob' || !ext) ext = 'png';
        const filename = `Pasted image ${dateStr}-${crypto.randomUUID()}.${ext}`;

        try {
          await api.saveAsset(filename, base64);
          editorRef.current?.chain().focus().setImage({ src: filename, alt: filename }).run();
          setUploadToast('Imagen guardada en la bóveda');
        } catch (e) {
          setUploadToast(`No se guardó la imagen: ${e instanceof Error ? e.message : String(e)}`);
        }
        setTimeout(() => setUploadToast(null), 3000);
      };
      reader.readAsDataURL(file);
    } catch (e) {
      console.error('Error procesando imagen pegada:', e);
      setUploadToast(null);
    }
  }, []);

  // Initialize TipTap Editor in full Obsidian Live mode
  const editor = useEditor({
    editable: !readOnly,
    extensions: createVaultExtensions(path, readOnly),
    content: preprocessedBody,
    editorProps: {
      attributes: {
        class: 'markdown-body max-w-4xl mx-auto focus:outline-none min-h-[600px] text-obsidian-text select-text pb-32 leading-relaxed',
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;

        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            if (file) {
              uploadAndInsertImage(file);
              return true;
            }
          }
        }
        return false;
      },
      handleDrop: (view, event, slice, moved) => {
        if (!moved && event.dataTransfer?.files?.length) {
          const file = event.dataTransfer.files[0];
          if (file && file.type.startsWith('image/')) {
            event.preventDefault();
            uploadAndInsertImage(file);
            return true;
          }
        }
        return false;
      },
    },
    onCreate: ({ editor }) => {
      try {
        if (frontmatterError) throw new Error(frontmatterError);
        sourceRef.current = new SourceDocument(editor, markdownBody);
        sourceRef.current.prepare();
      } catch {
        editor.setEditable(false); setRequiresSource(true);
      }
    },
    onUpdate: ({ editor }) => {
      numberFootnotes(editor.view.dom);
      if (readOnly || !editor.isEditable || !sourceRef.current) return;
      queueNoteSave(`${parseFrontmatter(useVaultStore.getState().drafts[path] ?? useVaultStore.getState().documents[path]?.content ?? content).frontmatterHeader}${sourceRef.current.serialize()}`, path, 600);
    },
  });

  editorRef.current = editor;

  // Other panes share the same document. Do not overwrite their changes with a stale editor snapshot.
  useEffect(() => {
    if (!editor || !sourceRef.current || sourceRef.current.serialize() === markdownBody) return;
    try {
      const selection = editor.state.selection.anchor;
      sourceRef.current = new SourceDocument(editor, markdownBody); sourceRef.current.prepare();
      if (!readOnly) editor.commands.setTextSelection(Math.min(selection, editor.state.doc.content.size));
    } catch { setRequiresSource(true); }
  }, [editor, readOnly, markdownBody]);

  // Handle image lightbox clicks inside the Live editor
  const handleContainerClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const footnote = target.closest<HTMLElement>('[data-footnote-target], [data-footnote-return]');
    if (footnote) {
      e.preventDefault(); e.stopPropagation();
      const returning = footnote.hasAttribute('data-footnote-return');
      const label = footnote.dataset.footnoteTarget || footnote.dataset.footnoteReturn;
      const scope = target.closest('.vault-note-preview') || target.closest('.tiptap') || containerRef.current;
      const attribute = returning ? 'data-footnote-reference' : 'data-footnote-definition';
      const destination = Array.from(scope?.querySelectorAll<HTMLElement>(`[${attribute}]`) || []).find((element) => element.getAttribute(attribute) === label);
      destination?.scrollIntoView?.({ block: 'center' });
      if (destination) { destination.tabIndex = -1; destination.focus({ preventScroll: true }); }
      return;
    }
    const reference = target.closest<HTMLElement>('[data-vault-ref]');
    if (reference && !target.closest('audio, video, img, a') && !reference.querySelector('.vault-note-preview')?.contains(target)) {
      e.preventDefault();
      void navigateToLink(reference.dataset.target || '', reference.dataset.source || path);
      return;
    }
    const link = target.closest<HTMLAnchorElement>('a[href]');
    if (link) {
      const href = link.getAttribute('href') || '';
      if (!/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) {
        e.preventDefault();
        let decoded = href;
        try { decoded = decodeURIComponent(href); } catch { /* Literal % in file names. */ }
        void navigateToLink(decoded, link.dataset.source || path);
        return;
      }
    }
    const imgEl = target.closest('img.obsidian-image') as HTMLImageElement | null;
    if (imgEl) {
      e.preventDefault();
      setLightboxSrc(imgEl.src);
    }
  };

  // Trigger file input for image upload
  const triggerImageUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      uploadAndInsertImage(files[0]);
    }
    // reset input so same file can be picked again
    e.target.value = '';
  };

  // Helper actions for toolbar (Electron-safe without window.prompt)
  const addLink = () => {
    const previousUrl = editor?.getAttributes('link').href || '';
    setLinkInput(previousUrl);
    setLinkModalOpen(true);
  };

  const applyLink = (e: React.FormEvent) => {
    e.preventDefault();
    setLinkModalOpen(false);
    const url = linkInput.trim();
    if (url === '') {
      editor?.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  if (!editor) return null;

  return (
    <div
      ref={containerRef}
      className="h-full w-full flex flex-col bg-obsidian-bg overflow-hidden relative select-text"
    >
      {requiresSource && <div role="status" className="px-4 py-3 text-sm text-amber-200 bg-amber-950/50">
        No se pudo cargar la edición de esta nota.
      </div>}
      {/* Hidden file input for uploading images */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {uploadToast && <div role="status" className="px-4 py-2 text-xs text-jade-300">{uploadToast}</div>}

      {linkModalOpen && (
        <form
          onSubmit={applyLink}
          className="px-4 py-2 bg-obsidian-card border-b border-obsidian-border flex items-center gap-2 text-xs z-20"
        >
          <LinkIcon size={13} className="text-jade-400 shrink-0" />
          <input
            type="text"
            autoFocus
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value)}
            placeholder="Introduce URL o ruta de enlace (deja vacío para quitar)..."
            className="flex-1 bg-obsidian-bg border border-obsidian-border rounded px-2.5 py-1 text-obsidian-text focus:outline-none focus:border-jade-500"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setLinkModalOpen(false);
              }
            }}
          />
          <button type="submit" className="px-2.5 py-1 bg-jade-600 hover:bg-jade-500 text-white rounded font-medium">
            Aplicar
          </button>
          <button
            type="button"
            onClick={() => setLinkModalOpen(false)}
            className="px-2 py-1 text-obsidian-muted hover:text-white"
          >
            Cancelar
          </button>
        </form>
      )}

      {/* Rich Formatting Toolbar (Matching User Screenshot Layout) */}
      <div className={`${readOnly || requiresSource ? 'hidden' : ''} workspace-format h-11 px-3 border-b border-obsidian-border bg-obsidian-bg/95 flex items-center gap-1 overflow-x-auto select-none flex-shrink-0 z-10 text-obsidian-muted`}>
        {/* AI Action */}
        <button
          onClick={() => {
            const selectedText = editor.state.doc.textBetween(
              editor.state.selection.from,
              editor.state.selection.to,
              ' '
            );
            if (selectedText) {
              performSearch(selectedText);
              setSearchOpen(true);
            }
          }}
          className="flex items-center gap-1 px-2 py-1 rounded bg-jade-950/60 border border-jade-700/50 text-jade-300 hover:bg-jade-900 transition text-[13px] font-semibold mr-1 shadow-xs"
          title="Asistente de Bóveda y Búsqueda"
        >
          <Sparkles size={12} className="text-jade-400" />
          <span>Buscar selección</span>
        </button>

        <div className="w-[1px] h-4 bg-obsidian-border mx-1 flex-shrink-0" />

        <button title="Insertar nota al pie" className="px-2 text-[13px] text-jade-300" onClick={() => {
          const label = `nota-${crypto.randomUUID().slice(0, 8)}`;
          editor.chain().focus().insertContent({ type: 'footnoteReference', attrs: { raw: `[^${label}]`, label } }).command(({ tr }) => {
            tr.insert(tr.doc.content.size, editor.schema.nodes.advancedBlock.create({ kind: 'footnote', label, raw: `[^${label}]: Escribe la nota al pie.` })); return true;
          }).run(); numberFootnotes(editor.view.dom);
        }}>Nota al pie</button>
        <div aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-obsidian-border" />
        {/* History: Undo / Redo */}
        <button
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className="p-1.5 hover:text-white hover:bg-obsidian-hover disabled:opacity-30 rounded transition"
          title="Deshacer (Ctrl+Z)"
        >
          <Undo size={14} />
        </button>
        <button
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className="p-1.5 hover:text-white hover:bg-obsidian-hover disabled:opacity-30 rounded transition"
          title="Rehacer (Ctrl+Y)"
        >
          <Redo size={14} />
        </button>
        <button
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
          className="p-1.5 hover:text-white hover:bg-obsidian-hover rounded transition"
          title="Limpiar formato"
        >
          <Eraser size={14} />
        </button>

        <div className="w-[1px] h-4 bg-obsidian-border mx-1 flex-shrink-0" />

        {/* Headings */}
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={`px-2 py-0.5 rounded text-xs font-bold transition ${
            editor.isActive('heading', { level: 1 })
              ? 'bg-jade-600 text-white'
              : 'hover:text-white hover:bg-obsidian-hover text-[#4ade80]'
          }`}
          title="Título H1"
        >
          H1
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`px-2 py-0.5 rounded text-xs font-bold transition ${
            editor.isActive('heading', { level: 2 })
              ? 'bg-jade-600 text-white'
              : 'hover:text-white hover:bg-obsidian-hover text-[#38bdf8]'
          }`}
          title="Título H2"
        >
          H2
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={`px-2 py-0.5 rounded text-xs font-bold transition ${
            editor.isActive('heading', { level: 3 })
              ? 'bg-jade-600 text-white'
              : 'hover:text-white hover:bg-obsidian-hover text-[#a78bfa]'
          }`}
          title="Título H3"
        >
          H3
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
          className={`px-2 py-0.5 rounded text-xs font-bold transition ${
            editor.isActive('heading', { level: 4 })
              ? 'bg-jade-600 text-white'
              : 'hover:text-white hover:bg-obsidian-hover text-amber-400'
          }`}
          title="Título H4 (Hn)"
        >
          Hn
        </button>

        <div className="w-[1px] h-4 bg-obsidian-border mx-1 flex-shrink-0" />

        {/* Text Formats */}
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`p-1.5 rounded transition ${
            editor.isActive('bold') ? 'bg-jade-600 text-white' : 'hover:text-white hover:bg-obsidian-hover'
          }`}
          title="Negrita (Ctrl+B)"
        >
          <Bold size={14} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`p-1.5 rounded transition ${
            editor.isActive('italic') ? 'bg-jade-600 text-white' : 'hover:text-white hover:bg-obsidian-hover'
          }`}
          title="Cursiva (Ctrl+I)"
        >
          <Italic size={14} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={`p-1.5 rounded transition ${
            editor.isActive('strike') ? 'bg-jade-600 text-white' : 'hover:text-white hover:bg-obsidian-hover'
          }`}
          title="Tachado"
        >
          <Strikethrough size={14} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`p-1.5 rounded transition ${
            editor.isActive('underline') ? 'bg-jade-600 text-white' : 'hover:text-white hover:bg-obsidian-hover'
          }`}
          title="Subrayado (Ctrl+U)"
        >
          <UnderlineIcon size={14} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleCode().run()}
          className={`p-1.5 rounded transition ${
            editor.isActive('code') ? 'bg-jade-600 text-white' : 'hover:text-white hover:bg-obsidian-hover text-pink-400'
          }`}
          title="Código en línea (` `)"
        >
          <Code size={14} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          className={`p-1.5 rounded transition ${
            editor.isActive('highlight') ? 'bg-amber-500 text-zinc-900 font-bold' : 'hover:text-white hover:bg-obsidian-hover text-amber-300'
          }`}
          title="Resaltar texto (Marcador)"
        >
          <Highlighter size={14} />
        </button>

        <div className="w-[1px] h-4 bg-obsidian-border mx-1 flex-shrink-0" />

        {/* Blocks & Lists */}
        <button
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={`p-1.5 rounded transition ${
            editor.isActive('blockquote') ? 'bg-jade-600 text-white' : 'hover:text-white hover:bg-obsidian-hover text-jade-400'
          }`}
          title="Cita o Cuadro destacado (> )"
        >
          <Quote size={14} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={`p-1.5 rounded transition ${
            editor.isActive('codeBlock') ? 'bg-jade-600 text-white' : 'hover:text-white hover:bg-obsidian-hover text-emerald-400'
          }`}
          title="Bloque de código / Terminal (```)"
        >
          <SquareCode size={14} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          className={`p-1.5 rounded transition ${
            editor.isActive('taskList') ? 'bg-jade-600 text-white' : 'hover:text-white hover:bg-obsidian-hover text-teal-400'
          }`}
          title="Casilla de verificación / Tarea (- [ ])"
        >
          <CheckSquare size={14} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`p-1.5 rounded transition ${
            editor.isActive('bulletList') ? 'bg-jade-600 text-white' : 'hover:text-white hover:bg-obsidian-hover'
          }`}
          title="Lista con viñetas (- )"
        >
          <List size={14} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`p-1.5 rounded transition ${
            editor.isActive('orderedList') ? 'bg-jade-600 text-white' : 'hover:text-white hover:bg-obsidian-hover'
          }`}
          title="Lista numerada (1. )"
        >
          <ListOrdered size={14} />
        </button>

        <div className="w-[1px] h-4 bg-obsidian-border mx-1 flex-shrink-0" />

        {/* Media & Inserts */}
        <button
          onClick={addLink}
          className={`p-1.5 rounded transition ${
            editor.isActive('link') ? 'bg-jade-600 text-white' : 'hover:text-white hover:bg-obsidian-hover text-purple-400'
          }`}
          title="Insertar Enlace"
        >
          <LinkIcon size={14} />
        </button>
        <button
          onClick={triggerImageUpload}
          className="p-1.5 hover:text-white hover:bg-obsidian-hover rounded transition text-sky-400"
          title="Pegar o Subir Imagen (o presiona Ctrl+V)"
        >
          <ImageIcon size={14} />
        </button>
        <button
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          className="p-1.5 hover:text-white hover:bg-obsidian-hover rounded transition"
          title="Insertar Tabla"
        >
          <TableIcon size={14} />
        </button>
        <button
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          className="p-1.5 hover:text-white hover:bg-obsidian-hover rounded transition"
          title="Línea divisoria (---)"
        >
          <Minus size={14} />
        </button>
      </div>

      {/* Scrollable Live Document Container */}
      <div
        onClick={handleContainerClick}
        className="flex-1 w-full overflow-y-auto p-8 md:px-16 lg:px-24 select-text"
      >
        <div className="max-w-4xl mx-auto">
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Obsidian Style Image Lightbox Modal */}
      {lightboxSrc && (
        <div
          onClick={() => setLightboxSrc(null)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-200 cursor-zoom-out"
        >
          <div className="relative max-w-5xl max-h-[90vh] flex flex-col items-center justify-center">
            <button
              onClick={() => setLightboxSrc(null)}
              className="absolute -top-10 right-0 p-1.5 text-white/70 hover:text-white bg-black/40 rounded-full"
              title="Cerrar"
            >
              <X size={20} />
            </button>
            <img
              src={lightboxSrc}
              alt="Vista ampliada"
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl border border-white/10"
            />
          </div>
        </div>
      )}
    </div>
  );
};
