const { beforeEach, describe, expect, it } = require('vitest');
const {
  classifyPromptIntent,
  getInteractionMetrics,
  recordInteractionEvent,
  resetInteractionAnalytics
} = require('./analyticsLogger');

describe('analyticsLogger', () => {
  beforeEach(() => {
    resetInteractionAnalytics();
  });

  it('classifies revenue and development prompts without storing raw prompt text', () => {
    expect(classifyPromptIntent('Find buyer signal for a new client offer')).toBe(
      'revenue'
    );
    expect(classifyPromptIntent('Debug the repo test failure')).toBe(
      'development'
    );
  });

  it('records prompt stats, provider counts, intent counts, and avatar mood', () => {
    const analytics = recordInteractionEvent({
      prompt: 'Build the revenue tracker?',
      provider: 'local-engine',
      avatar: { mood: 'focused' },
      startedAt: 1000,
      completedAt: 1250
    });

    expect(analytics.event).toMatchObject({
      provider: 'local-engine',
      intent: 'revenue',
      avatarMood: 'focused',
      latencyMs: 250
    });
    expect(analytics.event.promptStats).toEqual({
      characterCount: 26,
      wordCount: 4,
      hasQuestion: true
    });
    expect(analytics.event.prompt).toBeUndefined();
    expect(analytics.summary.totalInteractions).toBe(1);
    expect(analytics.summary.byIntent.revenue).toBe(1);
    expect(analytics.summary.byProvider['local-engine']).toBe(1);
  });

  it('returns a durable summary across multiple interactions', () => {
    recordInteractionEvent({
      prompt: 'Plan the household budget',
      provider: 'local-engine',
      avatar: { mood: 'focused' },
      startedAt: 2000,
      completedAt: 2100
    });
    recordInteractionEvent({
      prompt: 'Fix the broken command center test',
      provider: 'local-engine',
      avatar: { mood: 'concerned' },
      startedAt: 3000,
      completedAt: 3400
    });

    expect(getInteractionMetrics()).toEqual({
      totalInteractions: 2,
      byIntent: {
        household_ops: 1,
        development: 1
      },
      byProvider: {
        'local-engine': 2
      },
      lastEventAt: new Date(3400).toISOString()
    });
  });
});
