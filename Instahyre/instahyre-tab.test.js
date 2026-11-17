const assert = require('assert');
const { shouldCloseJobTab, isJobPageUrl, isJobTabDoneMessage } = require('./instahyre-tab');

// URL checks
assert.strictEqual(isJobPageUrl('https://www.instahyre.com/job-446794-software-engineer-at-blue-yonder'), true);
assert.strictEqual(isJobPageUrl('https://www.instahyre.com/job-405090-senior-software-engin'), true);
assert.strictEqual(isJobPageUrl('https://www.instahyre.com/search-jobs?search=true&skills=Java&years=3'), false);
assert.strictEqual(isJobPageUrl('https://www.instahyre.com/candidate/opportunities/'), false);
assert.strictEqual(isJobPageUrl('https://www.instahyre.com/candidate/profile/'), false);
assert.strictEqual(isJobPageUrl(''), false);

// Done message checks
assert.strictEqual(isJobTabDoneMessage('Already applied — closing tab immediately.'), true);
assert.strictEqual(isJobTabDoneMessage('This job was already opened — not opening it again.'), true);
assert.strictEqual(isJobTabDoneMessage('Job page did not finish loading — skipping without counting it.'), true);
assert.strictEqual(isJobTabDoneMessage('Profile/resume update did not finish — not applying to this low-score job.'), true);
assert.strictEqual(isJobTabDoneMessage('No Apply button on this job. Buttons: none'), true);
assert.strictEqual(isJobTabDoneMessage('🏁 JOB_TAB_DONE'), true);
assert.strictEqual(isJobTabDoneMessage('  ✅ applied'), true);
assert.strictEqual(isJobTabDoneMessage('  🔍 DRY_RUN — would click: "Apply"'), true);

// Non-done messages must NOT trigger tab closing
assert.strictEqual(isJobTabDoneMessage('👁 Opening job via "View job »" — Deepintent'), false);
assert.strictEqual(isJobTabDoneMessage('Starting. DRY_RUN=false, max=10, applied so far: 0, as Your Name'), false);
assert.strictEqual(isJobTabDoneMessage('InstaMatch: low — InstaMatch score 🙁 LOW'), false);
assert.strictEqual(isJobTabDoneMessage('🎯 TAILOR_NEEDED | Java | 12345 | https://instahyre.com/job-12345'), false);

// Combined shouldCloseJobTab
const jobUrl = 'https://www.instahyre.com/job-446794-software-engineer-at-blue-yonder';
const searchUrl = 'https://www.instahyre.com/search-jobs?search=true&skills=Java';

assert.strictEqual(shouldCloseJobTab({ url: jobUrl, message: 'Already applied — closing tab immediately.' }), true);
assert.strictEqual(shouldCloseJobTab({ url: jobUrl, message: '🏁 JOB_TAB_DONE' }), true);
assert.strictEqual(shouldCloseJobTab({ url: jobUrl, message: 'InstaMatch: low — InstaMatch score 🙁 LOW' }), false);
assert.strictEqual(shouldCloseJobTab({ url: searchUrl, message: 'Already applied — closing tab immediately.' }), false);
assert.strictEqual(shouldCloseJobTab({ url: searchUrl, message: '🏁 JOB_TAB_DONE' }), false);

console.log('instahyre-tab: all checks passed');
