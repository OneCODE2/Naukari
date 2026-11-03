/**
 * Instahyre profile update used when a job's InstaMatch score is LOW.
 * Sets the current role to match the job, saves skills (so "last updated" moves),
 * and replaces the resume PDF.
 */
function roleForTitle(title) {
  const t = (title || '').toLowerCase();
  if (/full[\s-]?stack/.test(t)) return 'Full-Stack Development';
  if (/front[\s-]?end|\breact\b|ui engineer/.test(t)) return 'Frontend Development';
  if (/devops|sre|\bcloud\b/.test(t)) return 'DevOps / Cloud';
  if (/machine learning|data scien|\bml\b/.test(t)) return 'Data Science / Machine Learning';
  if (/mobile|android|\bios\b|react native/.test(t)) return 'Mobile Development';
  if (/\bqa\b|sdet|test engineer|software test/.test(t)) return 'Software Testing / QA / SDET';
  if (/data engineer/.test(t)) return 'Data Engineering / DWH / ETL';
  return 'Backend Development';
}

const MAX_SKILLS = 20;

function normSkill(s) {
  return String(s || '').toLowerCase().replace(/\.js\b/g, '').replace(/[^a-z0-9+#]+/g, '');
}

function mentionCount(hay, skill) {
  const raw = String(skill || '').toLowerCase().trim();
  if (raw.length < 2) return 0;
  const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(^|[^a-z0-9+])' + escaped + '([^a-z0-9+]|$)', 'g');
  return (String(hay || '').toLowerCase().match(re) || []).length;
}

/** Title matches outweigh a passing mention in the description. */
function matchWeight(skill, job) {
  return mentionCount(job && job.title, skill) * 100 + mentionCount(job && job.jd, skill) * 10;
}

/**
 * Instahyre allows 20 skills. Keep every skill already on the profile unless a
 * higher-weight job skill needs the slot. Never drop a skill that itself matches
 * the job in order to add a weaker one.
 */
function planSkillEdits(existing, wanted, job) {
  const same = (a, b) => normSkill(a) === normSkill(b);
  const ranked = (wanted || [])
    .map((name) => ({ name: String(name || '').trim(), w: matchWeight(name, job) }))
    .filter((s) => s.name && s.w > 0)
    .sort((a, b) => b.w - a.w);

  const mustHave = ranked.slice(0, 8);
  const extras = ranked.slice(8);
  const protectedNorms = new Set(mustHave.map((s) => normSkill(s.name)));
  const missing = [];
  for (const skill of mustHave) {
    if (existing.some((e) => same(e, skill.name))) continue;
    if (missing.some((n) => same(n, skill.name))) continue;
    missing.push(skill.name);
  }

  const removable = (existing || [])
    .filter((name) => !protectedNorms.has(normSkill(name)))
    .map((name) => ({ name, w: matchWeight(name, job) }))
    .sort((a, b) => a.w - b.w || a.name.localeCompare(b.name));

  const toRemove = [];
  const toAdd = [];
  let count = (existing || []).length;
  for (const name of missing) {
    const addW = ranked.find((s) => same(s.name, name)).w;
    if (count < MAX_SKILLS) {
      toAdd.push(name);
      count++;
      continue;
    }
    const victim = removable.find((r) => !toRemove.some((n) => same(n, r.name)) && r.w < addW);
    if (!victim) continue;
    toRemove.push(victim.name);
    toAdd.push(name);
  }
  for (const skill of extras) {
    if (count >= MAX_SKILLS) break;
    if (existing.some((e) => same(e, skill.name)) || toAdd.some((n) => same(n, skill.name))) continue;
    toAdd.push(skill.name);
    count++;
  }
  return { toRemove, toAdd };
}

function chipName(text) {
  return String(text || '').replace(/×/g, '').replace(/\s+/g, ' ').trim();
}

function planProfileVariation(before, { role, wanted, job }) {
  const original = {
    role: String(before && before.role || '').trim(),
    skills: Array.isArray(before && before.skills) ? [...before.skills] : [],
  };
  if (!original.skills.length) throw new Error('selected skills are required before planning a variation');
  return {
    before: original,
    role: role || original.role,
    plan: planSkillEdits(original.skills, wanted || [], job || {}),
    restore: { role: original.role, skills: [...original.skills] },
  };
}

async function setCurrentRole(page, role) {
  const drop = page.locator('ui-dropdown.role-dropdown');
  const current = ((await drop.locator('.text').first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  if (current.toLowerCase() === role.toLowerCase()) return current;
  await drop.locator('.selected').click();
  const options = drop.locator('[ng-click*="select(entry)"]');
  const n = await options.count();
  for (let i = 0; i < n; i++) {
    const text = ((await options.nth(i).innerText()) || '').replace(/\s+/g, ' ').trim();
    if (text === role) {
      await options.nth(i).click();
      return role;
    }
  }
  await page.keyboard.press('Escape').catch(() => { });
  return current;
}

async function updateInstahyreProfile(context, { tailor, pdfPath, live, log, guard, jobTitle }) {
  const page = await context.newPage();
  if (guard) guard.add(page);
  try {
    await page.bringToFront().catch(() => { });
    await page.goto('https://www.instahyre.com/candidate/profile/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    // The file input is in the DOM but hidden. Waiting for "visible" always times out.
    const found = await page.waitForSelector('#resume-input', { state: 'attached', timeout: 20000 })
      .then(() => true).catch(() => false);
    if (!found) {
      throw new Error('resume input missing at ' + page.url());
    }
    const role = roleForTitle(jobTitle || (tailor && tailor.headline) || '');
    if (!live) {
      log(`  DRY RUN — would set role to ${role}, replace resume with ${require('path').basename(pdfPath)}, and keep the 20 highest-weight skills`);
      return;
    }

    const stampOf = (text) => ((text.match(/Last updated on [A-Za-z0-9,: ]+/) || [''])[0] || '').trim();
    let beforeStamp = '';
    for (let i = 0; i < 20 && !beforeStamp; i++) {
      beforeStamp = stampOf(await page.locator('body').innerText());
      if (!beforeStamp) await page.waitForTimeout(500);
    }
    await page.locator('#resume-input').setInputFiles(pdfPath);
    let afterStamp = beforeStamp;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(1000);
      afterStamp = stampOf(await page.locator('body').innerText());
      if (beforeStamp && afterStamp && afterStamp !== beforeStamp) break;
      if (i === 6) {
        await page.evaluate(() => {
          const el = document.querySelector('#resume-input');
          if (!el || !el.files || !el.files[0] || !window.angular) return;
          let scope = angular.element(el).scope();
          for (let n = 0; n < 8 && scope; n++) {
            if (typeof scope.uploadResume === 'function') {
              scope.uploadResume(true);
              return;
            }
            scope = scope.$parent;
          }
        });
      }
    }
    if (!afterStamp || !beforeStamp || afterStamp === beforeStamp) {
      throw new Error('resume upload did not change the profile date (still ' + (afterStamp || beforeStamp || 'unknown') + ')');
    }
    log('  resume replaced — ' + afterStamp);

    const edit = page.locator('a.edit-link[ng-click*="skills_editor"]');
    if (!(await edit.count())) {
      log('  skills editor not found — resume was still replaced');
      return;
    }
    await edit.first().click();
    await page.locator('ui-dropdown.role-dropdown').waitFor({ state: 'visible', timeout: 8000 });
    const setRole = await setCurrentRole(page, role);
    log('  current role: ' + setRole);

    // Selected skills are ng-repeat chips under .chosen-skills, not selectize .item tags.
    const chosen = page.locator('#skills .chosen-skills, .chosen-skills').first();
    await chosen.waitFor({ state: 'visible', timeout: 8000 }).catch(() => { });
    const readChosen = async () => {
      const chips = page.locator('.chosen-skills [ng-repeat*="candidate_skills"]');
      const n = await chips.count();
      const names = [];
      for (let i = 0; i < n; i++) {
        const name = chipName(await chips.nth(i).innerText());
        if (name) names.push(name);
      }
      return names;
    };
    let existing = await readChosen();
    if (!existing.length) {
      // Wait one beat for Angular to paint chips; never Save if we still see none.
      await page.waitForTimeout(1500);
      existing = await readChosen();
    }
    if (!existing.length) {
      throw new Error('could not read Selected Skills chips — refusing to save an empty skills list');
    }

    const job = { title: jobTitle || '', jd: (tailor && tailor.jobJd) || '' };
    const plan = planSkillEdits(existing, (tailor && tailor.skills) || [], job);
    log(`  skills ${existing.length}/${MAX_SKILLS}; adding [${plan.toAdd.join(', ') || 'none'}]` +
      (plan.toRemove.length ? `; removing [${plan.toRemove.join(', ')}]` : ''));

    for (const name of plan.toRemove) {
      const chips = page.locator('.chosen-skills [ng-repeat*="candidate_skills"]');
      const n = await chips.count();
      let removed = false;
      for (let i = 0; i < n; i++) {
        if (normSkill(chipName(await chips.nth(i).innerText())) !== normSkill(name)) continue;
        await chips.nth(i).locator('.remove').click();
        await page.waitForTimeout(350);
        removed = true;
        break;
      }
      if (!removed) log('  could not remove skill ' + name);
    }

    const input = page.locator('#name-selectized');
    await input.waitFor({ state: 'visible', timeout: 8000 });
    for (const skill of plan.toAdd) {
      const have = (await readChosen()).map(normSkill);
      if (have.includes(normSkill(skill))) continue;
      if (have.length >= MAX_SKILLS) {
        log('  stopped at 20 skills before adding ' + skill);
        break;
      }
      await input.click();
      await input.fill('');
      await input.type(skill, { delay: 40 });
      await page.waitForTimeout(500);
      const option = page.locator('.selectize-dropdown-content .option, .selectize-dropdown .option')
        .filter({ hasText: new RegExp('^\\s*' + skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i') })
        .first();
      if (await option.count()) {
        await option.click();
      } else {
        await input.press('Enter');
      }
      await page.waitForTimeout(450);
      const after = (await readChosen()).map(normSkill);
      if (!after.includes(normSkill(skill))) {
        log('  skill not accepted (limit or unknown): ' + skill);
      }
    }
    const finalCount = (await readChosen()).length;
    if (!finalCount) {
      throw new Error('skills list empty before save — cancelled');
    }
    await page.locator('button[ng-click*="profileSkillSave"]').click();
    await page.waitForTimeout(2500);
    log(`  skills saved (${finalCount}/${MAX_SKILLS}) — profile updated for ${role}`);
  } finally {
    if (guard) guard.delete(page);
    await page.close().catch(() => { });
  }
}

module.exports = { updateInstahyreProfile, roleForTitle, planSkillEdits, planProfileVariation, MAX_SKILLS };
