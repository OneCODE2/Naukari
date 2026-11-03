const test = require('node:test');
const assert = require('node:assert/strict');
const { extractSkillsFromBuffer } = require('../src/pdf');

test('extracts skills from PDF text returned by the parser', async () => {
  const buffer = Buffer.from('fixture');
  const skills = await extractSkillsFromBuffer(buffer, async () => ({
    text: 'TECHNICAL SKILLS\nLanguages: Java, Python\nPROJECTS',
  }));
  assert.deepEqual(skills, ['Java', 'Python']);
});

test('rejects a PDF with no extractable text', async () => {
  await assert.rejects(
    extractSkillsFromBuffer(Buffer.from('fixture'), async () => ({ text: '' })),
    /text/i,
  );
});
