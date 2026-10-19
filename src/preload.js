const { contextBridge, ipcRenderer } = require('electron');

const on = (ch, cb) => {
  const h = (_e, p) => cb(p);
  ipcRenderer.on(ch, h);
  return () => ipcRenderer.removeListener(ch, h);
};

contextBridge.exposeInMainWorld('api', {
  chooseDir: () => ipcRenderer.invoke('choose-dir'),
  openDir: (d) => ipcRenderer.invoke('open-dir', d),
  defaultDir: () => ipcRenderer.invoke('default-dir'),
  loginStatus: () => ipcRenderer.invoke('login-status'),
  login: () => ipcRenderer.invoke('login'),
  logout: () => ipcRenderer.invoke('logout'),
  cancelList: () => ipcRenderer.invoke('cancel-list'),
  list: (opts) => ipcRenderer.invoke('list', opts),
  download: (opts) => ipcRenderer.invoke('download', opts),
  cancel: () => ipcRenderer.invoke('cancel'),
  onEntry: (cb) => on('entry', cb),
  onProgress: (cb) => on('progress', cb),
});
