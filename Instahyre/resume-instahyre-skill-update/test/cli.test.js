const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDryRunResult } = require('../src/cli');

test('builds a dry-run result without browser actions', () => {
  assert.deepEqual(buildDryRunResult(['Java', 'Spring Boot']), {
    mode: 'dry-run',
    skills: ['Java', 'Spring Boot'],
    count: 2,
  });
});
