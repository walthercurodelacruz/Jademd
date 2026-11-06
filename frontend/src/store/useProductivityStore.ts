import { create } from 'zustand';
import { COMMANDS, CommandId, Shortcuts, shortcutConflict, validShortcut } from '../utils/commands';
import { validVaultPath } from '../utils/productivity';
import { remapPath } from '../utils/workspace';

export interface ProductivitySettings { dailyFolder: string; dailyTemplate: string; templateFolder: string; bookmarks: string[]; shortcuts: Shortcuts }
const defaults = (): ProductivitySettings => ({ dailyFolder: 'Diario', dailyTemplate: '', templateFolder: 'Plantillas', bookmarks: [], shortcuts: {} });
function read(id: string): ProductivitySettings {
  try {
    const value = JSON.parse(localStorage.getItem(`jademd:productivity:${id}`) || '{}');
    const settings = defaults();
    for (const key of ['dailyFolder', 'dailyTemplate', 'templateFolder'] as const) if (typeof value[key] === 'string' && validVaultPath(value[key], true)) settings[key] = value[key];
    settings.bookmarks = [...new Set<string>((Array.isArray(value.bookmarks) ? value.bookmarks : []).filter((path: unknown): path is string => typeof path === 'string' && validVaultPath(path)))].slice(0, 500);
    // Disable defaults for customized commands before checking collisions with other commands.
    for (const command of COMMANDS) if (Array.isArray(value.shortcuts?.[command.id])) settings.shortcuts[command.id] = [];
    for (const command of COMMANDS) {
      const keys = value.shortcuts?.[command.id];
      if (!Array.isArray(keys)) continue;
      settings.shortcuts[command.id] = [...new Set<string>(keys.filter((key: unknown): key is string => typeof key === 'string' && validShortcut(key) && !shortcutConflict(command.id, key, settings.shortcuts)))].slice(0, 5);
    }
    return settings;
  } catch { return defaults(); }
}
interface State {
  vaultId: string | null; settings: ProductivitySettings; open: boolean; tab: 'daily' | 'templates' | 'bookmarks' | 'tags' | 'shortcuts'; error: string | null;
  activate: (id: string | null) => void;
  show: (tab?: State['tab']) => void;
  close: () => void;
  update: (settings: Partial<ProductivitySettings>) => void;
  toggleBookmark: (path: string) => void;
  assignShortcut: (id: CommandId, key: string | null) => void;
  remap: (from: string, to: string) => void;
}
export const useProductivityStore = create<State>((set, get) => ({
  vaultId: null, settings: defaults(), open: false, tab: 'daily', error: null,
  activate: (vaultId) => { if (get().vaultId !== vaultId) set({ vaultId, settings: vaultId ? read(vaultId) : defaults(), open: false, error: null }); },
  show: (tab = 'daily') => set({ open: true, tab, error: null }), close: () => set({ open: false }),
  update: (patch) => {
    if (!get().vaultId) throw new Error('Abre una bóveda primero');
    const settings = { ...get().settings, ...patch };
    for (const field of ['dailyFolder', 'dailyTemplate', 'templateFolder'] as const) if (!validVaultPath(settings[field], true)) throw new Error('Utiliza rutas relativas visibles dentro de la bóveda');
    if (settings.dailyTemplate && (!settings.dailyTemplate.endsWith('.md') || settings.dailyTemplate.endsWith('.excalidraw.md'))) throw new Error('Selecciona una plantilla Markdown (.md)');
    if (settings.bookmarks.length > 500 || settings.bookmarks.some((path) => !validVaultPath(path))) throw new Error('Se admiten hasta 500 marcadores con rutas válidas');
    // Persist before accepting the setting, so a quota/access error stays visible.
    try { localStorage.setItem(`jademd:productivity:${get().vaultId}`, JSON.stringify(settings)); }
    catch { throw new Error('No se pudo conservar la configuración en este navegador'); }
    set({ settings });
  },
  toggleBookmark: (path) => {
    if (!validVaultPath(path)) throw new Error('Ruta de marcador inválida');
    const bookmarks = get().settings.bookmarks;
    get().update({ bookmarks: bookmarks.includes(path) ? bookmarks.filter((entry) => entry !== path) : [...bookmarks, path] });
  },
  assignShortcut: (id, key) => {
    if (key && !validShortcut(key)) throw new Error('Usa Ctrl/⌘, Alt o una tecla de función. Los atajos básicos de edición están reservados.');
    const conflict = key && shortcutConflict(id, key, get().settings.shortcuts);
    if (conflict) throw new Error(`El atajo ya pertenece a «${conflict}»`);
    get().update({ shortcuts: { ...get().settings.shortcuts, [id]: key ? [key] : [] } });
  },
  remap: (from, to) => {
    const settings = get().settings;
    get().update({ bookmarks: [...new Set(settings.bookmarks.map((path) => remapPath(path, from, to)))], dailyFolder: remapPath(settings.dailyFolder, from, to), templateFolder: remapPath(settings.templateFolder, from, to), dailyTemplate: remapPath(settings.dailyTemplate, from, to) });
  },
}));
