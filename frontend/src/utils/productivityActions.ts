import { api } from '../api/client';
import { useVaultStore } from '../store/useVaultStore';
import { useProductivityStore } from '../store/useProductivityStore';
import { expandTemplate, localDate, validVaultPath } from './productivity';
import { parseFrontmatter } from './frontmatter';

let dailyTask: Promise<void> | null = null;
export function openDailyNote(date = localDate()): Promise<void> {
  if (dailyTask) return dailyTask;
  const task = async () => {
    const state = useVaultStore.getState();
    if (!state.vault || state.isLoading) throw new Error('Espera a que termine la operación actual de la bóveda');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || localDate(new Date(`${date}T12:00:00`)) !== date) throw new Error('Fecha inválida');
    useProductivityStore.getState().activate(state.vault.id);
    const { dailyFolder, dailyTemplate } = useProductivityStore.getState().settings;
    const path = `${dailyFolder ? `${dailyFolder}/` : ''}${date}.md`;
    if (!validVaultPath(path)) throw new Error('Ruta diaria inválida');
    useVaultStore.setState({ isLoading: true });
    try {
      await state.flushPendingSaves();
      let exists = true;
      try { await api.readNote(path); } catch (error) { if ((error as { status?: number }).status !== 404) throw error; exists = false; }
      if (!exists) {
        const source = dailyTemplate ? await api.readNote(dailyTemplate) : '# {{date}}\n\n';
        const content = expandTemplate(source, date, new Date(), date);
        try { await api.createNote(path, content); }
        catch (error) { if ((error as { status?: number }).status !== 409) throw error; /* Another client created it; open its version. */ }
        await Promise.all([state.loadTree(), state.loadGraph()]);
      }
      useVaultStore.setState((current) => { const documents = { ...current.documents }; delete documents[path]; return { documents, isLoading: false }; });
      await useVaultStore.getState().openNote(path, state.activePaneId);
    } finally { useVaultStore.setState({ isLoading: false }); }
  };
  dailyTask = task().finally(() => { dailyTask = null; });
  return dailyTask;
}

export async function insertTemplate(templatePath: string): Promise<void> {
  const state = useVaultStore.getState(); const path = state.activePath; const vaultId = state.vault?.id;
  if (!path || !path.endsWith('.md') || state.knownExcalidrawNotes[path] || state.documents[path]?.loadState !== 'ready' || state.isLoading) throw new Error('Abre una nota Markdown editable');
  if (state.noteMode === 'reading') throw new Error('Activa un modo de edición para insertar una plantilla');
  if (!validVaultPath(templatePath) || !templatePath.endsWith('.md') || templatePath.endsWith('.excalidraw.md') || templatePath === path) throw new Error('Selecciona otra nota Markdown como plantilla');
  const source = await api.readNote(templatePath);
  const parsed = parseFrontmatter(source);
  if (parsed.error) throw new Error('La plantilla tiene propiedades YAML inválidas');
  const current = useVaultStore.getState();
  if (current.vault?.id !== vaultId || current.isLoading || current.documents[path]?.loadState !== 'ready' || current.noteModes[path] === 'reading' || !current.panes.some((pane) => pane.tabs.includes(path))) throw new Error('La nota o bóveda cambió durante la carga');
  const latest = current.drafts[path] ?? current.documents[path]?.content ?? '';
  const title = path.split('/').at(-1)!.replace(/\.md$/, '');
  const body = expandTemplate(parsed.markdownBody, title);
  if (!body) throw new Error('La plantilla no tiene contenido para insertar');
  const newline = latest.includes('\r\n') ? '\r\n' : '\n';
  const trailing = (latest.match(/(?:\r?\n)+$/)?.[0].match(/\n/g) || []).length;
  // Preserve the note and its properties; templates append only their expanded body.
  current.queueNoteSave(latest + (latest ? newline.repeat(Math.max(0, 2 - trailing)) : '') + body.replace(/\r?\n/g, newline), path);
}
