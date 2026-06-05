const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_GATEWAY_URL = 'http://127.0.0.1:18789';
const DEFAULT_WORKSPACE_DIR = path.join(os.homedir(), '.openclaw', 'workspace');

function runShell(command, args = [], options = {}) {
  return new Promise((resolve) => {
    execFile(command, args, {
      timeout: options.timeout || 8000,
      maxBuffer: options.maxBuffer || 1024 * 1024 * 8
    }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        message: error ? error.message : ''
      });
    });
  });
}

async function resolveOpenClawPath() {
  const candidates = ['/opt/homebrew/bin/openclaw', '/usr/local/bin/openclaw'];
  const fromPath = await runShell('/bin/zsh', ['-lc', 'command -v openclaw']);
  if (fromPath.ok && fromPath.stdout) candidates.unshift(fromPath.stdout);
  return [...new Set(candidates)].find((candidate) => fs.existsSync(candidate)) || '';
}

async function getWorkspaceDir() {
  const openclawPath = await resolveOpenClawPath();
  if (!openclawPath) return DEFAULT_WORKSPACE_DIR;
  const result = await runShell(openclawPath, ['config', 'get', 'agents', '--json'], { timeout: 12000, maxBuffer: 1024 * 1024 * 10 });
  const parsed = extractJson(result.stdout || result.stderr || result.message);
  return parsed?.defaults?.workspace || DEFAULT_WORKSPACE_DIR;
}

function safeFileName(name) {
  const parsed = path.parse(String(name || 'attachment'));
  const base = parsed.name.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'attachment';
  const ext = parsed.ext.replace(/[^a-z0-9.]+/gi, '').slice(0, 24);
  return `${base}${ext}`;
}

async function copyChatAttachments(filePaths = []) {
  const workspaceDir = await getWorkspaceDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const attachmentDir = path.join(workspaceDir, 'attachments', 'clawdesk', stamp);
  await fs.promises.mkdir(attachmentDir, { recursive: true });

  const attachments = [];
  for (const filePath of filePaths.slice(0, 10)) {
    const sourcePath = path.resolve(String(filePath || ''));
    const stats = await fs.promises.stat(sourcePath).catch(() => null);
    if (!stats?.isFile()) continue;
    if (stats.size > 50 * 1024 * 1024) {
      attachments.push({
        ok: false,
        name: path.basename(sourcePath),
        path: sourcePath,
        error: 'File is larger than 50 MB.'
      });
      continue;
    }

    const fileName = safeFileName(path.basename(sourcePath));
    let destination = path.join(attachmentDir, fileName);
    let suffix = 2;
    while (fs.existsSync(destination)) {
      const parsed = path.parse(fileName);
      destination = path.join(attachmentDir, `${parsed.name}-${suffix}${parsed.ext}`);
      suffix += 1;
    }
    await fs.promises.copyFile(sourcePath, destination);
    attachments.push({
      ok: true,
      name: path.basename(sourcePath),
      path: destination,
      size: stats.size
    });
  }
  return attachments;
}

