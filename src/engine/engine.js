const { buildChatResponse } = require('./modules/chatModule');
const { getAvatarState } = require('./modules/avatarWidget');
const { recordInteractionEvent } = require('./modules/analyticsLogger');

async function handlePrompt(payload) {
  const startedAt = Date.now();
  const prompt = payload?.prompt ?? '';
  const provider = payload?.provider ?? 'local-engine';

  const response = buildChatResponse(prompt, provider);
  const avatar = getAvatarState(prompt);
  const analytics = recordInteractionEvent({
    prompt,
    provider,
    avatar,
    startedAt,
    completedAt: Date.now()
  });

  return {
    response,
    avatar,
    analytics
  };
}

module.exports = {
  handlePrompt
};
