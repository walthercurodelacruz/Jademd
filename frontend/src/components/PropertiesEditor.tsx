import React, { useState } from 'react';
import { parseFrontmatter, PropertyValue, updateProperty } from '../utils/frontmatter';
import { useVaultStore } from '../store/useVaultStore';

function PropertyRow({ name, value, readOnly, commit }: {
  name: string; value: PropertyValue; readOnly: boolean; commit: (name: string, value: PropertyValue) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');
  const [type, setType] = useState('text');
  const [error, setError] = useState('');
  const begin = () => {
    setType(typeof value === 'string' ? 'text' : typeof value === 'boolean' ? 'checkbox' : typeof value === 'number' ? 'number' : 'json');
    setInput(typeof value === 'string' ? value : JSON.stringify(value));
    setError(''); setEditing(true);
  };
  const save = () => {
    try {
      const next: PropertyValue = type === 'text' ? input : type === 'checkbox' ? input === 'true' : JSON.parse(input);
      if (type === 'number' && (typeof next !== 'number' || !Number.isFinite(next))) throw new Error('Introduce un número válido.');
      commit(name, next); setEditing(false);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  return <div className="py-2 border-b border-obsidian-border/50">
    <div className="flex items-start justify-between gap-3">
      <span className="font-mono text-obsidian-muted break-all">{name}</span>
      {!editing && <span className="break-words whitespace-pre-wrap text-right">{typeof value === 'string' ? value : JSON.stringify(value)}</span>}
      {!readOnly && !editing && <button className="text-jade-300 underline" aria-label={`Editar ${name}`} onClick={begin}>Editar</button>}
    </div>
    {editing && <div className="mt-2 space-y-2">
      <select aria-label={`Tipo de ${name}`} className="bg-obsidian-bg" value={type} onChange={(e) => setType(e.target.value)}>
        <option value="text">Texto / fecha</option><option value="number">Número</option><option value="checkbox">Casilla</option><option value="json">Lista / estructura JSON</option>
      </select>
      {type === 'checkbox' ? <input aria-label={`Valor de ${name}`} type="checkbox" checked={input === 'true'} onChange={(e) => setInput(String(e.target.checked))} /> :
        <textarea aria-label={`Valor de ${name}`} className="w-full p-2 bg-obsidian-bg rounded font-mono" value={input} onChange={(e) => setInput(e.target.value)} />}
      {error && <p role="alert" className="text-rose-300">{error}</p>}
      <div className="flex gap-3"><button className="text-jade-300" onClick={save}>Aplicar</button><button onClick={() => setEditing(false)}>Cancelar</button></div>
    </div>}
  </div>;
}

export function PropertiesEditor({ content, path, readOnly = false }: { content: string; path: string; readOnly?: boolean }) {
  const parsed = parseFrontmatter(content);
  const [collapsed, setCollapsed] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const commit = (name: string, value: PropertyValue) => {
    const current = useVaultStore.getState();
    if (!current.panes.some((pane) => pane.tabs.includes(path)) || current.documents[path]?.loadState !== 'ready') throw new Error('El documento activo cambió.');
    const next = updateProperty(current.drafts[path] ?? current.documents[path].content, name, value);
    current.queueNoteSave(next, path, 0);
    setError('');
  };
  return <section aria-label="Propiedades de la nota" className="mb-5 rounded border border-obsidian-border bg-obsidian-card/60 text-xs">
    <button className="w-full text-left px-3 py-2 text-obsidian-muted" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>Propiedades ({Object.keys(parsed.frontmatter || {}).length})</button>
    {!collapsed && <div className="p-3">
      {parsed.error && <p role="alert" className="text-rose-300">{parsed.error} Corrige el YAML en código fuente.</p>}
      {Object.entries(parsed.frontmatter || {}).map(([name, value]) => <PropertyRow key={`${path}:${name}`} name={name} value={value} readOnly={readOnly || !!parsed.error} commit={commit} />)}
      {!readOnly && !parsed.error && <form className="flex gap-2 mt-3" onSubmit={(e) => {
        e.preventDefault();
        try {
          if (Object.hasOwn(parsed.frontmatter || {}, newName)) throw new Error('Esta propiedad ya existe.');
          commit(newName, ''); setNewName('');
        } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
      }}>
        <input aria-label="Nombre de nueva propiedad" placeholder="Nueva propiedad" className="min-w-0 flex-1 bg-obsidian-bg p-1" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className="text-jade-300" type="submit">Añadir</button>
      </form>}
      {error && <p role="alert" className="text-rose-300 mt-2">{error}</p>}
    </div>}
  </section>;
}
