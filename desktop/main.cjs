const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');
const port = Number(process.env.JADEMD_PORT || 3030);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('JADEMD_PORT inválido');
const ORIGIN = `http://127.0.0.1:${port}`;
let backend;
let window;
let closing = false;
let stopping;

async function stopBackend() {
  if (stopping) return stopping;
  stopping = new Promise((resolve) => {
    if (!backend || !backend.pid || backend.exitCode !== null || backend.signalCode !== null) return resolve();
    const timeout = setTimeout(() => backend.kill('SIGKILL'), 3000);
    backend.once('exit', () => { clearTimeout(timeout); resolve(); });
    backend.stdin.end();
  });
  return stopping;
}

function probe() {
  return new Promise((resolve) => {
    const request = http.get(`${ORIGIN}/api/session`, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.setTimeout(500, () => request.destroy());
    request.on('error', () => resolve(false));
  });
}

async function launch() {
  // Never attach to or kill a server that this application did not create.
  if (await probe()) throw new Error(`El puerto ${port} ya está en uso. Cierra la instancia anterior de JadeMD y vuelve a iniciar.`);
  const root = path.resolve(__dirname, '..');
  const binary = app.isPackaged
    ? path.join(process.resourcesPath, 'backend', process.platform === 'win32' ? 'jademd.exe' : 'jademd')
    : path.join(root, 'target', 'debug', process.platform === 'win32' ? 'jademd.exe' : 'jademd');
  backend = spawn(binary, ['--desktop'], { cwd: app.isPackaged ? path.dirname(binary) : root, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let failure;
  backend.on('error', (error) => { failure = error; });
  let output = '';
  let bound = false;
  backend.stdout.on('data', (chunk) => { output = (output + chunk.toString()).slice(-4096); if (output.includes(`JADEMD_READY ${ORIGIN}`)) bound = true; });
  backend.stderr.on('data', () => {});
  backend.stdin.on('error', () => {});
  backend.on('exit', () => {
    if (!closing && window) {
      dialog.showErrorBox('JadeMD', 'El proceso local se ha detenido. Reinicia la aplicación. Los borradores locales se conservan.');
      closing = true;
      window.destroy();
    }
  });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (failure) throw failure;
    if (backend.exitCode !== null || backend.signalCode !== null) throw new Error(`No se pudo iniciar el servidor local. Comprueba que el puerto ${port} esté disponible.`);
    if (bound && await probe()) { ready = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('El servidor local no respondió a tiempo.');
  window = new BrowserWindow({ width: 1380, height: 900, minWidth: 760, minHeight: 540, title: 'JadeMD', backgroundColor: '#18181b', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  const external = (url) => { if (/^https?:\/\//i.test(url)) void shell.openExternal(url); };
  window.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: 'deny' }; });
  window.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== ORIGIN) { event.preventDefault(); external(url); } });
  window.webContents.on('render-process-gone', () => { closing = true; window.destroy(); });
  window.on('close', (event) => {
    if (closing) return;
    event.preventDefault();
    window.webContents.send('prepare-close');
  });
  ipcMain.on('ready-to-close', (event) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return;
    closing = true;
    window.destroy();
  });
  await window.loadURL(ORIGIN);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.on('window-all-closed', () => { closing = true; void stopBackend().then(() => app.quit()); });
  app.on('will-quit', () => { backend?.stdin.end(); });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { closing = true; void stopBackend().then(() => app.exit()); });
  app.whenReady().then(launch).catch(async (error) => {
    closing = true;
    dialog.showErrorBox('No se pudo abrir JadeMD', error.message);
    await stopBackend();
    app.exit(1);
  });
}
