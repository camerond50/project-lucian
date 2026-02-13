const { buildChatResponse } = require('./modules/chatModule');
const { getAvatarState } = require('./modules/avatarWidget');

async function handlePrompt(payload) {
  const prompt = payload?.prompt ?? '';
  const provider = payload?.provider ?? 'local-engine';

  const response = buildChatResponse(prompt, provider);
  const avatar = getAvatarState(prompt);

  return {
    response,
    avatar
  };
}

module.exports = {
  handlePrompt
};
