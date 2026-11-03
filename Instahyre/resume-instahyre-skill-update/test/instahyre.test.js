const test = require('node:test');
const assert = require('node:assert/strict');
const { validateTargetSkills, planSkillChanges } = require('../src/instahyre');

test('validates a non-empty target list of at most twenty skills', () => {
  assert.deepEqual(validateTargetSkills(['Java', 'Spring Boot']), ['Java', 'Spring Boot']);
  assert.throws(() => validateTargetSkills([]), /empty/i);
  assert.throws(() => validateTargetSkills(Array.from({ length: 21 }, (_, i) => `S${i}`)), /20/);
});

test('plans only the skill differences', () => {
  assert.deepEqual(planSkillChanges(['Java', 'React.js'], ['Java', 'Spring Boot']), {
    toRemove: ['React.js'],
    toAdd: ['Spring Boot'],
    target: ['Java', 'Spring Boot'],
  });
});
