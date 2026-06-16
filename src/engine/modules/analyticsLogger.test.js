import { beforeEach, describe, expect, it } from 'vitest';
import analyticsLogger from './analyticsLogger.js';

const {
  classifyPromptIntent,
  exportInteractionAnalytics,
  getInteractionMetrics,
  recordInteractionEvent,
  resetInteractionAnalytics
} = analyticsLogger;

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

  it('exports analytics snapshots without original prompt text', () => {
    const sourcePrompt = 'Summarize the command center session';

    recordInteractionEvent({
      prompt: sourcePrompt,
      provider: 'local-engine',
      avatar: { mood: 'focused' },
      startedAt: 4000,
      completedAt: 4500
    });

    const exportPayload = exportInteractionAnalytics();

    expect(exportPayload.schemaVersion).toBe('lucian.analytics.export.v1');
    expect(exportPayload.eventCount).toBe(1);
    expect(exportPayload.summary.totalInteractions).toBe(1);
    expect(exportPayload.events[0]).toMatchObject({
      provider: 'local-engine',
      intent: 'general',
      avatarMood: 'focused',
      latencyMs: 500
    });
    expect(exportPayload.events[0].prompt).toBeUndefined();
    expect(JSON.stringify(exportPayload)).not.toContain(sourcePrompt);
  });
});
