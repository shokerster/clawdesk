const { contextBridge, ipcRenderer } = require('electron');

function cleanString(value, maxLength = 4096) {
  return String(value || '').trim().slice(0, maxLength);
}

function cleanMessagePayload(payload = {}) {
  const attachments = Array.isArray(payload.attachments)
    ? payload.attachments.slice(0, 10).map((attachment) => ({
      ok: attachment?.ok !== false,
      name: cleanString(attachment?.name, 120),
      path: cleanString(attachment?.path, 4096),
      size: Number.isFinite(Number(attachment?.size)) ? Number(attachment.size) : undefined
    })).filter((attachment) => attachment.path)
    : [];
  return {
    message: cleanString(payload.message, 24000),
    sessionKey: cleanString(payload.sessionKey, 160),
    agent: cleanString(payload.agent, 80),
    thinking: ['low', 'medium', 'high'].includes(payload.thinking) ? payload.thinking : 'low',
    attachments
  };
}

contextBridge.exposeInMainWorld('clawdesk', {
  getStatus: () => ipcRenderer.invoke('openclaw:status'),
  getUsage: () => ipcRenderer.invoke('openclaw:usage'),
  getHealth: () => ipcRenderer.invoke('openclaw:health'),
  getPresence: () => ipcRenderer.invoke('openclaw:presence'),
  getAgents: () => ipcRenderer.invoke('openclaw:agents'),
  getSkills: () => ipcRenderer.invoke('openclaw:skills'),
  getCron: () => ipcRenderer.invoke('openclaw:cron'),
  setModel: (model) => ipcRenderer.invoke('openclaw:set-model', cleanString(model, 160)),
  getMemory: () => ipcRenderer.invoke('openclaw:memory'),
  getLogs: () => ipcRenderer.invoke('openclaw:logs'),
  getSystem: () => ipcRenderer.invoke('app:system'),
  sendMessage: (payload) => ipcRenderer.invoke('openclaw:send-message', cleanMessagePayload(payload)),
  chooseAttachments: () => ipcRenderer.invoke('openclaw:choose-attachments'),
  listSessions: () => ipcRenderer.invoke('openclaw:sessions'),
  openControlUi: () => ipcRenderer.invoke('openclaw:open-control-ui'),
  openPath: (targetPath) => ipcRenderer.invoke('openclaw:open-path', cleanString(targetPath, 4096)),
  action: (name) => ipcRenderer.invoke('openclaw:action', cleanString(name, 40))
});
