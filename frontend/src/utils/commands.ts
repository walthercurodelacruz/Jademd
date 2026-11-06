export const COMMANDS = [
  { id: 'palette', label: 'Paleta de comandos', keys: ['Mod+Shift+p'] },
  { id: 'new', label: 'Nueva nota', keys: ['Mod+n'] },
  { id: 'newBase', label: 'Nueva base', keys: [] },
  { id: 'refreshVault', label: 'Actualizar bóveda e índice', keys: [] },
  { id: 'search', label: 'Buscar en la bóveda', keys: ['Mod+o', 'Mod+k', 'Mod+f'] },
  { id: 'splitRight', label: 'Dividir panel a la derecha', keys: [] },
  { id: 'splitDown', label: 'Dividir panel abajo', keys: [] },
  { id: 'back', label: 'Nota anterior', keys: ['Alt+ArrowLeft'] },
  { id: 'forward', label: 'Nota siguiente', keys: ['Alt+ArrowRight'] },
  { id: 'save', label: 'Guardar todos los cambios pendientes', keys: ['Mod+s'] },
  { id: 'rename', label: 'Renombrar o mover documento', keys: ['F2'] },
  { id: 'trash', label: 'Abrir papelera', keys: [] },
  { id: 'graph', label: 'Mostrar grafo', keys: [] },
  { id: 'editor', label: 'Volver a los documentos', keys: [] },
  { id: 'live', label: 'Modo de edición en vivo', keys: [] },
  { id: 'source', label: 'Modo código fuente', keys: [] },
  { id: 'reading', label: 'Modo lectura', keys: [] },
  { id: 'split-preview', label: 'Fuente y vista previa', keys: [] },
  { id: 'zen', label: 'Alternar modo enfoque', keys: [] },
  { id: 'daily', label: 'Abrir nota diaria de hoy', keys: ['Mod+Shift+d'] },
  { id: 'template', label: 'Insertar plantilla', keys: [] },
  { id: 'bookmark', label: 'Marcar o desmarcar documento', keys: ['Mod+Shift+b'] },
  { id: 'publication', label: 'Exportar sitio estático', keys: [] },
  { id: 'export', label: 'Exportar documento', keys: [] },
  { id: 'productivity', label: 'Productividad y atajos', keys: ['Mod+,'] },
] as const;
export type CommandId = typeof COMMANDS[number]['id'];
export type Shortcuts = Partial<Record<CommandId, string[]>>;
export const bindings = (id: CommandId, overrides: Shortcuts): readonly string[] => overrides[id] ?? COMMANDS.find((command) => command.id === id)!.keys;
export function shortcutFromEvent(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): string | null {
  if (['Control', 'Meta', 'Alt', 'Shift', 'Dead', 'Unidentified'].includes(event.key)) return null;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  return [event.ctrlKey || event.metaKey ? 'Mod' : '', event.altKey ? 'Alt' : '', event.shiftKey ? 'Shift' : '', key].filter(Boolean).join('+');
}
export function validShortcut(key: string): boolean {
  return /^(?:(?:Mod\+)(?:Alt\+)?(?:Shift\+)?|Alt\+(?:Shift\+)?|(?:Shift\+)?(?=F\d+$))(?:[a-z0-9,.;/]|ArrowLeft|ArrowRight|ArrowUp|ArrowDown|F(?:[1-9]|1\d|2[0-4]))$/.test(key)
    && !['Mod+c', 'Mod+v', 'Mod+x', 'Mod+z', 'Mod+Shift+z', 'Mod+y', 'Mod+a', 'Mod+b', 'Mod+i', 'Mod+u'].includes(key);
}
export function shortcutConflict(id: CommandId, key: string, overrides: Shortcuts): string | undefined {
  return COMMANDS.find((command) => command.id !== id && bindings(command.id, overrides).includes(key))?.label;
}
export const displayShortcut = (key: string) => key.replace('Mod+', 'Ctrl/⌘+').replace('ArrowLeft', '←').replace('ArrowRight', '→');
