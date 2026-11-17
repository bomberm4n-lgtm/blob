const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('blobDesktop', {
  isDesktop: true,
  getSources: () => ipcRenderer.invoke('blob:get-sources'),
  selectSource: (id, audio) => ipcRenderer.invoke('blob:select-source', id, audio),
  getServer: () => ipcRenderer.invoke('blob:get-server'),
  setServer: (url) => ipcRenderer.invoke('blob:set-server', url),
});
