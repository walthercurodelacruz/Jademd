import React, { useEffect, useState } from 'react';
import { useVaultStore } from '../store/useVaultStore';
import { FilePlus, FolderPlus, LayoutGrid, Palette, Database } from 'lucide-react';

export function CreateEntryModal() {
  const { createModal, closeCreateModal, createNewFolder, createNewNote, isLoading } = useVaultStore();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (createModal?.isOpen) {
      setName('');
      setError('');
      setSubmitting(false);
    }
  }, [createModal?.isOpen, createModal?.type, createModal?.targetFolder]);

  useEffect(() => {
    if (!createModal?.isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        closeCreateModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [createModal?.isOpen, submitting, closeCreateModal]);

  if (!createModal?.isOpen) return null;

  const type = createModal.type;
  const targetFolder = createModal.targetFolder
    ? createModal.targetFolder.trim().replace(/^[\/\\]+|[\/\\]+$/g, '')
    : '';

  const modalTitle =
    type === 'folder'
      ? 'Nueva carpeta'
      : type === 'canvas'
      ? 'Nuevo lienzo Canvas'
      : type === 'excalidraw'
      ? 'Nuevo dibujo Excalidraw'
      : type === 'base'
      ? 'Nueva base de datos'
      : 'Nueva nota';

  const placeholder =
    type === 'folder'
      ? 'ej: Documentación'
      : type === 'canvas'
      ? 'ej: Mapa Mental'
      : type === 'excalidraw'
      ? 'ej: Diagrama de Red'
      : type === 'base'
      ? 'ej: Proyectos'
      : 'ej: Mi Nota';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || isLoading) return;

    const raw = name.trim();
    if (!raw) {
      setError('El nombre no puede estar vacío');
      return;
    }

    if (/[\\:*?"<>|]/.test(raw)) {
      setError('El nombre contiene caracteres inválidos: \\ : * ? " < > |');
      return;
    }

    const cleanName = raw.replace(/^[\/\\]+|[\/\\]+$/g, '');
    if (!cleanName) {
      setError('El nombre ingresado es inválido');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      if (type === 'folder') {
        const fullPath = targetFolder ? `${targetFolder}/${cleanName}` : cleanName;
        // Expand the target folder and the new folder so they are visible in the file tree
        if (targetFolder) {
          window.dispatchEvent(
            new CustomEvent('jademd:expand-folder', { detail: { path: targetFolder } })
          );
        }
        window.dispatchEvent(
          new CustomEvent('jademd:expand-folder', { detail: { path: fullPath } })
        );
        await createNewFolder(fullPath);
      } else {
        let finalName = cleanName;
        if (type === 'note') {
          if (!finalName.toLowerCase().endsWith('.md')) {
            finalName = `${finalName}.md`;
          }
        } else if (type === 'canvas') {
          if (!finalName.toLowerCase().endsWith('.canvas')) {
            finalName = `${finalName}.canvas`;
          }
        } else if (type === 'excalidraw') {
          if (
            !finalName.toLowerCase().endsWith('.excalidraw.md') &&
            !finalName.toLowerCase().endsWith('.excalidraw')
          ) {
            finalName = `${finalName}.excalidraw.md`;
          }
        } else if (type === 'base') {
          if (!finalName.toLowerCase().endsWith('.base')) {
            finalName = `${finalName}.base`;
          }
        }

        const fullPath = targetFolder ? `${targetFolder}/${finalName}` : finalName;
        if (targetFolder) {
          window.dispatchEvent(
            new CustomEvent('jademd:expand-folder', { detail: { path: targetFolder } })
          );
        }
        await createNewNote(fullPath);
      }

      closeCreateModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-xs flex items-center justify-center p-6 animate-in fade-in duration-100"
      onClick={() => {
        if (!submitting) closeCreateModal();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={modalTitle}
        className="w-full max-w-md rounded-xl bg-obsidian-card border border-obsidian-border p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <div className="flex items-center gap-2 mb-2 text-jade-400 font-semibold text-base">
            {type === 'folder' ? (
              <FolderPlus size={18} />
            ) : type === 'canvas' ? (
              <LayoutGrid size={18} className="text-emerald-400" />
            ) : type === 'excalidraw' ? (
              <Palette size={18} className="text-purple-400" />
            ) : type === 'base' ? (
              <Database size={18} className="text-sky-400" />
            ) : (
              <FilePlus size={18} />
            )}
            <h2>{modalTitle}</h2>
          </div>

          <p className="text-xs text-obsidian-muted mb-4">
            {targetFolder
              ? `Ubicación: /${targetFolder}`
              : 'Ubicación: Raíz de la bóveda'}
          </p>

          <label className="block text-xs font-medium text-obsidian-muted mb-1">
            Nombre:
            <input
              autoFocus
              aria-label="Nombre del nuevo elemento"
              className="w-full mt-1.5 rounded border border-obsidian-border bg-obsidian-bg p-2 text-sm text-obsidian-text focus:outline-none focus:border-jade-500 focus:ring-1 focus:ring-jade-500/50"
              placeholder={placeholder}
              value={name}
              onChange={(e) => {
                setError('');
                setName(e.target.value);
              }}
              disabled={submitting}
            />
          </label>

          {error && (
            <p role="alert" className="text-xs text-rose-300 mt-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 mt-5">
            <button
              type="button"
              className="px-3 py-1.5 text-xs text-obsidian-muted hover:text-obsidian-text hover:bg-obsidian-hover rounded transition"
              onClick={closeCreateModal}
              disabled={submitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!name.trim() || submitting || isLoading}
              className="bg-jade-600 hover:bg-jade-500 text-white px-4 py-1.5 text-xs rounded font-medium disabled:opacity-40 transition shadow-sm"
            >
              {submitting ? 'Creando…' : 'Crear'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
