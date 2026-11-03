const { planSkillChanges: calculateSkillChanges, selectSkills, normalizeSkill, MAX_SKILLS } = require('./skills');

function validateTargetSkills(skills) {
  const uniqueCount = new Set((skills || []).map(normalizeSkill).filter(Boolean)).size;
  if (uniqueCount > MAX_SKILLS) throw new Error('Target skills list exceeds 20 skills');
  const target = selectSkills(skills);
  if (!target.length) throw new Error('Target skills list is empty');
  return target;
}

function planSkillChanges(existing, wanted) {
  const target = validateTargetSkills(wanted);
  return calculateSkillChanges(existing, target);
}

async function updateProfileSkills(page, wanted, log = () => {}) {
  const target = validateTargetSkills(wanted);
  await page.goto('https://www.instahyre.com/candidate/profile/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const edit = page.locator('a.edit-link[ng-click*="skills_editor"]');
  if (!(await edit.count())) throw new Error('Instahyre skills editor not found');
  await edit.first().click();

  const chips = page.locator('.chosen-skills [ng-repeat*="candidate_skills"]');
  const read = async () => {
    const names = [];
    for (let i = 0; i < await chips.count(); i++) {
      const name = (await chips.nth(i).innerText()).replace(/×/g, '').replace(/\s+/g, ' ').trim();
      if (name) names.push(name);
    }
    return names;
  };
  const existing = await read();
  if (!existing.length) throw new Error('Could not read selected Instahyre skills; refusing to save');
  const plan = planSkillChanges(existing, target);
  log(`skills to add: ${plan.toAdd.join(', ') || 'none'}; remove: ${plan.toRemove.join(', ') || 'none'}`);

  for (const name of plan.toRemove) {
    for (let i = 0; i < await chips.count(); i++) {
      const current = (await chips.nth(i).innerText()).replace(/×/g, '').replace(/\s+/g, ' ').trim();
      if (normalizeSkill(current) === normalizeSkill(name)) {
        await chips.nth(i).locator('.remove').click();
        break;
      }
    }
  }
  const input = page.locator('#name-selectized');
  for (const name of plan.toAdd) {
    await input.fill(name);
    await input.press('Enter');
  }
  const finalSkills = await read();
  if (!finalSkills.length || finalSkills.length > MAX_SKILLS) {
    throw new Error('Refusing to save an empty or over-limit skills list');
  }
  await page.locator('button[ng-click*="profileSkillSave"]').click();
  return finalSkills;
}

module.exports = { validateTargetSkills, planSkillChanges, updateProfileSkills };