async function chooseChatAttachments(browserWindow) {
  const result = await dialog.showOpenDialog(browserWindow, {
    title: 'Attach files to ClawDesk chat',
    properties: ['openFile', 'multiSelections']
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { ok: true, attachments: [] };
  }
  const attachments = await copyChatAttachments(result.filePaths);
  return {
    ok: true,
    attachments,
    rejected: attachments.filter((attachment) => !attachment.ok).length
  };
}

function extractJson(text) {
  const startObject = text.indexOf('{');
  const startArray = text.indexOf('[');
  const starts = [startObject, startArray].filter((index) => index >= 0);
  if (starts.length === 0) return null;
  const start = Math.min(...starts);
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function parseGatewayStatus(output) {
  const portMatch = output.match(/port=(\d+)|OPENCLAW_GATEWAY_PORT=(\d+)|Probe target:\s*ws:\/\/127\.0\.0\.1:(\d+)/);
  const versionMatch = output.match(/CLI version:\s*([^\s]+)/);
  const gatewayVersionMatch = output.match(/Gateway version:\s*([^\s]+)/);
  const runtimeMatch = output.match(/Runtime:\s*([^\n]+)/);
  const dashboardMatch = output.match(/Dashboard:\s*(http:\/\/[^\s]+)/);
  const logMatch = output.match(/File logs:\s*([^\n]+)/);
  const port = portMatch ? (portMatch[1] || portMatch[2] || portMatch[3]) : '18789';
  return {
    port,
    dashboardUrl: dashboardMatch ? dashboardMatch[1] : `http://127.0.0.1:${port}/`,
    logPath: logMatch ? logMatch[1].trim() : '',
    cliVersion: versionMatch ? versionMatch[1] : 'Unknown',
    gatewayVersion: gatewayVersionMatch ? gatewayVersionMatch[1] : 'Unknown',
    runtime: runtimeMatch ? runtimeMatch[1].trim() : 'Unknown',
    online: /Connectivity probe:\s*ok|Runtime:\s*running/i.test(output)
  };
}

function parseUsageCost(output) {
  const totalMatch = output.match(/Total:\s*\$([0-9.]+)\s*.\s*([0-9.]+[kKmMbB]?) tokens/);
  const latestMatch = output.match(/Latest day:\s*([0-9-]+)\s*.\s*\$([0-9.]+)\s*.\s*([0-9.]+[kKmMbB]?) tokens/);
  const missingMatch = output.match(/Missing entries:\s*(\d+)/);
  return {
    totalCost: totalMatch ? `$${totalMatch[1]}` : 'Unknown',
    totalTokens: totalMatch ? totalMatch[2] : 'Unknown',
    latestDay: latestMatch ? latestMatch[1] : 'Unknown',
    latestCost: latestMatch ? `$${latestMatch[2]}` : 'Unknown',
    latestTokens: latestMatch ? latestMatch[3] : 'Unknown',
    missingEntries: missingMatch ? missingMatch[1] : '0',
    raw: output
  };
}

async function gatewayCall(method, params = {}, timeout = 20000) {
  const openclawPath = await resolveOpenClawPath();
  if (!openclawPath) return { ok: false, data: null, raw: 'OpenClaw not found' };
  const result = await runShell(openclawPath, [
    'gateway',
    'call',
    method,
    '--json',
    '--params',
    JSON.stringify(params),
    '--timeout',
    String(timeout)
  ], { timeout: timeout + 5000 });
  return {
    ok: result.ok,
    data: extractJson(result.stdout || result.stderr || result.message),
    raw: result.stdout || result.stderr || result.message
  };
}

async function getOpenClawStatus() {
  const openclawPath = await resolveOpenClawPath();
  const statusCheck = openclawPath
    ? await runShell(openclawPath, ['gateway', 'status'], { timeout: 15000 })
    : { ok: false, stdout: '', stderr: '', message: 'OpenClaw not found' };
  const parsed = statusCheck.ok ? parseGatewayStatus(statusCheck.stdout) : {};
  const gatewayUrl = parsed.dashboardUrl || DEFAULT_GATEWAY_URL;
  const httpCheck = await runShell('/usr/bin/curl', ['-sS', '-m', '2', '-I', gatewayUrl]);

  return {
    installed: Boolean(openclawPath),
    path: openclawPath || 'Not found',
    version: parsed.cliVersion || 'Unknown',
    gatewayVersion: parsed.gatewayVersion || 'Unknown',
    gatewayOnline: Boolean(parsed.online || httpCheck.ok),
    gatewayUrl,
    logPath: parsed.logPath || '',
    runtime: parsed.runtime || 'Unknown',
    rawStatus: statusCheck.stdout || statusCheck.stderr || statusCheck.message,
    checkedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
}

async function getUsageCost() {
  const openclawPath = await resolveOpenClawPath();
  if (!openclawPath) {
    return { ok: false, totalCost: 'Unknown', totalTokens: 'Unknown', latestCost: 'Unknown', latestTokens: 'Unknown', raw: 'OpenClaw not found' };
  }
  const result = await runShell(openclawPath, ['gateway', 'usage-cost'], { timeout: 20000 });
  return { ok: result.ok, ...parseUsageCost(result.stdout || result.stderr || result.message) };
}

async function getHealth() {
  const result = await gatewayCall('health', {}, 20000);
  const data = result.data || {};
  const channels = Object.entries(data.channels || {}).map(([id, channel]) => ({
    id,
    configured: Boolean(channel.configured),
    enabled: channel.enabled !== false,
    connected: Boolean(channel.connected || channel.running),
    healthState: channel.healthState || (channel.running ? 'running' : 'stopped'),
    lastError: channel.lastError || ''
  }));
  const agents = Array.isArray(data.agents) ? data.agents.map((agentInfo) => ({
    id: agentInfo.agentId,
    isDefault: Boolean(agentInfo.isDefault),
    heartbeat: agentInfo.heartbeat || {},
    sessionCount: agentInfo.sessions?.count || 0,
    recent: agentInfo.sessions?.recent || []
  })) : [];
  return {
    ok: Boolean(result.ok && data.ok !== false),
    eventLoop: data.eventLoop || {},
    channels,
    agents,
    tasks: data.tasks || {},
    sessions: data.sessions || {},
    raw: result.raw
  };
}

async function getPresence() {
  const result = await gatewayCall('system-presence', {}, 15000);
  return { ok: result.ok, nodes: Array.isArray(result.data) ? result.data : [], raw: result.raw };
}

async function getAgentsConfig() {
  const openclawPath = await resolveOpenClawPath();
  if (!openclawPath) return { ok: false, agents: [], defaults: {}, raw: 'OpenClaw not found' };
  const result = await runShell(openclawPath, ['config', 'get', 'agents', '--json'], { timeout: 15000, maxBuffer: 1024 * 1024 * 10 });
  const parsed = extractJson(result.stdout || result.stderr || result.message);
  const workspace = parsed?.defaults?.workspace || DEFAULT_WORKSPACE_DIR;
  const defaults = parsed?.defaults || {};
  const agents = parsed?.list || [];
  const models = new Set();
  Object.keys(defaults.models || {}).forEach((model) => models.add(model));
  if (defaults.model?.primary) models.add(defaults.model.primary);
  agents.forEach((agent) => {
    if (agent.model) models.add(agent.model);
    Object.keys(agent.models || {}).forEach((model) => models.add(model));
  });
  return {
    ok: result.ok && Boolean(parsed),
    defaults,
    agents,
    models: [...models].filter(Boolean).sort(),
    roles: readWorkspaceRoles(workspace),
    raw: result.stdout || result.stderr || result.message
  };
}

async function getSkillsSummary() {
  const openclawPath = await resolveOpenClawPath();
  if (!openclawPath) return { ok: false, active: 0, total: 0, raw: 'OpenClaw not found' };
  const result = await runShell(openclawPath, ['skills', 'list', '--json'], { timeout: 20000, maxBuffer: 1024 * 1024 * 10 });
  const parsed = extractJson(result.stdout || result.stderr || result.message);
  const skills = Array.isArray(parsed?.skills) ? parsed.skills : [];
  const active = skills.filter((skill) => skill.eligible && !skill.disabled).length;
  return {
    ok: result.ok && Boolean(parsed),
    active,
    total: skills.length,
    raw: result.stdout || result.stderr || result.message
  };
}

async function getCronSummary() {
  const openclawPath = await resolveOpenClawPath();
  if (!openclawPath) return { ok: false, jobs: 0, failed: 0, raw: 'OpenClaw not found' };
  const result = await runShell(openclawPath, ['cron', 'list', '--json'], { timeout: 20000, maxBuffer: 1024 * 1024 * 10 });
  const parsed = extractJson(result.stdout || result.stderr || result.message);
  const jobs = Array.isArray(parsed?.jobs) ? parsed.jobs : [];
  const failed = jobs.filter((job) => {
    const state = job.state || {};
    return job.status === 'failed'
      || state.lastRunStatus === 'failed'
      || state.lastStatus === 'failed'
      || Number(state.consecutiveErrors || 0) > 0;
  }).length;
  return {
    ok: result.ok && Boolean(parsed),
    jobs: jobs.length,
    failed,
    items: jobs,
    raw: result.stdout || result.stderr || result.message
  };
}

async function setDefaultModel(model) {
  const cleanModel = String(model || '').trim();
  if (!/^[a-z0-9_-]+\/[a-z0-9._:-]+$/i.test(cleanModel)) {
    return { ok: false, model: cleanModel, output: 'Use a model ID in provider/model format.' };
  }
  const openclawPath = await resolveOpenClawPath();
  if (!openclawPath) return { ok: false, model: cleanModel, output: 'OpenClaw not found' };
  const registeredModel = cleanModel.startsWith('openai/')
    ? { agentRuntime: { id: 'codex' } }
    : {};
  const batch = [
    { path: 'agents.defaults.model.primary', value: cleanModel },
    { path: `agents.defaults.models["${cleanModel.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`, value: registeredModel, merge: true }
  ];
  const result = await runShell(openclawPath, ['config', 'set', '--batch-json', JSON.stringify(batch)], { timeout: 20000, maxBuffer: 1024 * 1024 * 10 });
  return {
    ok: result.ok,
    model: cleanModel,
    output: result.stdout || result.stderr || result.message
  };
}

function formatAttachmentContext(attachments = []) {
  const usable = attachments.filter((attachment) => attachment?.ok !== false && attachment.path);
  if (!usable.length) return '';
  const lines = usable.map((attachment) => `- ${attachment.name || path.basename(attachment.path)}: ${attachment.path}`);
  return `\n\nAttached files saved locally for this turn:\n${lines.join('\n')}\n\nUse the file paths above when you need to inspect the attachments.`;
}

async function sendAgentMessage({ message, attachments = [], sessionKey = 'agent:main:clawdesk', agent = 'main', thinking = 'medium' }) {
  const openclawPath = await resolveOpenClawPath();
  if (!openclawPath) {
    return { ok: false, text: 'OpenClaw is not installed or not on this Mac.', raw: '' };
  }
  const finalMessage = `${String(message || '').trim()}${formatAttachmentContext(attachments)}`.trim();
  const result = await runShell(openclawPath, [
    'agent',
    '--agent',
    agent,
    '--session-key',
    sessionKey,
    '--message',
    finalMessage,
    '--thinking',
    thinking,
    '--json',
    '--timeout',
    '180'
  ], { timeout: 190000, maxBuffer: 1024 * 1024 * 12 });
  const parsed = extractJson(result.stdout || result.stderr || result.message);
  const text = parsed?.result?.meta?.finalAssistantVisibleText
    || parsed?.result?.payloads?.map((payload) => payload.text).filter(Boolean).join('\n\n')
    || parsed?.summary
    || result.stderr
    || result.message
    || 'No assistant reply returned.';
  return {
    ok: result.ok && parsed?.status !== 'error',
    text,
    runId: parsed?.runId || '',
    sessionId: parsed?.result?.meta?.agentMeta?.sessionId || '',
    usage: parsed?.result?.meta?.agentMeta?.usage || null,
    model: parsed?.result?.meta?.agentMeta?.model || '',
    raw: result.stdout || result.stderr || result.message
  };
}

async function listSessions() {
  const openclawPath = await resolveOpenClawPath();
  if (!openclawPath) return { ok: false, sessions: [], raw: 'OpenClaw not found' };
  const result = await runShell(openclawPath, ['sessions', '--all-agents', '--limit', '50', '--json'], { timeout: 15000 });
  const parsed = extractJson(result.stdout || result.stderr || result.message);
  return { ok: result.ok, sessions: parsed?.sessions || parsed?.items || [], raw: result.stdout || result.stderr || result.message };
}

async function listMemoryFiles() {
  const workspaceDir = await getWorkspaceDir();
  const roots = [
    workspaceDir,
    path.join(workspaceDir, 'memory'),
    path.join(workspaceDir, 'business')
  ];
  const files = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const names = fs.readdirSync(root, { withFileTypes: true });
    for (const entry of names) {
      const fullPath = path.join(root, entry.name);
      if (entry.isFile() && /\.(md|txt|json)$/i.test(entry.name)) {
        files.push({
          name: entry.name,
          path: fullPath,
          modifiedAt: fs.statSync(fullPath).mtimeMs
        });
      }
    }
  }
  return {
    ok: true,
    workspace: workspaceDir,
    files: files.sort((a, b) => b.modifiedAt - a.modifiedAt).slice(0, 40)
  };
}

function readWorkspaceRoles(workspaceDir) {
  const candidates = [
    path.join(workspaceDir, 'TEAM.md')
  ];
  const roleFile = candidates.find((candidate) => fs.existsSync(candidate));
  if (!roleFile) return [];
  const text = fs.readFileSync(roleFile, 'utf8');
  const roles = [];
  for (const line of text.split('\n')) {
    const match = line.match(/^-\s+([A-Z][A-Za-z0-9_-]+)\s+owns\s+(.+?)\.?$/);
    if (!match) continue;
    const name = match[1];
    roles.push({ name, role: match[2].replace(/,$/, '') });
  }
  return roles;
}

async function readGatewayLog() {
  const status = await getOpenClawStatus();
  const logPath = status.logPath;
  if (!logPath || !fs.existsSync(logPath)) {
    return { ok: false, path: logPath || '', text: 'No gateway log file found from `openclaw gateway status`.' };
  }
  const text = fs.readFileSync(logPath, 'utf8').split('\n').slice(-240).join('\n');
  return { ok: true, path: logPath, text };
}

async function runGatewayAction(action) {
  const allowed = new Set(['start', 'stop', 'restart']);
  if (!allowed.has(action)) return { ok: false, action, output: 'Unsupported action' };
  const openclawPath = await resolveOpenClawPath();
  if (!openclawPath) return { ok: false, action, output: 'OpenClaw not found' };
  const result = await runShell(openclawPath, ['gateway', action], { timeout: 25000 });
  return {
    ok: result.ok,
    action,
    output: result.stdout || result.stderr || result.message,
    at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    title: 'ClawDesk',
    backgroundColor: '#f7f8fa',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('index.html');
}

app.whenReady().then(() => {
  ipcMain.handle('openclaw:status', getOpenClawStatus);
  ipcMain.handle('openclaw:usage', getUsageCost);
  ipcMain.handle('openclaw:health', getHealth);
  ipcMain.handle('openclaw:presence', getPresence);
  ipcMain.handle('openclaw:agents', getAgentsConfig);
  ipcMain.handle('openclaw:skills', getSkillsSummary);
  ipcMain.handle('openclaw:cron', getCronSummary);
  ipcMain.handle('openclaw:set-model', async (_event, model) => setDefaultModel(model));
  ipcMain.handle('openclaw:memory', listMemoryFiles);
  ipcMain.handle('openclaw:logs', readGatewayLog);
  ipcMain.handle('openclaw:send-message', async (_event, payload) => sendAgentMessage(payload));
  ipcMain.handle('openclaw:choose-attachments', async (event) => chooseChatAttachments(BrowserWindow.fromWebContents(event.sender)));
  ipcMain.handle('openclaw:sessions', listSessions);
  ipcMain.handle('openclaw:open-path', async (_event, targetPath) => {
    if (!targetPath) return { ok: false };
    await shell.openPath(targetPath);
    return { ok: true };
  });
  ipcMain.handle('openclaw:open-control-ui', async () => {
    const status = await getOpenClawStatus();
    await shell.openExternal(status.gatewayUrl || DEFAULT_GATEWAY_URL);
    return { ok: true };
  });
  ipcMain.handle('openclaw:action', async (_event, action) => runGatewayAction(action));
  ipcMain.handle('app:system', async () => ({
    appVersion: app.getVersion(),
    platform: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    workspace: await getWorkspaceDir()
  }));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
