const SCORE_RANK = Object.freeze({ unknown: 0, low: 1, medium: 2, high: 3 });

function parseInstaMatchScore(text) {
  const match = String(text || '').match(/InstaMatch\s+score\s*[:\-]?\s*(high|medium|low)\b/i);
  return match ? match[1].toLowerCase() : 'unknown';
}

function scoreImproved(before, after) {
  return (SCORE_RANK[after] || 0) > (SCORE_RANK[before] || 0);
}

function shouldApplyAfterRefresh(before, after) {
  return after === 'high' || scoreImproved(before, after);
}

function shouldApplyAfterProfileUpdate(before, after) {
  return before === 'low' || shouldApplyAfterRefresh(before, after);
}

module.exports = { SCORE_RANK, parseInstaMatchScore, scoreImproved, shouldApplyAfterRefresh, shouldApplyAfterProfileUpdate };
