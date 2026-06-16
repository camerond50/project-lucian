const { beforeEach, describe, expect, it } = require('vitest');
const { handlePrompt } = require('./engine');
const { resetInteractionAnalytics } = require('./modules/analyticsLogger');

describe('engine', () => {
  beforeEach(() => {
    resetInteractionAnalytics();
  });

  it('returns response, avatar, and privacy-safe analytics metadata', async () => {
    const result = await handlePrompt({
      prompt: 'Build the revenue tracker?',
      provider: 'local-engine'
    });

    expect(result.response).toMatchObject({
      provider: 'local-engine',
      message: 'Lucian(local-engine): Build the revenue tracker?'
    });
    expect(result.avatar).toMatchObject({
      mood: 'focused'
    });
    expect(result.analytics.event).toMatchObject({
      provider: 'local-engine',
      intent: 'revenue',
      avatarMood: 'focused'
    });
    expect(result.analytics.event.prompt).toBeUndefined();
    expect(result.analytics.summary.totalInteractions).toBe(1);
  });
});
