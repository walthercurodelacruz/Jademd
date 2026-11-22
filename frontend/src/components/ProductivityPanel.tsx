import React, { useEffect, useState } from 'react';
import { useProductivityStore } from '../store/useProductivityStore';
import { useVaultStore } from '../store/useVaultStore';
import { bindings, COMMANDS, displayShortcut, shortcutFromEvent } from '../utils/commands';
import { localDate, markdownFiles } from '../utils/productivity';
import { insertTemplate, openDailyNote } from '../utils/productivityActions';
import { api } from '../api/client';

export function ProductivityPanel() {
  const tools = useProductivityStore();
  const vault = useVaultStore();
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(localDate());
  const [folder, setFolder] = useState(''); const [template, setTemplate] = useState(''); const [templateFolder, setTemplateFolder] = useState('');
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]); const [filter, setFilter] = useState('');
  useEffect(() => { tools.activate(vault.vault?.id || null); }, [vault.vault?.id]);
  useEffect(() => {
    if (tools.open) { setFolder(tools.settings.dailyFolder); setTemplate(tools.settings.dailyTemplate); setTemplateFolder(tools.settings.templateFolder); setError(''); setFilter(''); }
  }, [tools.open, tools.vaultId]);
  useEffect(() => {
    let disposed = false;
    if (tools.open && tools.tab === 'tags') { setTags([]); void api.tags().then((tags) => { if (!disposed) setTags(tags); }).catch((error) => { if (!disposed) setError(error instanceof Error ? error.message : String(error)); }); }
    return () => { disposed = true; };
  }, [tools.open, tools.tab, vault.vault?.id, vault.graphData]);
  const run = async (action: () => void | Promise<void>, close = false) => {
    setError(''); setBusy(true);
    try { await action(); if (close) tools.close(); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  if (!tools.open) return null;
  const templates = markdownFiles(vault.tree).filter((path) => !tools.settings.templateFolder || path.startsWith(`${tools.settings.templateFolder}/`));
  const inputClass = 'bg-obsidian-bg border border-obsidian-border rounded p-2 w-full mt-1';
  return <div className="fixed inset-0 z-[85] bg-black/60 flex items-center justify-center p-4" onClick={() => { if (!busy) tools.close(); }}>
    <section role="dialog" aria-modal="true" aria-label="Productividad" className="bg-obsidian-card border border-obsidian-border rounded-xl p-5 w-full max-w-3xl max-h-[90vh] overflow-auto" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Escape' && !busy && !(event.target as HTMLElement).closest('[data-shortcut-capture]')) tools.close(); }}>
      <div className="flex items-center justify-between border-b border-obsidian-border pb-3"><h2 className="font-semibold text-base text-obsidian-text">Productividad</h2><button disabled={busy} onClick={tools.close} className="px-2.5 py-1 rounded text-xs text-obsidian-muted hover:text-white hover:bg-obsidian-hover transition">Cerrar</button></div>
      <nav className="flex flex-wrap gap-2 my-4 text-sm" aria-label="Herramientas de productividad">{([['daily', 'Notas diarias'], ['templates', 'Plantillas'], ['bookmarks', 'Marcadores'], ['tags', 'Etiquetas'], ['shortcuts', 'Atajos']] as const).map(([tab, label]) => <button key={tab} aria-pressed={tools.tab === tab} onClick={() => { tools.show(tab); setError(''); }} className={`rounded-lg px-3 py-1.5 font-medium transition border ${tools.tab === tab ? 'bg-jade-800/90 text-white border-jade-600/50 shadow-sm' : 'bg-obsidian-bg text-obsidian-muted hover:text-white border-obsidian-border/60'}`}>{label}</button>)}</nav>
      {!vault.vault ? <p>Abre una bóveda para usar estas herramientas.</p> : <fieldset disabled={busy || vault.isLoading} className="space-y-3 text-sm">
        {tools.tab === 'daily' && <>
          <label className="block">Fecha<input aria-label="Fecha de la nota diaria" type="date" value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} /></label>
          <button className="bg-jade-700 rounded p-2" onClick={() => void run(async () => { tools.update({ dailyFolder: folder.trim(), dailyTemplate: template.trim() }); await openDailyNote(date); }, true)}>Abrir o crear nota diaria</button>
          <form className="border-t border-obsidian-border pt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); void run(() => tools.update({ dailyFolder: folder.trim(), dailyTemplate: template.trim() })); }}>
            <label className="block">Carpeta de notas diarias<input aria-label="Carpeta de notas diarias" value={folder} onChange={(event) => setFolder(event.target.value)} className={inputClass} /></label>
            <label className="block">Ruta de plantilla diaria (opcional)<input aria-label="Plantilla diaria" placeholder="Plantillas/Diario.md" value={template} onChange={(event) => setTemplate(event.target.value)} className={inputClass} /></label>
            <p className="text-xs text-obsidian-muted">Se usa la fecha local y el nombre AAAA-MM-DD.md. La plantilla solo se aplica al crear. Variables: {'{{date}}'}, {'{{time}}'}, {'{{title}}'}.</p>
            <button className="underline" type="submit">Guardar configuración diaria</button>
          </form>
        </>}
        {tools.tab === 'templates' && <>
          <form onSubmit={(event) => { event.preventDefault(); void run(() => tools.update({ templateFolder: templateFolder.trim() })); }}><label className="block">Carpeta de plantillas<input aria-label="Carpeta de plantillas" value={templateFolder} onChange={(event) => setTemplateFolder(event.target.value)} className={inputClass} /></label><button className="underline mt-2">Guardar carpeta</button></form>
          <p className="text-xs text-obsidian-muted">Crea notas Markdown en esa carpeta. Al insertar, se añade el cuerpo al final de la nota activa, conservando sus propiedades. Variables: {'{{date}}'}, {'{{time}}'}, {'{{title}}'}.</p>
          {templates.map((path) => <button key={path} className="block text-left w-full p-2 bg-obsidian-bg rounded text-jade-300" onClick={() => void run(() => insertTemplate(path), true)}>Insertar {path}</button>)}
          {!templates.length && <p className="text-obsidian-muted">No hay plantillas en esta carpeta.</p>}
        </>}
        {tools.tab === 'bookmarks' && <>
          {vault.activePath && <button className="underline" onClick={() => void run(() => tools.toggleBookmark(vault.activePath!))}>{tools.settings.bookmarks.includes(vault.activePath) ? 'Quitar marcador del documento actual' : 'Marcar documento actual'}</button>}
          {tools.settings.bookmarks.map((path) => <div key={path} className="flex items-center gap-3 bg-obsidian-bg rounded p-2"><button className="flex-1 text-left text-jade-300 break-all" onClick={() => void run(() => vault.openNote(path), true)}>{path}</button><button aria-label={`Quitar marcador ${path}`} onClick={() => void run(() => tools.toggleBookmark(path))}>Quitar</button></div>)}
          {!tools.settings.bookmarks.length && <p className="text-obsidian-muted">No tienes documentos marcados.</p>}
        </>}
        {tools.tab === 'tags' && <>
          <input aria-label="Filtrar etiquetas" placeholder="Filtrar etiquetas…" value={filter} onChange={(event) => setFilter(event.target.value)} className={inputClass} />
          <p className="text-xs text-obsidian-muted">Cantidad de notas por etiqueta. Una etiqueta superior incluye sus descendientes.</p>
          <div className="divide-y divide-obsidian-border/60">
            {tags.filter(({ tag }) => tag.toLowerCase().includes(filter.toLowerCase())).map(({ tag, count }) => <button key={tag} style={{ paddingLeft: `${10 + (tag.split('/').length - 1) * 14}px` }} className="flex items-center justify-between w-full text-left py-2 pr-2 rounded hover:bg-obsidian-hover text-jade-300 transition" onClick={() => void run(async () => { await vault.performSearch(`tag:"${tag.replaceAll('"', '')}"`); vault.setSearchOpen(true); }, true)}><span className="font-mono text-xs">#{tag}</span><span className="px-2 py-0.5 rounded-full bg-obsidian-bg border border-obsidian-border text-xs text-obsidian-text font-mono">{count}</span></button>)}
          </div>
          {!tags.length && <p className="text-obsidian-muted">No hay etiquetas en el índice.</p>}
        </>}
        {tools.tab === 'shortcuts' && <>
          <p className="text-xs text-obsidian-muted">Pulsa una combinación para asignarla. Ctrl en Linux/Windows y ⌘ en macOS. Los atajos básicos del editor se conservan. No se ejecutan comandos de documentos mientras un diálogo está abierto.</p>
          {COMMANDS.map((command) => <div key={command.id} className="flex flex-wrap items-center gap-2 border-b border-obsidian-border py-2"><span className="flex-1 min-w-40">{command.label}</span><input data-shortcut-capture aria-label={`Atajo: ${command.label}`} readOnly value={bindings(command.id, tools.settings.shortcuts).map(displayShortcut).join(' / ')} placeholder="Pulsa un atajo" className="bg-obsidian-bg p-2 rounded w-56 text-xs" onKeyDown={(event) => { event.preventDefault(); event.stopPropagation(); if (event.key === 'Escape') { event.currentTarget.blur(); return; } const key = shortcutFromEvent(event.nativeEvent); if (key) void run(() => tools.assignShortcut(command.id, key)); }} /><button className="text-xs underline" onClick={() => void run(() => tools.assignShortcut(command.id, null))}>Desactivar</button></div>)}
          <button className="underline" onClick={() => void run(() => tools.update({ shortcuts: {} }))}>Restablecer todos los atajos</button>
        </>}
      </fieldset>}
      {busy && <p role="status" className="text-xs my-3">Procesando…</p>}
      {error && <p role="alert" className="text-sm text-rose-300 my-3">{error}</p>}
    </section>
  </div>;
}
