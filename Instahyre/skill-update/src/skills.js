const MAX_SKILLS = 20;
const RELEVANCE_ORDER = [
  'java', 'springboot', 'microservices', 'restapis', 'hibernatejpa', 'jdbc',
  'postgresql', 'mysql', 'sql', 'python', 'typescript', 'javascript', 'react',
  'next', 'node', 'aws', 'docker', 'jenkins', 'cicd', 'git', 'junit',
];

function normalizeSkill(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\.js\b/g, '')
    .replace(/[^a-z0-9+#]+/g, '');
}

function parseTechnicalSkills(text) {
  const source = String(text || '').replace(/\r/g, '');
  const match = source.match(/technical skills\s*\n([\s\S]*?)(?=\n(?:projects|work experience|education)\b|$)/i);
  if (!match) throw new Error('Technical skills section not found');

  const skills = [];
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const values = line.slice(colon + 1).split(',');
    for (const value of values) {
      const cleaned = value.replace(/[•●]/g, '').trim();
      if (!cleaned) continue;
      const parenthetical = cleaned.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
      if (parenthetical) {
        if (parenthetical[1].trim()) skills.push(parenthetical[1].trim());
        if (parenthetical[2].trim()) skills.push(parenthetical[2].trim());
      } else {
        skills.push(cleaned);
      }
    }
  }
  if (!skills.length) throw new Error('Technical skills section is empty');
  return selectSkills(skills, Number.POSITIVE_INFINITY);
}

function selectSkills(skills, limit = MAX_SKILLS) {
  const candidates = [];
  const seen = new Set();
  for (const skill of skills || []) {
    const display = String(skill || '').trim();
    const key = normalizeSkill(display);
    if (!display || !key || seen.has(key)) continue;
    seen.add(key);
    candidates.push(display);
  }
  if (candidates.length > MAX_SKILLS) {
    candidates.sort((a, b) => {
      const aRank = RELEVANCE_ORDER.indexOf(normalizeSkill(a));
      const bRank = RELEVANCE_ORDER.indexOf(normalizeSkill(b));
      return (aRank < 0 ? Number.MAX_SAFE_INTEGER : aRank) - (bRank < 0 ? Number.MAX_SAFE_INTEGER : bRank);
    });
  }
  return candidates.slice(0, Math.min(MAX_SKILLS, limit));
}

function planSkillChanges(existing, wanted) {
  const target = selectSkills(wanted);
  const targetKeys = new Set(target.map(normalizeSkill));
  const current = selectSkills(existing, Number.POSITIVE_INFINITY);
  const currentKeys = new Set(current.map(normalizeSkill));
  return {
    toRemove: current.filter((skill) => !targetKeys.has(normalizeSkill(skill))),
    toAdd: target.filter((skill) => !currentKeys.has(normalizeSkill(skill))),
    target,
  };
}

module.exports = { MAX_SKILLS, normalizeSkill, parseTechnicalSkills, selectSkills, planSkillChanges };
