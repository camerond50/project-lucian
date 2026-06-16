const crypto = require('crypto');

const MAX_EVENTS = 100;
const interactionEvents = [];

function createEventId() {
  if (typeof crypto.randomUUID === 'function') {
    return `interaction_${crypto.randomUUID()}`;
  }

  return `interaction_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizePrompt(prompt) {
  return String(prompt ?? '').trim();
}

function countWords(prompt) {
  const normalized = normalizePrompt(prompt);
  if (!normalized) {
    return 0;
  }

  return normalized.split(/\s+/).length;
}

function classifyPromptIntent(prompt) {
  const normalized = normalizePrompt(prompt).toLowerCase();

  if (!normalized) {
    return 'idle';
  }

  const intentRules = [
    {
      intent: 'revenue',
      terms: [
        'revenue',
        'money',
        'client',
        'customer',
        'sell',
        'offer',
        'lead',
        'buyer'
      ]
    },
    {
      intent: 'development',
      terms: [
        'code',
        'build',
        'debug',
        'test',
        'repo',
        'deploy',
        'schema',
        'script'
      ]
    },
    {
      intent: 'household_ops',
      terms: [
        'budget',
        'bill',
        'family',
        'kids',
        'home',
        'household',
        'schedule'
      ]
    },
    {
      intent: 'planning',
      terms: ['plan', 'roadmap', 'next action', 'prioritize', 'timeline']
    },
    {
      intent: 'support',
      terms: ['error', 'fail', 'stuck', 'blocked', 'broken', 'fix']
    }
  ];

  const match = intentRules.find((rule) =>
    rule.terms.some((term) => normalized.includes(term))
  );

  return match?.intent ?? 'general';
}

function buildPromptStats(prompt) {
  const normalized = normalizePrompt(prompt);

  return {
    characterCount: normalized.length,
    wordCount: countWords(normalized),
    hasQuestion: normalized.includes('?')
  };
}

function summarizeEvents(events = interactionEvents) {
  return events.reduce(
    (summary, event) => {
      summary.totalInteractions += 1;
      summary.byIntent[event.intent] = (summary.byIntent[event.intent] ?? 0) + 1;
      summary.byProvider[event.provider] =
        (summary.byProvider[event.provider] ?? 0) + 1;
      summary.lastEventAt = event.createdAt;
      return summary;
    },
    {
      totalInteractions: 0,
      byIntent: {},
      byProvider: {},
      lastEventAt: null
    }
  );
}

function recordInteractionEvent({
  prompt,
  provider = 'local-engine',
  avatar,
  startedAt = Date.now(),
  completedAt = Date.now()
}) {
  const latencyMs = Math.max(0, completedAt - startedAt);
  const event = {
    id: createEventId(),
    createdAt: new Date(completedAt).toISOString(),
    provider,
    intent: classifyPromptIntent(prompt),
    promptStats: buildPromptStats(prompt),
    avatarMood: avatar?.mood ?? 'unknown',
    latencyMs
  };

  interactionEvents.push(event);

  if (interactionEvents.length > MAX_EVENTS) {
    interactionEvents.splice(0, interactionEvents.length - MAX_EVENTS);
  }

  return {
    event,
    summary: summarizeEvents()
  };
}

function getInteractionMetrics() {
  return summarizeEvents();
}

function resetInteractionAnalytics() {
  interactionEvents.splice(0, interactionEvents.length);
}

module.exports = {
  classifyPromptIntent,
  getInteractionMetrics,
  recordInteractionEvent,
  resetInteractionAnalytics
};
