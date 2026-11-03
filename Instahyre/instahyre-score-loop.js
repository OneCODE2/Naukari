const { shouldApplyAfterRefresh } = require('./instahyre-score');

async function runScoreFeedbackLoop({ maxAttempts = 5, readScore, updateProfile, restoreProfile, refreshJob, log = () => {} }) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const before = await readScore();
    if (before === 'high') return { apply: true, status: 'high', attempt, before, after: before };
    const variation = await updateProfile(attempt);
    await refreshJob();
    const after = await readScore();
    const improved = shouldApplyAfterRefresh(before, after);
    log({ attempt, before, after, improved, status: improved ? 'apply' : 'rollback' });
    if (improved) return { apply: true, status: 'improved', attempt, before, after, variation };
    await restoreProfile(variation.before);
  }
  return { apply: false, status: 'human_intervention' };
}

module.exports = { runScoreFeedbackLoop };
