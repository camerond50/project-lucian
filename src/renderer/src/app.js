const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatLog = document.getElementById('chat-log');
const avatarEmote = document.getElementById('avatar-emote');
const avatarMood = document.getElementById('avatar-mood');
const analyticsTotal = document.getElementById('analytics-total');
const analyticsIntent = document.getElementById('analytics-intent');
const analyticsLatency = document.getElementById('analytics-latency');
const analyticsExportButton = document.getElementById('analytics-export');
const analyticsExportStatus = document.getElementById('analytics-export-status');
const analyticsPersistenceToggle = document.getElementById('analytics-persistence');
const analyticsPersistenceStatus = document.getElementById(
  'analytics-persistence-status'
);
const keyForm = document.getElementById('key-form');
const keyStatus = document.getElementById('key-status');

function appendMessage(text, role) {
  const line = document.createElement('div');
  line.className = `msg msg-${role}`;
  line.textContent = text;
  chatLog.appendChild(line);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function updateAnalyticsPanel(analytics) {
  if (!analytics?.event || !analytics?.summary) {
    return;
  }

  analyticsTotal.textContent = String(analytics.summary.totalInteractions);
  analyticsIntent.textContent = analytics.event.intent;
  analyticsLatency.textContent = `${analytics.event.latencyMs}ms`;
}

function createAnalyticsDownload(exportPayload) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `lucian-analytics-${timestamp}.json`;
  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  return filename;
}

function renderAnalyticsPersistenceStatus(status) {
  analyticsPersistenceToggle.checked = Boolean(status.enabled);
  analyticsPersistenceStatus.textContent = status.enabled
    ? `Local persistence on. ${status.persistedEventCount} events stored.`
    : 'Local persistence off. Exports remain manual only.';
}

async function refreshAnalyticsPersistenceStatus() {
  try {
    const status = await window.lucianApi.analyticsPersistenceStatus();
    renderAnalyticsPersistenceStatus(status);
  } catch (error) {
    analyticsPersistenceStatus.textContent =
      'Could not read analytics persistence status.';
    console.error('Analytics persistence status failed', error);
  }
}

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const prompt = chatInput.value.trim();
  if (!prompt) return;

  appendMessage(prompt, 'user');
  chatInput.value = '';

  const result = await window.lucianApi.sendPrompt({
    prompt,
    provider: 'local-engine'
  });
  appendMessage(result.response.message, 'assistant');
  avatarEmote.textContent = result.avatar.emote;
  avatarMood.textContent = result.avatar.mood;
  updateAnalyticsPanel(result.analytics);
  await refreshAnalyticsPersistenceStatus();
});

analyticsExportButton.addEventListener('click', async () => {
  analyticsExportButton.disabled = true;
  analyticsExportStatus.textContent = 'Preparing local analytics export...';

  try {
    const exportPayload = await window.lucianApi.exportAnalytics();
    const filename = createAnalyticsDownload(exportPayload);
    analyticsExportStatus.textContent = `Exported ${exportPayload.eventCount} events to ${filename}`;
  } catch (error) {
    analyticsExportStatus.textContent = 'Analytics export failed. Check console for details.';
    console.error('Analytics export failed', error);
  } finally {
    analyticsExportButton.disabled = false;
  }
});

analyticsPersistenceToggle.addEventListener('change', async () => {
  analyticsPersistenceToggle.disabled = true;
  analyticsPersistenceStatus.textContent = analyticsPersistenceToggle.checked
    ? 'Turning on local analytics persistence...'
    : 'Turning off local analytics persistence...';

  try {
    const status = await window.lucianApi.setAnalyticsPersistence(
      analyticsPersistenceToggle.checked
    );
    renderAnalyticsPersistenceStatus(status);
  } catch (error) {
    analyticsPersistenceToggle.checked = !analyticsPersistenceToggle.checked;
    analyticsPersistenceStatus.textContent =
      'Could not update analytics persistence setting.';
    console.error('Analytics persistence setting failed', error);
  } finally {
    analyticsPersistenceToggle.disabled = false;
  }
});

keyForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const provider = document.getElementById('provider').value.trim();
  const keyValue = document.getElementById('key-value').value.trim();
  if (!provider || !keyValue) return;

  await window.lucianApi.saveKey(provider, keyValue);
  const keys = await window.lucianApi.keyStatus();
  keyStatus.textContent = `Stored providers: ${keys.join(', ')}`;
  document.getElementById('key-value').value = '';
});

refreshAnalyticsPersistenceStatus();
