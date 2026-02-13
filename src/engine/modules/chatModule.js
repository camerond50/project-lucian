function buildChatResponse(input, provider = 'local-engine') {
  const timestamp = new Date().toISOString();
  return {
    provider,
    message: `Lucian(${provider}): ${input}`,
    timestamp
  };
}

module.exports = {
  buildChatResponse
};
