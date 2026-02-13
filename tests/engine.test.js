const { handlePrompt } = require('../src/engine/engine');
const { secureKeyStore } = require('../src/engine/secureKeyStore');

describe('engine', () => {
  it('builds chat response and avatar state', async () => {
    const result = await handlePrompt({
      prompt: 'thanks for help',
      provider: 'local-engine'
    });
    expect(result.response.message).toContain('thanks for help');
    expect(result.avatar.mood).toBe('happy');
  });
});

describe('secure key store', () => {
  it('stores and retrieves encrypted key', () => {
    secureKeyStore.set('openai', 'abc123');
    expect(secureKeyStore.get('openai')).toBe('abc123');
    expect(secureKeyStore.status()).toContain('openai');
  });
});
