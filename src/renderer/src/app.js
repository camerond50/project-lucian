const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatLog = document.getElementById('chat-log');
const avatarEmote = document.getElementById('avatar-emote');
const avatarMood = document.getElementById('avatar-mood');
const keyForm = document.getElementById('key-form');
const keyStatus = document.getElementById('key-status');

function appendMessage(text, role) {
  const line = document.createElement('div');
  line.className = `msg msg-${role}`;
  line.textContent = text;
  chatLog.appendChild(line);
  chatLog.scrollTop = chatLog.scrollHeight;
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
