const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatLog = document.getElementById('chat-log');
const avatarEmote = document.getElementById('avatar-emote');
const avatarMood = document.getElementById('avatar-mood');
const analyticsTotal = document.getElementById('analytics-total');
const analyticsIntent = document.getElementById('analytics-intent');
const analyticsLatency = document.getElementById('analytics-latency');
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
