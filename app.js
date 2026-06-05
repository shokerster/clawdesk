const views = document.querySelectorAll('.view');
const navItems = document.querySelectorAll('.nav-item');
const logOutput = document.querySelector('#logOutput');
const DEFAULT_SESSION_KEY = 'agent:main:clawdesk';
const CHAT_STORAGE_PREFIX = 'clawdesk.chat.';
const SESSION_ALIAS_STORAGE_KEY = 'clawdesk.session.aliases';
const ACTIVE_SESSION_STORAGE_KEY = 'clawdesk.activeSessionKey';
const THEME_STORAGE_KEY = 'clawdesk.theme';
const SIDEBAR_STORAGE_KEY = 'clawdesk.sidebar.collapsed';
const AUTO_ROTATE_CONTEXT_PCT = 65;

let latestStatus = null;
let latestHealth = null;
let latestUsage = null;
let latestSystem = null;
let latestAgents = null;
let latestSessions = null;
let latestSkills = null;
let latestCron = null;
let currentSessionKey = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY) || DEFAULT_SESSION_KEY;
let pendingRenameSessionKey = DEFAULT_SESSION_KEY;
let pendingAttachments = [];

function $(selector) {
  return document.querySelector(selector);
}

function setText(selector, value) {
  const node = $(selector);
  if (node) node.textContent = value ?? '';
}

function on(selector, event, handler) {
  const node = $(selector);
  if (node) node.addEventListener(event, handler);
}

function applyTheme(theme) {
  const nextTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  setText('#themeToggle', nextTheme === 'dark' ? 'Light' : 'Dark');
}

function applySidebarState(collapsed) {
  const shell = $('.app-shell');
  const toggle = $('#sidebarToggle');
  if (!shell || !toggle) return;
  shell.classList.toggle('sidebar-collapsed', collapsed);
  toggle.setAttribute('aria-expanded', String(!collapsed));
  toggle.setAttribute('aria-label', collapsed ? 'Expand menu' : 'Collapse menu');
  toggle.setAttribute('title', collapsed ? 'Expand menu' : 'Collapse menu');
  localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? 'true' : 'false');
}

function log(message) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  if (logOutput) logOutput.textContent = `${line}\n${logOutput.textContent || ''}`.slice(0, 20000);
}

function refreshAfterChatReply() {
  window.setTimeout(() => {
    Promise.all([refreshUsage(), refreshSessions()])
      .catch((error) => log(`Post-chat refresh failed: ${error.message}`));
  }, 50);
}

function showView(name) {
  views.forEach((view) => view.classList.toggle('active', view.id === `view-${name}`));
  navItems.forEach((item) => item.classList.toggle('active', item.dataset.view === name));
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[<>&]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[char]);
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, '&quot;');
}

function prettyDate(value) {
  if (!value) return '';
  const number = Number(value);
  const date = Number.isFinite(number) ? new Date(number) : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function compactNodeName(value) {
  const text = String(value || 'Node').trim();
  if (/^telegram native approvals/i.test(text)) return 'Telegram Approvals';
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(text)) return text;
  return text.replace(/\s*\(default\)\s*$/i, '').replace(/\bNative\b/i, '').replace(/\s+/g, ' ').trim();
}

function nodeRole(node) {
  const mode = String(node.mode || '').toLowerCase();
  if (mode === 'gateway') return 'Gateway';
  if (mode === 'backend') return 'Backend';
  if (mode === 'probe') return 'CLI probe';
  return node.mode ? node.mode : 'Node';
}

function nodeDetail(node) {
  const role = nodeRole(node);
  if (role === 'Gateway') {
    const app = node.app || String(node.text || '').match(/app\s+([^\s·]+)/i)?.[1];
    return app ? `Local gateway · app ${app}` : 'Local gateway node';
  }
  if (role === 'CLI probe') return 'Command-line probe';
  if (compactNodeName(node.host || node.name || node.id) === 'Telegram Approvals') return 'Approval backend';
  const detail = node.platform || node.text || '';
  return String(detail).replace(/\s+/g, ' ').trim();
}

