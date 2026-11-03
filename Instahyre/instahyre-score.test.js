const assert = require('assert');
const { parseInstaMatchScore, scoreImproved, shouldApplyAfterRefresh, shouldApplyAfterProfileUpdate } = require('./instahyre-score');
const { runScoreFeedbackLoop } = require('./instahyre-score-loop');

assert.strictEqual(parseInstaMatchScore('InstaMatch score high'), 'high');
assert.strictEqual(parseInstaMatchScore('InstaMatch score: medium'), 'medium');
assert.strictEqual(parseInstaMatchScore('InstaMatch score low'), 'low');
assert.strictEqual(parseInstaMatchScore('No score available'), 'unknown');
assert.strictEqual(scoreImproved('low', 'medium'), true);
assert.strictEqual(scoreImproved('medium', 'low'), false);
assert.strictEqual(shouldApplyAfterRefresh('low', 'medium'), true);
assert.strictEqual(shouldApplyAfterRefresh('low', 'low'), false);
assert.strictEqual(shouldApplyAfterRefresh('medium', 'high'), true);
assert.strictEqual(shouldApplyAfterRefresh('unknown', 'high'), true);
assert.strictEqual(shouldApplyAfterProfileUpdate('low', 'unknown'), true);
assert.strictEqual(shouldApplyAfterProfileUpdate('low', 'low'), true);
assert.strictEqual(shouldApplyAfterProfileUpdate('medium', 'unknown'), false);

(async () => {
  const events = [];
  const result = await runScoreFeedbackLoop({
    maxAttempts: 5,
    readScore: async () => 'low',
    updateProfile: async (attempt) => { events.push(`update:${attempt}`); return { before: { role: 'Backend Development', skills: ['Java'] } }; },
    restoreProfile: async () => events.push('restore'),
    refreshJob: async () => events.push('refresh'),
    log: (entry) => events.push(entry.status),
  });
  assert.strictEqual(result.apply, false);
  assert.strictEqual(result.status, 'human_intervention');
  assert.strictEqual(events.filter((e) => e === 'refresh').length, 5);
  assert.strictEqual(events.filter((e) => e === 'restore').length, 5);
  console.log('instahyre-score-loop: all checks passed');
})().catch((error) => { console.error(error); process.exit(1); });
console.log('instahyre-score: all checks passed');
