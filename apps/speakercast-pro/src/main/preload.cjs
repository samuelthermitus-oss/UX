const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('speakercast', {
  setPlaying: (playing) => ipcRenderer.invoke('power:playing', !!playing),
  askMic: () => ipcRenderer.invoke('mic:ask'),
  info: () => ipcRenderer.invoke('app:info'),
});