function updateClock() {
  setText('#threadClock', new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
}

function renderDl(selector, rows) {
  const container = $(selector);
  if (!container) return;
  container.innerHTML = rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
}

function renderList(container, items, emptyText) {
  if (!container) return;
  if (!items.length) {
    container.textContent = emptyText;
    return;
  }
  container.innerHTML = items.join('');
}

function compactDetail(parts) {
  return parts.filter(Boolean).join(' · ') || '--';
}

function formatMsDuration(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return '';
  const minutes = Math.round(value / 60000);
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function formatCronSchedule(schedule = {}) {
  if (schedule.kind === 'every') return `Every ${formatMsDuration(schedule.everyMs) || 'interval'}`;
  if (schedule.kind === 'cron') return `${schedule.expr || 'cron'}${schedule.tz ? ` · ${schedule.tz}` : ''}`;
  return schedule.kind || 'Manual schedule';
}

function cronStatus(job) {
  const state = job.state || {};
  if (!job.enabled) return 'disabled';
  if (job.status === 'failed' || state.lastRunStatus === 'failed' || state.lastStatus === 'failed' || Number(state.consecutiveErrors || 0) > 0) return 'failed';
  return job.status || state.lastStatus || 'ok';
}

function renderCronJobs(result) {
  const jobs = Array.isArray(result.items) ? result.items : [];
  const enabled = jobs.filter((job) => job.enabled).length;
  const failed = Number(result.failed || 0);
  const nextJobs = jobs
    .filter((job) => job.enabled && Number(job.state?.nextRunAtMs || 0) > 0)
    .sort((a, b) => Number(a.state.nextRunAtMs) - Number(b.state.nextRunAtMs));
  setText('#cronsTotal', String(jobs.length));
  setText('#cronsEnabled', String(enabled));
  setText('#cronsFailed', String(failed));
  setText('#cronsNextRun', nextJobs[0] ? prettyDate(nextJobs[0].state.nextRunAtMs) : '--');
  setText('#cronsNextJob', nextJobs[0]?.name || (jobs.length ? 'No upcoming run returned' : 'No cron jobs returned'));

  const rows = jobs.map((job) => {
    const state = job.state || {};
    const status = cronStatus(job);
    const statusClass = status === 'failed' ? 'bad' : status === 'disabled' ? 'muted' : 'good';
    return `
      <article class="cron-card ${statusClass}">
        <div class="panel-title">
          <div>
            <strong>${escapeHtml(job.name || job.id || 'Cron job')}</strong>
            <small>${escapeHtml(job.id || '')}</small>
          </div>
          <span class="status-badge ${statusClass === 'bad' ? 'muted' : statusClass}">${escapeHtml(status)}</span>
        </div>
        <p>${escapeHtml(job.description || 'No description provided.')}</p>
        <dl>
          <div><dt>Schedule</dt><dd>${escapeHtml(formatCronSchedule(job.schedule))}</dd></div>
          <div><dt>Next run</dt><dd>${escapeHtml(prettyDate(state.nextRunAtMs) || '--')}</dd></div>
          <div><dt>Last run</dt><dd>${escapeHtml(prettyDate(state.lastRunAtMs) || '--')}</dd></div>
          <div><dt>Last status</dt><dd>${escapeHtml(state.lastRunStatus || state.lastStatus || job.status || '--')}</dd></div>
          <div><dt>Agent</dt><dd>${escapeHtml(job.agentId || '--')}</dd></div>
          <div><dt>Delivery</dt><dd>${escapeHtml(job.delivery?.mode || state.lastDeliveryStatus || 'not configured')}</dd></div>
        </dl>
      </article>
    `;
  });
  renderList($('#cronsList'), rows, result.ok ? 'No cron jobs returned.' : (result.raw || 'Cron data unavailable.'));
}

function collectModelOptions(agentsConfig = latestAgents) {
  const models = new Set();
  (agentsConfig?.models || []).forEach((model) => models.add(model));
  Object.keys(agentsConfig?.defaults?.models || {}).forEach((model) => models.add(model));
  if (agentsConfig?.defaults?.model?.primary) models.add(agentsConfig.defaults.model.primary);
  (agentsConfig?.agents || []).forEach((agent) => {
    if (agent.model) models.add(agent.model);
    Object.keys(agent.models || {}).forEach((model) => models.add(model));
  });
  return [...models].filter(Boolean).sort();
}

function renderModelSettings(agentsConfig = latestAgents) {
  const select = $('#modelSelect');
  if (!select || !agentsConfig) return;
  const current = agentsConfig.defaults?.model?.primary || '';
  const models = collectModelOptions(agentsConfig);
  select.innerHTML = '';
  models.forEach((model) => {
    const option = document.createElement('option');
    option.value = model;
    option.textContent = model;
    select.append(option);
  });
  if (!models.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = agentsConfig.ok === false ? 'OpenClaw config unavailable' : 'No configured models';
    select.append(option);
  } else if (current && !models.includes(current)) {
    select.prepend(Object.assign(document.createElement('option'), { value: current, textContent: current }));
  }
  select.value = current || models[0] || '';
  setText('#modelCurrentBadge', current ? current.replace(/^openai\//, '') : 'Not set');
  setText('#modelSaveStatus', models.length
    ? `${models.length} configured model${models.length === 1 ? '' : 's'} available. Changes apply to new OpenClaw runs.`
    : (agentsConfig.raw || 'No models were returned by OpenClaw config.'));
  const customInput = $('#modelCustomInput');
  if (customInput && !customInput.value) customInput.placeholder = current || 'provider/model';
}

function updateDashboardMetrics() {
  if (latestUsage) {
    setText('#dashboardUsage', latestUsage.latestTokens && latestUsage.latestTokens !== 'Unknown' ? latestUsage.latestTokens : '--');
    setText('#dashboardUsageDetail', compactDetail([latestUsage.latestDay && latestUsage.latestDay !== 'Unknown' ? latestUsage.latestDay : 'Latest day', latestUsage.latestCost && latestUsage.latestCost !== 'Unknown' ? latestUsage.latestCost : 'cost pending']));
  }

  if (latestSessions) {
    const sessions = Array.isArray(latestSessions.sessions) ? latestSessions.sessions : [];
    const recentKeys = sessions.slice(0, 2).map((session) => session.key || session.sessionKey || session.id).filter(Boolean).map(sessionLabel);
    setText('#dashboardSessions', String(sessions.length));
    setText('#dashboardSessionsDetail', recentKeys.length ? recentKeys.join(' · ') : 'No recent sessions returned.');
  } else if (latestHealth) {
    const sessionCount = latestHealth.sessions?.count ?? latestHealth.agents?.reduce((sum, agent) => sum + (agent.sessionCount || 0), 0) ?? '--';
    setText('#dashboardSessions', String(sessionCount));
  }

  if (latestSkills) {
    setText('#dashboardSkills', latestSkills.total ? `${latestSkills.active}/${latestSkills.total}` : '--');
    setText('#dashboardSkillsDetail', latestSkills.total ? `${latestSkills.active} active` : 'No skill registry returned');
  }

  if (latestCron) {
    setText('#dashboardCron', latestCron.jobs ? `${latestCron.jobs} jobs` : '0 jobs');
    const failed = Number(latestCron.failed || 0);
    const detail = failed ? `${failed} failed` : 'all ok';
    setText('#dashboardCronDetail', detail);
    $('#dashboardCronDetail')?.classList.toggle('danger-text', failed > 0);
  }

  if (latestAgents || latestStatus) {
    const defaultAgent = (latestAgents?.agents || []).find((agent) => agent.id === 'main') || (latestAgents?.agents || [])[0];
    const model = defaultAgent?.model || latestAgents?.defaults?.model?.primary || latestStatus?.version || '';
    const ok = Boolean(model && model !== 'Unknown' && latestStatus?.gatewayOnline !== false);
    setText('#dashboardModelAuth', ok ? '1 ok' : 'Check');
    setText('#dashboardModelAuthDetail', compactDetail([model ? model.replace(/^openai\//, '') : 'model missing', latestStatus?.gatewayOnline ? 'gateway online' : 'gateway offline']));
  }
}

function chatStorageKey(sessionKey = currentSessionKey) {
  return `${CHAT_STORAGE_PREFIX}${sessionKey.replace(/[^a-z0-9:_-]/gi, '-')}`;
}

function loadSessionAliases() {
  try {
    const aliases = JSON.parse(localStorage.getItem(SESSION_ALIAS_STORAGE_KEY) || '{}');
    return aliases && typeof aliases === 'object' && !Array.isArray(aliases) ? aliases : {};
  } catch {
    localStorage.removeItem(SESSION_ALIAS_STORAGE_KEY);
    return {};
  }
}

function saveSessionAliases(aliases) {
  localStorage.setItem(SESSION_ALIAS_STORAGE_KEY, JSON.stringify(aliases));
}

function sessionLabel(sessionKey) {
  return loadSessionAliases()[sessionKey] || sessionKey;
}

function generateClawDeskSessionKey() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `${DEFAULT_SESSION_KEY}:${stamp}`;
}

function isCompactionFailure(reply) {
  const text = `${reply?.text || ''}\n${reply?.raw || ''}`;
  return /CLI transcript compaction failed|Summarization failed|Connection error/i.test(text);
}

function findSessionByKey(sessions, key) {
  return (sessions || []).find((session) => (session.key || session.sessionKey || session.id) === key);
}

function resetContextMeter(label = 'New session') {
  const meter = $('#contextMeter');
  if (meter) meter.style.width = '0%';
  setText('#contextTokens', label);
  setText('#contextWindow', 'Pending first reply');
}

function applySessionRename(sessionKey, label) {
  const key = sessionKey || currentSessionKey;
  const aliases = loadSessionAliases();
  const cleanLabel = String(label || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!cleanLabel || cleanLabel === key) {
    delete aliases[key];
  } else {
    aliases[key] = cleanLabel;
  }
  saveSessionAliases(aliases);
  renderSessions(latestSessions);
  setActiveSession(currentSessionKey);
  log(cleanLabel && cleanLabel !== key ? `Renamed session ${key} to ${cleanLabel}` : `Cleared session name for ${key}`);
}

function openRenameSession(sessionKey) {
  const key = sessionKey || currentSessionKey;
  pendingRenameSessionKey = key;
  const aliases = loadSessionAliases();
  const modal = $('#renameSessionModal');
  const input = $('#renameSessionInput');
  setText('#renameSessionKey', key);
  if (input) input.value = aliases[key] || '';
  if (modal) modal.hidden = false;
  requestAnimationFrame(() => {
    input?.focus();
    input?.select();
  });
}

function closeRenameSession() {
  const modal = $('#renameSessionModal');
  if (modal) modal.hidden = true;
}

function introMessage(sessionKey = currentSessionKey) {
  const message = document.createElement('article');
  message.className = 'message assistant-message';
  message.innerHTML = `
    <p>This chat sends real messages through the local OpenClaw CLI into a ClawDesk session.</p>
    <time>Ready</time>
  `;
  return message;
}

function setActiveSession(sessionKey, { clear = false } = {}) {
  currentSessionKey = sessionKey || DEFAULT_SESSION_KEY;
  localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, currentSessionKey);
  const select = $('#conversationSelect');
  if (select) {
    const hasOption = [...select.options].some((option) => option.value === currentSessionKey);
    if (!hasOption) {
      const option = document.createElement('option');
      option.value = currentSessionKey;
      option.textContent = sessionLabel(currentSessionKey);
      option.title = currentSessionKey;
      select.prepend(option);
    }
    select.value = currentSessionKey;
  }
  if (clear) {
    const messages = $('#messages');
    messages.innerHTML = '';
    messages.append(introMessage(currentSessionKey));
    saveChat();
    scrollChatToBottom();
  } else {
    loadChat();
  }
}

function startNewSession({ reason = '' } = {}) {
  const nextSessionKey = generateClawDeskSessionKey();
  setActiveSession(nextSessionKey, { clear: true });
  resetContextMeter();
  $('#chatInput')?.focus();
  log(`Started new session ${currentSessionKey}${reason ? ` (${reason})` : ''}`);
  return nextSessionKey;
}

function saveChat() {
  const records = [...document.querySelectorAll('#messages .message')].map((message) => ({
    role: message.classList.contains('user-message') ? 'user' : 'assistant',
    text: message.querySelector('p')?.textContent || '',
    time: message.querySelector('time')?.textContent || ''
  }));
  localStorage.setItem(chatStorageKey(), JSON.stringify(records.slice(-60)));
}

function scrollChatToBottom() {
  const messages = $('#messages');
  if (!messages) return;
  requestAnimationFrame(() => {
    messages.scrollTop = messages.scrollHeight;
  });
}

function appendMessage(role, text, detail = '') {
  const message = document.createElement('article');
  message.className = `message ${role === 'user' ? 'user-message' : 'assistant-message'}`;
  const detailHtml = detail ? `<small>${escapeHtml(detail)}</small>` : '';
  message.innerHTML = `<p>${escapeHtml(text)}</p>${detailHtml}<time>${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>`;
  $('#messages').append(message);
  scrollChatToBottom();
  saveChat();
  return message;
}

function attachmentDetail(attachments = []) {
  const usable = attachments.filter((attachment) => attachment?.ok !== false && attachment.path);
  if (!usable.length) return '';
  return `Attached: ${usable.map((attachment) => attachment.name || attachment.path.split('/').pop()).join(', ')}`;
}

function renderAttachmentTray() {
  const tray = $('#attachmentTray');
  if (!tray) return;
  const usable = pendingAttachments.filter((attachment) => attachment?.ok !== false && attachment.path);
  tray.hidden = usable.length === 0;
  tray.innerHTML = usable.map((attachment, index) => `
    <button class="attachment-chip" type="button" data-remove-attachment="${index}" title="${escapeAttr(attachment.path)}">
      <span>${escapeHtml(attachment.name || attachment.path.split('/').pop())}</span>
      <small>${escapeHtml(formatBytes(attachment.size))}</small>
      <strong aria-hidden="true">×</strong>
    </button>
  `).join('');
}

function clearAttachments() {
  pendingAttachments = [];
  renderAttachmentTray();
}

function loadChat() {
  const stored = localStorage.getItem(chatStorageKey());
  const messages = $('#messages');
  if (!stored) {
    messages.innerHTML = '';
    messages.append(introMessage(currentSessionKey));
    scrollChatToBottom();
    return;
  }
  try {
    const records = JSON.parse(stored);
    messages.innerHTML = '';
    records.forEach((record) => {
      const message = document.createElement('article');
      message.className = `message ${record.role === 'user' ? 'user-message' : 'assistant-message'}`;
      message.innerHTML = `<p>${escapeHtml(record.text)}</p><time>${escapeHtml(record.time || '')}</time>`;
      messages.append(message);
    });
    scrollChatToBottom();
  } catch {
    localStorage.removeItem(chatStorageKey());
    messages.innerHTML = '';
    messages.append(introMessage(currentSessionKey));
    scrollChatToBottom();
  }
}

async function refreshStatus() {
  const status = await window.clawdesk.getStatus();
  latestStatus = status;
  const installedText = status.installed ? 'Installed' : 'Missing';
  const openClawVersion = status.version && status.version !== 'Unknown' ? `v${status.version}` : 'Version unknown';
  const gatewayText = status.gatewayOnline ? 'Online' : 'Offline';

  setText('#openclawState', status.installed ? `${installedText} · ${openClawVersion}` : installedText);
  setText('#gatewayState', gatewayText);
  setText('#versionState', status.version || 'Unknown');
  setText('#sidebarHealth', status.installed && status.gatewayOnline ? 'System healthy' : 'Needs attention');
  setText('#sidebarPath', status.path);
  setText('#dashboardOpenClawVersion', status.installed ? openClawVersion : 'Missing');
  setText('#dashboardOpenClawVersionDetail', status.path || 'OpenClaw CLI not found');
  setText('#dashboardGateway', gatewayText);
  setText('#dashboardEndpoint', status.gatewayUrl);
  setText('#gatewayLogPath', status.logPath || 'No log path found');
  setText('#inspectorRuntime', status.runtime || 'Unknown');
  setText('#inspectorDashboard', status.gatewayUrl || 'Unknown');
  setText('#threadStatus', status.gatewayOnline ? 'Online through local OpenClaw' : 'Gateway offline');
  setText('#logFilePath', status.logPath || 'Log path pending');

  $('#gatewayDot').className = `dot ${status.gatewayOnline ? 'ok' : 'red'}`;
  $('#openclawDot').className = `dot ${status.installed ? 'ok' : 'red'}`;
  $('#modelDot').className = `dot ${status.version ? 'ok' : 'red'}`;
  $('#sidebarDot').className = `dot ${status.installed && status.gatewayOnline ? 'ok' : 'red'}`;
  $('#threadDot').className = `dot ${status.gatewayOnline ? 'ok' : 'red'}`;

  updateDashboardMetrics();
  log(`Status: OpenClaw ${installedText}, Gateway ${gatewayText}, runtime ${status.runtime}`);
  return status;
}

async function refreshUsage() {
  const usage = await window.clawdesk.getUsage();
  latestUsage = usage;
  const missing = Number(usage.missingEntries || 0);
  const latestTokens = usage.latestTokens || '--';
  const costIncomplete = missing > 0;
  setText('#topUsageLabel', costIncomplete ? 'Tokens seen' : 'Latest cost');
  setText('#topUsageCost', costIncomplete ? latestTokens : (usage.latestCost || '$--'));
  setText('#inspectorTotalCost', usage.totalCost || '$--');
  setText('#inspectorLatestCost', usage.latestCost || '$--');
  setText('#inspectorLatestTokens', usage.latestTokens || '--');
  setText('#usageLatestCost', costIncomplete ? 'Estimate' : (usage.latestCost || '$--'));
  setText('#usageLatestTokens', `${usage.latestTokens || '--'} tokens`);
  setText('#usageTotalCost', usage.totalCost || '$--');
  setText('#usageTotalTokens', `${usage.totalTokens || '--'} tokens`);
  setText('#usageMissingEntries', usage.missingEntries || '--');
  setText('#usageNotice', costIncomplete
    ? `Cost data is incomplete: OpenClaw reports ${missing.toLocaleString()} missing entries, so costs are estimates. Token counts are safer than the dollar number.`
    : 'Usage data is coming from openclaw gateway usage-cost.');
  setText('#usageLatestDay', usage.latestDay || 'Latest day');
  setText('#usageTableLatestTokens', usage.latestTokens || '--');
  setText('#usageTableLatestCost', usage.latestCost || '$--');
  setText('#usageTableTotalTokens', usage.totalTokens || '--');
  setText('#usageTableTotalCost', usage.totalCost || '$--');
  setText('#usageTableMissing', `Missing entries: ${usage.missingEntries || '--'}`);
  updateDashboardMetrics();
  log(`Usage: latest ${usage.latestCost || 'unknown'}, 30 days ${usage.totalCost || 'unknown'}`);
  return usage;
}

async function refreshHealth() {
  const health = await window.clawdesk.getHealth();
  latestHealth = health;
  const activeTasks = health.tasks?.active ?? 0;
  const totalTasks = health.tasks?.total ?? 0;
  const sessionCount = health.sessions?.count ?? health.agents?.reduce((sum, agent) => sum + (agent.sessionCount || 0), 0) ?? '--';
  const channels = health.channels || [];
  const connectedChannels = channels.filter((channel) => channel.connected).length;

  setText('#dashboardTasks', String(activeTasks));
  setText('#dashboardTaskDetail', `${totalTasks} total tracked tasks`);
  setText('#dashboardSessions', String(sessionCount));
  setText('#dashboardChannels', `${connectedChannels}/${channels.length}`);
  setText('#dashboardChannelDetail', channels.length ? channels.map((channel) => `${channel.id}: ${channel.healthState}`).join(' · ') : 'No channel data returned');
  setText('#usageHealth', health.ok ? 'OK' : 'Check');
  setText('#usageHealthDetail', health.eventLoop?.degraded ? 'Event loop degraded' : 'Gateway health API returned');

  updateDashboardMetrics();
  log(`Health: ${health.ok ? 'ok' : 'check required'}, ${activeTasks} active tasks`);
  return health;
}

async function refreshPresence() {
  const result = await window.clawdesk.getPresence();
  const uniqueNodes = [];
  const seen = new Map();
  (result.nodes || []).forEach((node) => {
    const name = compactNodeName(node.host || node.name || node.id);
    const role = nodeRole(node);
    const key = `${name}|${role}|${nodeDetail(node)}`;
    if (seen.has(key)) {
      seen.get(key).count += 1;
      return;
    }
    const record = { ...node, name, role, detail: nodeDetail(node), count: 1 };
    seen.set(key, record);
    uniqueNodes.push(record);
  });
  setText('#nodeCount', String(uniqueNodes.length));
  const rows = uniqueNodes.map((node) => `
    <article class="node-tile">
      <div class="node-main">
        <span class="node-icon">${escapeHtml(node.role.slice(0, 1).toUpperCase())}</span>
        <div>
          <strong>${escapeHtml(node.name || 'Node')}</strong>
          <span>${escapeHtml(node.detail || 'OpenClaw node detected')}</span>
        </div>
      </div>
      <div class="node-meta">
        <span class="node-chip">${escapeHtml(node.role)}</span>
        ${node.count > 1 ? `<span class="node-chip muted-chip">${node.count} seen</span>` : ''}
      </div>
    </article>
  `);
  renderList($('#presenceList'), rows, 'No Gateway nodes detected.');
  log(`Presence: ${uniqueNodes.length} nodes`);
  return result;
}

async function refreshAgents() {
  const [result, health] = await Promise.all([
    window.clawdesk.getAgents(),
    latestHealth ? Promise.resolve(latestHealth) : window.clawdesk.getHealth()
  ]);
  latestHealth = health;
  latestAgents = result;
  const healthById = new Map((health.agents || []).map((agent) => [agent.agentId || agent.id, agent]));
  const rows = (result.agents || []).map((agent) => {
    const model = agent.model || result.defaults?.model?.primary || 'default';
    const workspace = agent.workspace || result.defaults?.workspace || 'workspace not set';
    const healthAgent = healthById.get(agent.id) || {};
    const sessionCount = healthAgent.sessions?.count ?? 0;
    const heartbeatEnabled = Boolean(healthAgent.heartbeat?.enabled);
    const isActive = agent.id === 'main' || sessionCount > 0 || heartbeatEnabled;
    const status = isActive ? 'Active' : 'Inactive';
    const title = agent.id === 'main'
      ? (agent.identity?.name || agent.name || 'Agent')
      : (agent.name || agent.id);
    const identityName = agent.identity?.name && agent.identity.name !== title ? agent.identity.name : '';
    return `
      <article class="data-card agent-card ${isActive ? 'active-agent' : 'inactive-agent'}">
        <div class="panel-title">
          <div>
            <strong>${escapeHtml(title)}</strong>
            <small>${escapeHtml(identityName || agent.id)}</small>
          </div>
          <span class="status-badge ${isActive ? 'good' : 'muted'}">${status}</span>
        </div>
        <dl>
          <div><dt>Model</dt><dd>${escapeHtml(model)}</dd></div>
          <div><dt>Sessions</dt><dd>${escapeHtml(sessionCount ? `${sessionCount}` : '0')}</dd></div>
          <div><dt>Heartbeat</dt><dd>${escapeHtml(heartbeatEnabled ? healthAgent.heartbeat?.every || 'enabled' : 'disabled')}</dd></div>
          <div><dt>Workspace</dt><dd>${escapeHtml(workspace)}</dd></div>
          <div><dt>Agent dir</dt><dd>${escapeHtml(agent.agentDir || 'default')}</dd></div>
        </dl>
      </article>
    `;
  });
  const teamRoles = Array.isArray(result.roles) ? result.roles : [];
  const teamRows = teamRoles.map(({ name, role }) => `
    <article class="data-card team-card">
      <div class="panel-title">
        <strong>${escapeHtml(name)}</strong>
        <span class="status-badge role">Team role</span>
      </div>
      <p>${escapeHtml(role)}</p>
    </article>
  `);
  const agentsContainer = $('#agentsList');
  if (agentsContainer) {
    agentsContainer.innerHTML = `
      <section class="agent-section">
        <div class="section-title">
          <strong>Configured agents</strong>
          <span>${escapeHtml((result.agents || []).length)} on this Mac</span>
        </div>
        <div class="data-grid">${rows.join('') || '<p>No agents returned from OpenClaw config.</p>'}</div>
      </section>
      ${teamRows.length ? `<section class="agent-section">
        <div class="section-title">
          <strong>Workspace roles</strong>
          <span>Available as role context, not configured agents</span>
        </div>
        <div class="data-grid">${teamRows.join('')}</div>
      </section>` : ''}
    `;
  }
  const defaultAgent = (result.agents || []).find((agent) => agent.id === 'main') || (result.agents || [])[0];
  const agentName = defaultAgent?.identity?.name || defaultAgent?.name || defaultAgent?.id || 'Default agent';
  const model = defaultAgent?.model || result.defaults?.model?.primary || 'Unknown';
  setText('#activeAgent', agentName);
  setText('#versionState', model.replace(/^openai\//, ''));
  $('#modelDot').className = `dot ${model !== 'Unknown' ? 'ok' : 'red'}`;
  renderModelSettings(result);
  updateDashboardMetrics();
  log(`Agents: ${(result.agents || []).length} configured`);
  return result;
}

async function refreshSkills() {
  const result = await window.clawdesk.getSkills();
  latestSkills = result;
  updateDashboardMetrics();
  log(`Skills: ${result.active || 0}/${result.total || 0} active`);
  return result;
}

async function refreshCron() {
  const result = await window.clawdesk.getCron();
  latestCron = result;
  renderCronJobs(result);
  updateDashboardMetrics();
  log(`Cron: ${result.jobs || 0} jobs, ${result.failed || 0} failed`);
  return result;
}

async function refreshSessions() {
  const result = await window.clawdesk.listSessions();
  latestSessions = result;
  renderSessions(result);
  updateDashboardMetrics();
  log(`Sessions: ${Array.isArray(result.sessions) ? result.sessions.length : 0} loaded`);
  return result;
}

function renderSessions(result = latestSessions) {
  if (!result) return;
  const sessions = Array.isArray(result.sessions) ? result.sessions : [];
  const select = $('#conversationSelect');
  if (select) {
    select.innerHTML = sessions.slice(0, 20).map((session) => {
      const key = session.key || session.sessionKey || session.id || 'session';
      const selected = key === currentSessionKey ? ' selected' : '';
      const label = sessionLabel(key);
      return `<option value="${escapeAttr(key)}" title="${escapeAttr(key)}"${selected}>${escapeHtml(label)}</option>`;
    }).join('') || '<option>No sessions returned</option>';
    setActiveSession(currentSessionKey);
  }

  const pageRows = sessions.map((session) => {
    const key = session.key || session.sessionKey || session.id || 'session';
    const label = sessionLabel(key);
    const hasAlias = label !== key;
    return `
      <article class="data-row">
        <div class="session-name-cell">
          <strong>${escapeHtml(label)}</strong>
          ${hasAlias ? `<small>${escapeHtml(key)}</small>` : ''}
        </div>
        <span>${escapeHtml(prettyDate(session.updatedAt))}</span>
        <div class="session-actions-cell">
          <small>${escapeHtml(session.model || '')} ${escapeHtml(session.totalTokens ? `${session.totalTokens} tokens` : '')}</small>
          <button class="small-button" type="button" data-rename-session="${escapeAttr(key)}">Rename</button>
        </div>
      </article>
    `;
  });
  renderList($('#sessionsPageList'), pageRows, 'No sessions returned.');
  $('#sessionsPageList')?.querySelectorAll('[data-rename-session]').forEach((button) => {
    button.addEventListener('click', () => openRenameSession(button.dataset.renameSession));
  });
  const selectedSession = findSessionByKey(sessions, currentSessionKey);
  const clawdeskSession = selectedSession || (currentSessionKey === DEFAULT_SESSION_KEY ? findSessionByKey(sessions, DEFAULT_SESSION_KEY) : null) || (currentSessionKey === DEFAULT_SESSION_KEY ? sessions[0] : null);
  if (clawdeskSession) {
    const total = Number(clawdeskSession.totalTokens || 0);
    const windowTokens = Number(clawdeskSession.contextTokens || 272000);
    const pct = windowTokens ? Math.min(100, Math.round((total / windowTokens) * 100)) : 0;
    $('#contextMeter').style.width = `${pct}%`;
    setText('#contextTokens', total ? `${total.toLocaleString()} tokens` : 'No token data');
    setText('#contextWindow', windowTokens ? `${windowTokens.toLocaleString()} tokens` : 'Unknown');

    if ((clawdeskSession.key || clawdeskSession.sessionKey || clawdeskSession.id) === currentSessionKey && pct >= AUTO_ROTATE_CONTEXT_PCT) {
      startNewSession({ reason: 'previous context was near full' });
    }
  } else {
    resetContextMeter();
  }
}

async function refreshMemory() {
  const result = await window.clawdesk.getMemory();
  const rows = (result.files || []).map((file) => `
    <article class="data-row">
      <strong>${escapeHtml(file.name)}</strong>
      <span>${escapeHtml(file.path)}</span>
      <button class="small-button" data-open-path="${escapeHtml(file.path)}">Open</button>
    </article>
  `);
  renderList($('#memoryList'), rows, 'No memory files found.');
  $('#memoryList').querySelectorAll('[data-open-path]').forEach((button) => {
    button.addEventListener('click', () => window.clawdesk.openPath(button.dataset.openPath));
  });
  log(`Memory: ${(result.files || []).length} files listed`);
  return result;
}

async function refreshLogs() {
  const result = await window.clawdesk.getLogs();
  setText('#logFilePath', result.path || 'No log path found');
  setText('#gatewayLogOutput', result.text || 'No log output returned.');
  log(`Logs: ${result.ok ? 'loaded' : 'not available'}`);
  return result;
}

async function refreshSettings() {
  const [status, system, agents] = await Promise.all([
    latestStatus ? Promise.resolve(latestStatus) : window.clawdesk.getStatus(),
    window.clawdesk.getSystem(),
    window.clawdesk.getAgents()
  ]);
  latestSystem = system;
  latestAgents = agents;
  renderModelSettings(agents);
  renderDl('#settingsOpenClaw', [
    ['CLI path', status.path],
    ['CLI version', status.version],
    ['Gateway version', status.gatewayVersion],
    ['Dashboard URL', status.gatewayUrl],
    ['Runtime', status.runtime],
    ['Log path', status.logPath || 'Not detected']
  ]);
  renderDl('#settingsApp', [
    ['ClawDesk version', system.appVersion],
    ['Platform', system.platform],
    ['Architecture', system.arch],
    ['Workspace', system.workspace]
  ]);
  const defaultAgent = (agents.agents || []).find((agent) => agent.id === 'main') || (agents.agents || [])[0];
  const model = defaultAgent?.model || agents.defaults?.model?.primary || 'Unknown';
  setText('#aboutVersion', system.appVersion);
  setText('#aboutPlatform', system.platform);
  setText('#aboutArch', system.arch);
  setText('#aboutCliPath', status.path);
  setText('#aboutCliVersion', status.version);
  setText('#aboutGateway', status.gatewayOnline ? `Online · ${status.gatewayUrl}` : 'Offline');
  setText('#aboutWorkspace', system.workspace);
  setText('#aboutModel', model);
}

async function refreshAll() {
  try {
    await refreshStatus();
    await Promise.all([
      refreshUsage(),
      refreshHealth(),
      refreshPresence(),
      refreshAgents(),
      refreshSkills(),
      refreshCron(),
      refreshSessions(),
      refreshMemory(),
      refreshLogs(),
      refreshSettings()
    ]);
  } catch (error) {
    log(`Refresh failed: ${error.message}`);
  }
}

navItems.forEach((item) => {
  item.addEventListener('click', () => showView(item.dataset.view));
});

document.querySelectorAll('[data-jump]').forEach((button) => {
  button.addEventListener('click', () => showView(button.dataset.jump));
});

on('#refreshAll', 'click', refreshAll);
on('#refreshUsage', 'click', refreshUsage);
on('#refreshDashboard', 'click', async () => {
  await Promise.all([refreshStatus(), refreshUsage(), refreshHealth(), refreshPresence(), refreshAgents(), refreshSkills(), refreshCron(), refreshSessions()]);
});
on('#refreshAgents', 'click', refreshAgents);
on('#refreshSessionsPage', 'click', refreshSessions);
on('#refreshCrons', 'click', refreshCron);
on('#refreshLogs', 'click', refreshLogs);
on('#refreshSettings', 'click', refreshSettings);
on('#refreshAbout', 'click', refreshSettings);
on('#modelSelect', 'change', () => {
  const input = $('#modelCustomInput');
  if (input) input.value = '';
});
on('#modelForm', 'submit', async (event) => {
  event.preventDefault();
  const model = ($('#modelCustomInput')?.value || $('#modelSelect')?.value || '').trim();
  const button = $('#saveModelButton');
  if (!model) return;
  button.disabled = true;
  button.textContent = 'Saving';
  setText('#modelSaveStatus', `Saving ${model}...`);
  try {
    const result = await window.clawdesk.setModel(model);
    if (!result.ok) throw new Error(result.output || 'Model save failed');
    setText('#modelSaveStatus', `Saved ${result.model}. New OpenClaw runs will use this default model.`);
    $('#modelCustomInput').value = '';
    latestAgents = await refreshAgents();
    await refreshSettings();
    log(`Model changed to ${result.model}`);
  } catch (error) {
    setText('#modelSaveStatus', error.message);
    log(`Model change failed: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = 'Save model';
  }
});
on('#themeToggle', 'click', () => {
  const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark');
});
on('#sidebarToggle', 'click', () => {
  applySidebarState(!$('.app-shell')?.classList.contains('sidebar-collapsed'));
});
on('#openWorkspace', 'click', async () => {
  latestSystem = latestSystem || await window.clawdesk.getSystem();
  window.clawdesk.openPath(latestSystem?.workspace || '');
});
on('#openMemoryFolder', 'click', async () => {
  latestSystem = latestSystem || await window.clawdesk.getSystem();
  window.clawdesk.openPath(latestSystem?.workspace || '');
});
on('#conversationSelect', 'change', (event) => {
  setActiveSession(event.target.value);
  log(`Selected session ${currentSessionKey}`);
});
on('#renameSessionButton', 'click', () => {
  openRenameSession(currentSessionKey);
});
on('#cancelRenameSession', 'click', closeRenameSession);
on('#clearRenameSession', 'click', () => {
  applySessionRename(pendingRenameSessionKey, '');
  closeRenameSession();
});
on('#renameSessionModal', 'click', (event) => {
  if (event.target.id === 'renameSessionModal') closeRenameSession();
});
on('#renameSessionForm', 'submit', (event) => {
  event.preventDefault();
  applySessionRename(pendingRenameSessionKey, $('#renameSessionInput')?.value || '');
  closeRenameSession();
});
on('#newSessionButton', 'click', () => {
  startNewSession();
});

on('#openControlUi', 'click', async () => {
  await window.clawdesk.openControlUi();
  log('Opened local OpenClaw control UI');
});

on('#attachFiles', 'click', async () => {
  const button = $('#attachFiles');
  button.disabled = true;
  try {
    const result = await window.clawdesk.chooseAttachments();
    const accepted = (result.attachments || []).filter((attachment) => attachment.ok !== false && attachment.path);
    const rejected = (result.attachments || []).filter((attachment) => attachment.ok === false);
    pendingAttachments = [...pendingAttachments, ...accepted].slice(0, 10);
    renderAttachmentTray();
    if (accepted.length) log(`Attached ${accepted.length} file${accepted.length === 1 ? '' : 's'} to chat`);
    rejected.forEach((attachment) => log(`Attachment skipped: ${attachment.name || attachment.path} (${attachment.error || 'unsupported file'})`));
    $('#chatInput')?.focus();
  } catch (error) {
    log(`Attachment picker failed: ${error.message}`);
  } finally {
    button.disabled = false;
  }
});

on('#attachmentTray', 'click', (event) => {
  const removeButton = event.target.closest('[data-remove-attachment]');
  if (!removeButton) return;
  const index = Number(removeButton.dataset.removeAttachment);
  const usable = pendingAttachments.filter((attachment) => attachment?.ok !== false && attachment.path);
  const removed = usable[index];
  pendingAttachments = pendingAttachments.filter((attachment) => attachment !== removed);
  renderAttachmentTray();
  if (removed) log(`Removed attachment ${removed.name || removed.path}`);
});

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', async () => {
    button.disabled = true;
    const result = await window.clawdesk.action(button.dataset.action);
    button.disabled = false;
    log(`${result.ok ? 'Gateway action completed' : 'Gateway action failed'}: ${result.action} at ${result.at || 'unknown'}`);
    if (result.output) log(result.output);
    await refreshStatus();
  });
});

$('#composer').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = $('#chatInput');
  const thinking = $('#thinkingSelect').value;
  const sendButton = $('#sendButton');
  const text = input.value.trim();
  const attachments = pendingAttachments.filter((attachment) => attachment?.ok !== false && attachment.path);
  if (!text && !attachments.length) return;
  const outgoingText = text || 'Please review the attached file(s).';

  appendMessage('user', outgoingText, attachmentDetail(attachments));
  input.value = '';
  clearAttachments();
  input.disabled = true;
  sendButton.disabled = true;
  sendButton.textContent = 'Working';
  const pending = appendMessage('assistant', 'Working through OpenClaw...');

  try {
    let reply = await window.clawdesk.sendMessage({
      message: outgoingText,
      attachments,
      sessionKey: currentSessionKey,
      agent: 'main',
      thinking
    });
    if (!reply.ok && isCompactionFailure(reply)) {
      const failedSessionKey = currentSessionKey;
      const nextSessionKey = startNewSession({ reason: 'compaction failed' });
      pending.querySelector('p').textContent = `Previous ClawDesk session was full, so I started ${nextSessionKey} and retried.`;
      saveChat();
      log(`Compaction failed in ${failedSessionKey}; retrying in ${nextSessionKey}`);
      reply = await window.clawdesk.sendMessage({
        message: outgoingText,
        attachments,
        sessionKey: nextSessionKey,
        agent: 'main',
        thinking
      });
    }
    pending.querySelector('p').textContent = reply.text;
    scrollChatToBottom();
    saveChat();
    log(`Chat reply received${reply.runId ? ` run ${reply.runId}` : ''}`);
    refreshAfterChatReply();
  } catch (error) {
    pending.querySelector('p').textContent = `OpenClaw chat failed: ${error.message}`;
    scrollChatToBottom();
    saveChat();
    log(`OpenClaw chat failed: ${error.message}`);
  } finally {
    input.disabled = false;
    sendButton.disabled = false;
    sendButton.textContent = 'Send';
    input.focus();
  }
});

applyTheme(localStorage.getItem(THEME_STORAGE_KEY) || 'light');
applySidebarState(localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true');
loadChat();
updateClock();
setInterval(updateClock, 30000);
refreshAll();
