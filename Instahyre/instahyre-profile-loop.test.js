const assert = require('assert');
const { planProfileVariation } = require('./instahyre-profile');

const before = { role: 'Backend Development', skills: ['Java', 'Legacy Skill'] };
const result = planProfileVariation(before, {
  role: 'Full-Stack Development',
  wanted: ['Java', 'React', 'Spring Boot'],
  job: { title: 'Full-Stack Java Engineer', jd: 'React Spring Boot' },
});

assert.deepStrictEqual(result.before, before);
assert.strictEqual(result.role, 'Full-Stack Development');
assert.ok(result.plan.toAdd.includes('React'));
assert.ok(result.restore.role === before.role);
assert.deepStrictEqual(result.restore.skills, before.skills);
assert.throws(() => planProfileVariation({ role: 'Backend Development', skills: [] }, {
  role: 'Backend Development', wanted: ['Java'], job: { title: 'Java', jd: '' },
}), /selected skills/i);
console.log('instahyre-profile-loop: all checks passed');
