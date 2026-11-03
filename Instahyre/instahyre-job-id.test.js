const assert = require('assert');
const { normalizeInstahyreJobKey } = require('./instahyre-job-id');

assert.strictEqual(normalizeInstahyreJobKey('https://www.instahyre.com/job-12345-java-engineer'), '/job-12345');
assert.strictEqual(normalizeInstahyreJobKey('https://www.instahyre.com/job/12345'), '/job-12345');
assert.strictEqual(normalizeInstahyreJobKey('https://www.instahyre.com/search-jobs'), '');
console.log('instahyre-job-id: all checks passed');
