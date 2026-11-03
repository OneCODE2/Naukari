const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTechnicalSkills, normalizeSkill, selectSkills } = require('../src/skills');

test('parses technical skill categories from resume text', () => {
  const text = 'SUMMARY\nSoftware Engineer\nTECHNICAL SKILLS\nLanguages: Java, Python, SQL, TypeScript\nBackend: Spring Boot (Microservices), REST APIs, Hibernate\nPROJECTS\nOther text';
  assert.deepEqual(parseTechnicalSkills(text), [
    'Java', 'Python', 'SQL', 'TypeScript', 'Spring Boot', 'Microservices', 'REST APIs', 'Hibernate',
  ]);
});

test('normalizes aliases for comparison without changing display names', () => {
  assert.equal(normalizeSkill('React.js'), 'react');
  assert.equal(normalizeSkill('CI/CD'), 'cicd');
  assert.equal(normalizeSkill('Spring Boot (Microservices)'), 'springbootmicroservices');
});

test('deduplicates skills and caps the result at twenty', () => {
  const skills = Array.from({ length: 21 }, (_, i) => `Skill ${i + 1}`);
  skills.push('Java', 'java');
  assert.equal(selectSkills(skills).length, 20);
  assert.equal(selectSkills(['React.js', 'React']).length, 1);
});

test('prioritizes relevant software engineering skills within the twenty-slot limit', () => {
  const selected = selectSkills([
    'Java', 'Python', 'TypeScript', 'JavaScript', 'SQL', 'React.js', 'React 19', 'Next.js',
    'Tailwind CSS', 'Server Side Rendering', 'Spring Boot', 'REST APIs', 'Hibernate/JPA', 'JDBC',
    'Node.js', 'Express.js', 'PostgreSQL', 'MySQL', 'Relational Database Design', 'SQL Optimization',
    'AWS', 'Docker', 'Jenkins', 'CI/CD', 'Git', 'JUnit',
  ]);
  assert.deepEqual(selected, [
    'Java', 'Spring Boot', 'REST APIs', 'Hibernate/JPA', 'JDBC',
    'PostgreSQL', 'MySQL', 'SQL', 'Python', 'TypeScript', 'JavaScript', 'React.js', 'Next.js',
    'Node.js', 'AWS', 'Docker', 'Jenkins', 'CI/CD', 'Git', 'JUnit',
  ]);
});

test('rejects missing technical skills section', () => {
  assert.throws(() => parseTechnicalSkills('SUMMARY\nSoftware Engineer\nWORK EXPERIENCE'), /technical skills/i);
});
