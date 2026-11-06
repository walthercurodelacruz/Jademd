// Run with Electron and JADEMD_PORT set to a free test port. Never uses a real vault.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'jademd-desktop-qa-'));
app.setPath('userData', profile);
const scenario = process.env.JADEMD_SMOKE_SCENARIO || 'close';
require('./main.cjs');
let attempts = 0;
const interval = setInterval(async () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win || win.webContents.isLoading()) {
    if (++attempts > 100) { console.error('SMOKE_TIMEOUT'); process.exit(1); }
    return;
  }
  clearInterval(interval);
  try {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const state = await win.webContents.executeJavaScript(`({ title: document.title, selector: document.body.innerText.includes('Tus bóvedas'), research: document.body.innerText.includes('Investigar en la web'), bridge: !!window.jademdDesktop })`);
    if (!state.selector || !state.bridge || state.research) throw new Error(JSON.stringify(state));
    console.log('SMOKE_READY', JSON.stringify(state));
    const screenshot = await win.webContents.capturePage();
    fs.writeFileSync(path.join(os.tmpdir(), 'jademd-desktop-qa.png'), screenshot.toPNG());
    if (scenario === 'vaults') {
      const one = path.join(profile, 'Vault One'); const two = path.join(profile, 'Vault Two');
      fs.mkdirSync(one); fs.mkdirSync(two); fs.writeFileSync(path.join(one, 'Inicio.md'), '# Prueba');
      const entries = [one, two].map((location) => ({ key: `local:${location}`, kind: 'local', name: path.basename(location), path: location }));
      const reload = async () => {
        const loaded = new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
        win.webContents.reload(); await loaded;
        await new Promise((resolve) => setTimeout(resolve, 1200));
      };
      await win.webContents.executeJavaScript(`localStorage.setItem('jademd.vaults.v1', ${JSON.stringify(JSON.stringify(entries.slice(0, 1)))})`);
      await reload();
      if (await win.webContents.executeJavaScript(`document.body.innerText.includes('Tus bóvedas')`)) throw new Error('Single vault did not auto-open');
      await win.webContents.executeJavaScript(`localStorage.setItem('jademd.vaults.v1', ${JSON.stringify(JSON.stringify(entries))})`);
      await reload();
      if (!await win.webContents.executeJavaScript(`document.body.innerText.includes('Tus bóvedas')`)) throw new Error('Multiple vaults did not wait');
      await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Vault Two')).click()`);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const last = await win.webContents.executeJavaScript(`localStorage.getItem('jademd.lastVault.v1')`);
      if (last !== entries[1].key) throw new Error('Last vault was not persisted');
      console.log('SMOKE_VAULTS_OK');
    }
    if (scenario === 'crash') { process.kill(process.pid, 'SIGKILL'); return; } // Backend must notice EOF independently.
    win.close(); // Exercises renderer flush -> IPC acknowledgment -> native close.
  } catch (error) { console.error(error); process.exit(1); }
}, 200);
app.on('will-quit', () => { clearInterval(interval); console.log('SMOKE_CLOSED'); });
