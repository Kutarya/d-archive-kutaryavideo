const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('kutarya', {
  state: () => ipcRenderer.invoke('state'),
  add: text => ipcRenderer.invoke('add', text),
  search: text => ipcRenderer.invoke('search', text),
  cancelSearch: () => ipcRenderer.invoke('search-cancel'),
  paste: () => ipcRenderer.invoke('paste'),
  cancel: id => ipcRenderer.invoke('cancel', id),
  retry: id => ipcRenderer.invoke('retry', id),
  open: id => ipcRenderer.invoke('open', id),
  reveal: id => ipcRenderer.invoke('reveal', id),
  folder: () => ipcRenderer.invoke('folder'),
  clear: () => ipcRenderer.invoke('clear'),
  removeHistory: id => ipcRenderer.invoke('remove-history', id),
  chooseFolder: () => ipcRenderer.invoke('choose-folder'),
  theme: value => ipcRenderer.invoke('theme', value),
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  website: () => ipcRenderer.invoke('website'),
  minimize: () => ipcRenderer.send('minimize'),
  maximize: () => ipcRenderer.send('maximize'),
  close: () => ipcRenderer.send('close'),
  onChange: callback => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on('changed', handler);
    return () => ipcRenderer.removeListener('changed', handler);
  }
});
