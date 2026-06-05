const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clawdesk', {
  getStatus: () => ipcRenderer.invoke('openclaw:status'),
  getUsage: () => ipcRenderer.invoke('openclaw:usage'),
  getHealth: () => ipcRenderer.invoke('openclaw:health'),
  getPresence: () => ipcRenderer.invoke('openclaw:presence'),
  getAgents: () => ipcRenderer.invoke('openclaw:agents'),
  getSkills: () => ipcRenderer.invoke('openclaw:skills'),
  getCron: () => ipcRenderer.invoke('openclaw:cron'),
  setModel: (model) => ipcRenderer.invoke('openclaw:set-model', model),
  getMemory: () => ipcRenderer.invoke('openclaw:memory'),
  getLogs: () => ipcRenderer.invoke('openclaw:logs'),
  getSystem: () => ipcRenderer.invoke('app:system'),
  sendMessage: (payload) => ipcRenderer.invoke('openclaw:send-message', payload),
  listSessions: () => ipcRenderer.invoke('openclaw:sessions'),
  openControlUi: () => ipcRenderer.invoke('openclaw:open-control-ui'),
  openPath: (targetPath) => ipcRenderer.invoke('openclaw:open-path', targetPath),
  action: (name) => ipcRenderer.invoke('openclaw:action', name)
});
