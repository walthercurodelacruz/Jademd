const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('jademdDesktop', {
  onCloseRequested: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('prepare-close', listener);
    return () => ipcRenderer.removeListener('prepare-close', listener);
  },
  readyToClose: () => ipcRenderer.send('ready-to-close'),
});
