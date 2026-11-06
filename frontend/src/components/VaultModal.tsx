import { savedVaults, lastVault, forgetVault, SavedVault } from '../utils/vaultRegistry';
import React, { useState } from 'react';
import { FolderBrowser } from './FolderBrowser';
import { useVaultStore } from '../store/useVaultStore';
import { Cloud, Folder, HardDrive, Plus, X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

export const VaultModal: React.FC<Props> = ({ open, onClose }) => {
  const { openLocalVault, openWebdavVault, isLoading, noteError, vault } = useVaultStore();
  const [tab, setTab] = useState<'local' | 'webdav'>('local');

  // Local form
  const [browseOpen, setBrowseOpen] = useState(false);
  const [localPath, setLocalPath] = useState('');
  const [localName, setLocalName] = useState('Mi Bóveda Principal');

  // WebDAV form
  const [webdavEndpoint, setWebdavEndpoint] = useState('https://nextcloud.midominio.com/remote.php/dav/files/usuario/');
  const [webdavUser, setWebdavUser] = useState('');
  const [webdavPass, setWebdavPass] = useState('');
  const [webdavRoot, setWebdavRoot] = useState('/Notas');
  const [webdavName, setWebdavName] = useState('Bóveda Nextcloud');

  const [error, setError] = useState<string | null>(null);
  const [, refreshList] = useState(0);
  if (!open) return null;
  const entries = savedVaults();
  const selectVault = async (entry: SavedVault) => {
    setError(null);
    if (entry.kind === 'webdav') {
      setTab('webdav'); setWebdavEndpoint(entry.path); setWebdavUser(entry.username || '');
      setWebdavRoot(entry.root || ''); setWebdavName(entry.name); setWebdavPass('');
      setError('Introduce tu contraseña o token para reconectar esta bóveda.');
      return;
    }
    try { await openLocalVault(entry.path, entry.name); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const handleOpenLocal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localPath.trim()) return;
    setError(null);
    try {
      await openLocalVault(localPath.trim(), localName.trim() || undefined);
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const handleOpenWebdav = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webdavEndpoint.trim()) return;
    setError(null);
    try {
      await openWebdavVault(
      webdavEndpoint.trim(),
      webdavUser.trim() || undefined,
      webdavPass.trim() || undefined,
      webdavRoot.trim() || undefined,
      webdavName.trim() || undefined
    );
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-label="Abrir bóveda" className="w-full max-w-lg max-h-[90vh] bg-obsidian-card border border-obsidian-border rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-obsidian-border bg-obsidian-sidebar">
          <div className="flex items-center gap-2 font-semibold text-obsidian-text">
            <Folder size={18} className="text-jade-400" />
            <span>Gestor de Bóvedas (Vaults)</span>
          </div>
          {vault && <button onClick={onClose} aria-label="Cerrar gestor de bóvedas" className="text-obsidian-muted hover:text-white p-1 rounded">
            <X size={16} />
          </button>}
        </div>

        <div className="px-5 py-3 overflow-y-auto max-h-64 border-b border-obsidian-border">
          <h2 className="font-medium mb-2">Tus bóvedas</h2>
          {!entries.length && <p className="text-sm text-obsidian-muted">Agrega una carpeta para comenzar.</p>}
          {entries.map((entry) => <div key={entry.key} className="flex gap-2 items-center mb-2">
            <button disabled={isLoading} onClick={() => void selectVault(entry)} className="flex-1 min-w-0 text-left rounded-lg p-3 bg-obsidian-sidebar hover:bg-obsidian-hover disabled:opacity-50">
              <span className="block font-medium">{entry.name} {lastVault() === entry.key && <small className="text-jade-400">· Última utilizada</small>}</span>
              <span className="block text-xs text-obsidian-muted break-all">{entry.path}</span>
            </button>
            <button disabled={isLoading} title="Quitar de la lista (no borra archivos)" aria-label={`Olvidar ${entry.name}`} onClick={() => { forgetVault(entry.key); refreshList((n) => n + 1); }} className="p-2 text-obsidian-muted"><X size={16} /></button>
          </div>)}
          <h2 className="font-medium mt-3">Agregar una bóveda</h2>
        </div>
        {/* Tab Selector */}
        <div className="flex border-b border-obsidian-border bg-obsidian-sidebar/60 px-5 pt-2">
          <button
            onClick={() => setTab('local')}
            className={`flex items-center gap-2 pb-2.5 px-3 text-sm font-medium border-b-2 transition ${
              tab === 'local'
                ? 'border-jade-500 text-jade-400'
                : 'border-transparent text-obsidian-muted hover:text-obsidian-text'
            }`}
          >
            <HardDrive size={14} />
            <span>Disco / Red Local</span>
          </button>
          <button
            onClick={() => setTab('webdav')}
            className={`flex items-center gap-2 pb-2.5 px-3 text-sm font-medium border-b-2 transition ${
              tab === 'webdav'
                ? 'border-jade-500 text-jade-400'
                : 'border-transparent text-obsidian-muted hover:text-obsidian-text'
            }`}
          >
            <Cloud size={14} />
            <span>Nextcloud / WebDAV</span>
          </button>
        </div>

        {(error || noteError) && <p role="alert" className="px-5 pt-3 text-sm text-rose-300">{error || noteError}</p>}
        {/* Content */}
        <div className="p-5 overflow-y-auto">
          {tab === 'local' && (
            <form onSubmit={handleOpenLocal} className="space-y-4">
              <div>
                <button
                  type="button"
                  aria-expanded={browseOpen}
                  onClick={() => setBrowseOpen(!browseOpen)}
                  className="flex items-center gap-2 rounded-lg border border-obsidian-border px-3 py-2 text-sm text-jade-300 hover:bg-obsidian-hover"
                >
                  <Folder size={16} /> Explorar carpetas y unidades
                </button>
                <p className="mt-2 text-xs text-obsidian-muted">
                  Para usar Samba (SMB) o NFS, conecta el recurso en el sistema operativo del equipo donde corre JadeMD y selecciónalo aquí.
                </p>
                {browseOpen && <FolderBrowser onSelect={(path) => { setLocalPath(path); setBrowseOpen(false); }} />}
              </div>
              <div>
                <label htmlFor="vault-local-path" className="block text-sm font-medium text-obsidian-muted mb-1">
                  Carpeta seleccionada o ruta manual
                </label>
                <input
                  type="text"
                  required
                  id="vault-local-path"
                  value={localPath}
                  onChange={(e) => setLocalPath(e.target.value)}
                  placeholder="/home/usuario/MisNotas o /mnt/recursos/boveda"
                  className="w-full bg-obsidian-sidebar border border-obsidian-border rounded-lg px-3 py-2 text-sm text-obsidian-text focus:border-jade-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-obsidian-muted mb-1">
                  Nombre descriptivo:
                </label>
                <input
                  type="text"
                  value={localName}
                  onChange={(e) => setLocalName(e.target.value)}
                  placeholder="Mi Bóveda"
                  className="w-full bg-obsidian-sidebar border border-obsidian-border rounded-lg px-3 py-2 text-sm text-obsidian-text focus:border-jade-500 outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                {vault && <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-obsidian-muted hover:bg-obsidian-hover"
                >
                  Cancelar
                </button>}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-jade-700 hover:bg-jade-800 text-white transition disabled:opacity-50"
                >
                  <Plus size={14} />
                  <span>{isLoading ? 'Abriendo...' : 'Abrir Bóveda'}</span>
                </button>
              </div>
            </form>
          )}

          {tab === 'webdav' && (
            <form onSubmit={handleOpenWebdav} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-obsidian-muted mb-1">
                  URL del Endpoint WebDAV (Nextcloud / ownCloud):
                </label>
                <input
                  type="url"
                  required
                  value={webdavEndpoint}
                  onChange={(e) => setWebdavEndpoint(e.target.value)}
                  placeholder="https://nextcloud.example.com/remote.php/dav/files/usuario/"
                  className="w-full bg-obsidian-sidebar border border-obsidian-border rounded-lg px-3 py-2 text-sm text-obsidian-text focus:border-jade-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-obsidian-muted mb-1">
                    Usuario:
                  </label>
                  <input
                    type="text"
                    value={webdavUser}
                    onChange={(e) => setWebdavUser(e.target.value)}
                    placeholder="usuario"
                    className="w-full bg-obsidian-sidebar border border-obsidian-border rounded-lg px-3 py-2 text-sm text-obsidian-text focus:border-jade-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-obsidian-muted mb-1">
                    Contraseña / Token App:
                  </label>
                  <input
                    type="password"
                    value={webdavPass}
                    onChange={(e) => setWebdavPass(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-obsidian-sidebar border border-obsidian-border rounded-lg px-3 py-2 text-sm text-obsidian-text focus:border-jade-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-obsidian-muted mb-1">
                    Subcarpeta Raíz:
                  </label>
                  <input
                    type="text"
                    value={webdavRoot}
                    onChange={(e) => setWebdavRoot(e.target.value)}
                    placeholder="/Notas"
                    className="w-full bg-obsidian-sidebar border border-obsidian-border rounded-lg px-3 py-2 text-sm text-obsidian-text focus:border-jade-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-obsidian-muted mb-1">
                    Nombre:
                  </label>
                  <input
                    type="text"
                    value={webdavName}
                    onChange={(e) => setWebdavName(e.target.value)}
                    placeholder="Bóveda Cloud"
                    className="w-full bg-obsidian-sidebar border border-obsidian-border rounded-lg px-3 py-2 text-sm text-obsidian-text focus:border-jade-500 outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                {vault && <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-obsidian-muted hover:bg-obsidian-hover"
                >
                  Cancelar
                </button>}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-jade-700 hover:bg-jade-800 text-white transition disabled:opacity-50"
                >
                  <Cloud size={14} />
                  <span>{isLoading ? 'Conectando...' : 'Conectar Bóveda'}</span>
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
};
