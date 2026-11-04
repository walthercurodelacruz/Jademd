import React, { useState } from 'react';
import { useVaultStore } from '../store/useVaultStore';
import { Cloud, Folder, HardDrive, Globe, Plus, X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

export const VaultModal: React.FC<Props> = ({ open, onClose }) => {
  const { openLocalVault, openWebdavVault, openGdriveVault, isLoading } = useVaultStore();
  const [tab, setTab] = useState<'local' | 'webdav' | 'gdrive'>('local');

  // Local form
  const [localPath, setLocalPath] = useState('/mnt/dm-0/RECURSOS/RAIZ/RAIZ');
  const [localName, setLocalName] = useState('Mi Bóveda Principal');

  // WebDAV form
  const [webdavEndpoint, setWebdavEndpoint] = useState('https://nextcloud.midominio.com/remote.php/dav/files/usuario/');
  const [webdavUser, setWebdavUser] = useState('');
  const [webdavPass, setWebdavPass] = useState('');
  const [webdavRoot, setWebdavRoot] = useState('/Notas');
  const [webdavName, setWebdavName] = useState('Bóveda Nextcloud');

  // Google Drive form
  const [gdriveName, setGdriveName] = useState('Bóveda Google Drive');
  const [gdriveToken, setGdriveToken] = useState('');
  const [gdriveRefreshToken, setGdriveRefreshToken] = useState('');
  const [gdriveClientId, setGdriveClientId] = useState('');
  const [gdriveClientSecret, setGdriveClientSecret] = useState('');
  const [gdriveRoot, setGdriveRoot] = useState('/');

  if (!open) return null;

  const handleOpenLocal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localPath.trim()) return;
    await openLocalVault(localPath.trim(), localName.trim() || undefined);
    onClose();
  };

  const handleOpenWebdav = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webdavEndpoint.trim()) return;
    await openWebdavVault(
      webdavEndpoint.trim(),
      webdavUser.trim() || undefined,
      webdavPass.trim() || undefined,
      webdavRoot.trim() || undefined,
      webdavName.trim() || undefined
    );
    onClose();
  };

  const handleOpenGdrive = async (e: React.FormEvent) => {
    e.preventDefault();
    await openGdriveVault({
      name: gdriveName.trim() || undefined,
      accessToken: gdriveToken.trim() || undefined,
      refreshToken: gdriveRefreshToken.trim() || undefined,
      clientId: gdriveClientId.trim() || undefined,
      clientSecret: gdriveClientSecret.trim() || undefined,
      root: gdriveRoot.trim() || undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-obsidian-card border border-obsidian-border rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-obsidian-border bg-obsidian-sidebar">
          <div className="flex items-center gap-2 font-semibold text-obsidian-text">
            <Folder size={18} className="text-jade-400" />
            <span>Gestor de Bóvedas (Vaults)</span>
          </div>
          <button onClick={onClose} className="text-obsidian-muted hover:text-white p-1 rounded">
            <X size={16} />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-obsidian-border bg-obsidian-sidebar/60 px-5 pt-2">
          <button
            onClick={() => setTab('local')}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-medium border-b-2 transition ${
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
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-medium border-b-2 transition ${
              tab === 'webdav'
                ? 'border-jade-500 text-jade-400'
                : 'border-transparent text-obsidian-muted hover:text-obsidian-text'
            }`}
          >
            <Cloud size={14} />
            <span>Nextcloud / WebDAV</span>
          </button>
          <button
            onClick={() => setTab('gdrive')}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-medium border-b-2 transition ${
              tab === 'gdrive'
                ? 'border-jade-500 text-jade-400'
                : 'border-transparent text-obsidian-muted hover:text-obsidian-text'
            }`}
          >
            <Globe size={14} />
            <span>Google Drive</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          {tab === 'local' && (
            <form onSubmit={handleOpenLocal} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-obsidian-muted mb-1">
                  Ruta absoluta de la carpeta en Linux o punto de montaje de red (SMB/NFS):
                </label>
                <input
                  type="text"
                  required
                  value={localPath}
                  onChange={(e) => setLocalPath(e.target.value)}
                  placeholder="/home/usuario/MisNotas o /mnt/recursos/boveda"
                  className="w-full bg-obsidian-sidebar border border-obsidian-border rounded-lg px-3 py-2 text-sm text-obsidian-text focus:border-jade-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-obsidian-muted mb-1">
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
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-obsidian-muted hover:bg-obsidian-hover"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-jade-600 hover:bg-jade-500 text-white transition disabled:opacity-50"
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
                <label className="block text-xs font-medium text-obsidian-muted mb-1">
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
                  <label className="block text-xs font-medium text-obsidian-muted mb-1">
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
                  <label className="block text-xs font-medium text-obsidian-muted mb-1">
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
                  <label className="block text-xs font-medium text-obsidian-muted mb-1">
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
                  <label className="block text-xs font-medium text-obsidian-muted mb-1">
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
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-obsidian-muted hover:bg-obsidian-hover"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-jade-600 hover:bg-jade-500 text-white transition disabled:opacity-50"
                >
                  <Cloud size={14} />
                  <span>{isLoading ? 'Conectando...' : 'Conectar Bóveda'}</span>
                </button>
              </div>
            </form>
          )}

          {tab === 'gdrive' && (
            <form onSubmit={handleOpenGdrive} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-obsidian-muted mb-1">
                  Access Token OAuth2 (o dejar vacío si se usa Refresh Token):
                </label>
                <input
                  type="text"
                  value={gdriveToken}
                  onChange={(e) => setGdriveToken(e.target.value)}
                  placeholder="ya29.a0..."
                  className="w-full bg-obsidian-sidebar border border-obsidian-border rounded-lg px-3 py-2 text-sm text-obsidian-text focus:border-jade-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-obsidian-muted mb-1">
                    Client ID (Google Cloud):
                  </label>
                  <input
                    type="text"
                    value={gdriveClientId}
                    onChange={(e) => setGdriveClientId(e.target.value)}
                    placeholder="xxxx.apps.googleusercontent.com"
                    className="w-full bg-obsidian-sidebar border border-obsidian-border rounded-lg px-3 py-2 text-sm text-obsidian-text focus:border-jade-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-obsidian-muted mb-1">
                    Client Secret:
                  </label>
                  <input
                    type="password"
                    value={gdriveClientSecret}
                    onChange={(e) => setGdriveClientSecret(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-obsidian-sidebar border border-obsidian-border rounded-lg px-3 py-2 text-sm text-obsidian-text focus:border-jade-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-obsidian-muted mb-1">
                  Refresh Token:
                </label>
                <input
                  type="password"
                  value={gdriveRefreshToken}
                  onChange={(e) => setGdriveRefreshToken(e.target.value)}
                  placeholder="1//04..."
                  className="w-full bg-obsidian-sidebar border border-obsidian-border rounded-lg px-3 py-2 text-sm text-obsidian-text focus:border-jade-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-obsidian-muted mb-1">
                    Carpeta Raíz / Root ID:
                  </label>
                  <input
                    type="text"
                    value={gdriveRoot}
                    onChange={(e) => setGdriveRoot(e.target.value)}
                    placeholder="/"
                    className="w-full bg-obsidian-sidebar border border-obsidian-border rounded-lg px-3 py-2 text-sm text-obsidian-text focus:border-jade-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-obsidian-muted mb-1">
                    Nombre:
                  </label>
                  <input
                    type="text"
                    value={gdriveName}
                    onChange={(e) => setGdriveName(e.target.value)}
                    placeholder="Google Drive Vault"
                    className="w-full bg-obsidian-sidebar border border-obsidian-border rounded-lg px-3 py-2 text-sm text-obsidian-text focus:border-jade-500 outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-obsidian-muted hover:bg-obsidian-hover"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-jade-600 hover:bg-jade-500 text-white transition disabled:opacity-50"
                >
                  <Globe size={14} />
                  <span>{isLoading ? 'Conectando...' : 'Conectar Google Drive'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
