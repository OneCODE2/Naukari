/**
 * Instahyre Auto-Apply — personal data loaded from .env
 * =====================================
 * HOW TO USE:
 * 1. Log in to instahyre.com and open your Opportunities page, e.g.
 *    https://www.instahyre.com/candidate/opportunities/
 * 2. Open DevTools console (F12 → Console), paste this WHOLE file, press Enter.
 *    Or skip the paste and use the runner:
 *      node auto-apply-runner.js instahyre login
 *      node auto-apply-runner.js instahyre            (dry run)
 *      node auto-apply-runner.js instahyre --live
 * 3. It starts in DRY_RUN mode: it opens "View job" and finds Apply, but does
 *    NOT click Apply. Watch one, then set DRY_RUN = false (or pass --live).
 *
 * WHAT IT DOES (Instahyre's own modal flow):
 * - Clicks "View job »" (button.btn-interested, or a button whose text says so)
 *   to open the job modal.
 * - Prefers the bulk button button[ng-click="applyBulk()"] ("Apply to X jobs").
 * - Otherwise clicks the single Apply control:
 *     .apply[ng-click*="submitChoice"] .new-btn
 *     button[ng-click*="submitChoice"]
 *     button[ng-click*="apply"]   (applyBulk is excluded — handled above)
 * - Skips titles on the blocklist. A skipped card is marked "Not interested"
 *   so the feed advances.
 * - If the Opportunities feed has nothing to apply to, opens Instahyre search for
 *   this profile's skills and sets Experience to 3 years (0–3).
 * - Stops when no View job / Apply control is left, or the cap is hit.
 *
 * NOTES:
 * - Instahyre apply is one-click: your profile and resume are already on the
 *   account, so this script does not fill a form.
 * - A bulk click submits every job on that button. If that count would pass
 *   MAX_APPLICATIONS, the bulk button is left alone.
 * - Auto-applying may violate Instahyre's ToS. Delays are human-ish. Use at your own risk.
 */
(async function instahyreAutoApply() {
  'use strict';

  const __CFG = (typeof window !== 'undefined' && window.__APPLY_CONFIG) || {};

  // ======================= CONFIG =======================
  const CONFIG = {
    DRY_RUN: true,             // true = open the job and locate Apply, never click it. Flip to false when ready.
    MAX_APPLICATIONS: 15,      // stop after this many applications this run (runner overrides with the daily remainder)
    // Instahyre's modal advances as soon as Apply is clicked, but a click every
    // couple of seconds is an obvious automation signal. Wait between applications.
    MIN_DELAY_MS: 20000,
    MAX_DELAY_MS: 45000,

    // Instahyre's slider is a single value: 3 means jobs for someone with 3 years,
    // which is the top of the 0–3 band. "All" is the far end of the slider.
    MAX_YEARS: 3,
    // Skill searches used when the Opportunities feed has no Apply button.
    // Slugs match Instahyre's /<query>-jobs/ pages.
    SEARCHES: [
      'https://www.instahyre.com/search-jobs?search=true&skills=Java&years=3',
      'https://www.instahyre.com/search-jobs?search=true&skills=Spring%20Boot&years=3',
      'https://www.instahyre.com/search-jobs?search=true&skills=Spring&years=3',
      'https://www.instahyre.com/search-jobs?search=true&skills=Microservices&years=3',
      'https://www.instahyre.com/search-jobs?search=true&skills=Backend&years=3',
      'https://www.instahyre.com/search-jobs?search=true&skills=Full%20Stack&years=3',
    ],
    TITLE_KEYWORDS: [
      'full stack', 'fullstack', 'full-stack', 'mern', 'backend', 'back end',
      'frontend', 'front end', 'software engineer', 'software developer',
      'web developer', 'ai engineer', 'ai developer', 'ai specialist',
      'ml engineer', 'artificial intelligence', 'machine learning',
      'generative ai', 'gen ai', 'genai', 'llm', 'agentic',
      'react', 'node', 'javascript', 'js developer', 'js engineer',
      'typescript', 'python', 'java', 'spring', 'microservices',
      'mobile', 'react native', 'sde', 'member of technical staff',
    ],
    TITLE_BLOCKLIST: [
      'senior staff', 'principal', 'director', 'manager', 'lead', 'devops',
      'data engineer', 'qa', 'test', 'intern', 'designer', 'sales', 'marketing',
      'account executive', 'account manager', 'business development',
      '.net', 'c#', 'php', 'ruby', 'golang', 'ios', 'android native', 'flutter',
    ],
  };

  const CV = __CFG.CV || {};

  // ======================= HELPERS =======================
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const humanDelay = () => sleep(CONFIG.MIN_DELAY_MS + Math.random() * (CONFIG.MAX_DELAY_MS - CONFIG.MIN_DELAY_MS));
  const log = (...a) => console.log('%c[auto-apply]', 'color:#6c3ce0;font-weight:bold', ...a);

  function visible(el) {
    if (!el) return false;
    const btn = el.closest ? (el.closest('button') || el) : el;
    const style = window.getComputedStyle(btn);
    return style.display !== 'none' && style.visibility !== 'hidden' && btn.offsetParent !== null && !btn.disabled;
  }

  function asButton(el) {
    if (!el) return null;
    return el.closest('button') || el;
  }

  // ======================= SELECTORS (from the Instahyre modal) =======================
  const SELECTORS = {
    viewJob: 'button.btn-interested, button.btn-success',
    bulkApply: 'button[ng-click="applyBulk()"]',
    singleApply: [
      '.apply[ng-click*="submitChoice"] .new-btn',
      'button[ng-click*="submitChoice"]',
      'button[ng-click*="apply"]',
    ],
    notInterestedText: /not interested/i,
    appliedText: /applied|application sent|successfully applied/i,
  };

  function cardFingerprint(btn) {
    let n = btn.parentElement;
    let best = '';
    for (let i = 0; i < 8 && n; i++) {
      const t = (n.innerText || '').replace(/\s+/g, ' ').trim();
      if (/view job/i.test(t) && t.length > best.length && t.length < 350) best = t;
      n = n.parentElement;
    }
    return best.slice(0, 180);
  }

  // Fingerprints include the company blurb ("… Mobile, Test Automation …"). Title
  // filters must use only the job title, or words like "test" / "lead" in the blurb
  // permanently skip good Java cards.
  function cardTitle(fp) {
    let t = String(fp || '').split(/view job/i)[0];
    t = t.replace(/\s+Founded in[\s\S]*$/i, '')
      .replace(/\s+\d[\d+]*\+?\s*employees[\s\S]*$/i, '')
      .trim();
    const dash = t.indexOf(' - ');
    if (dash >= 0) t = t.slice(dash + 3).trim();
    return t.slice(0, 100);
  }

  function findViewButton() {
    return [...document.querySelectorAll('button.btn-interested, button')].find((b) => {
      const text = b.textContent.replace(/\s+/g, ' ').trim();
      if (!visible(b) || !/view job/i.test(text) || text.length > 40) return false;
      const fp = cardFingerprint(b);
      if (!fp || state[SEEN_KEY].includes(fp)) return false;
      if (!titleOk(cardTitle(fp))) {
        state[SEEN_KEY].push(fp);
        saveState();
        return false;
      }
      return true;
    }) || null;
  }

  function findNextPageButton() {
    return [...document.querySelectorAll('a, button, [ng-click]')].find((el) => {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      const ng = el.getAttribute('ng-click') || '';
      if (!visible(el)) return false;
      if (/previous|prev/i.test(text)) return false;
      if (/^next/i.test(text) || /nextPage\s*\(/.test(ng)) return true;
      return false;
    }) || null;
  }

  function findBulkButton() {
    const btn = document.querySelector(SELECTORS.bulkApply);
    if (!btn || !visible(btn)) return null;
    if (/apply to\s*0\b/i.test(btn.textContent)) return null;
    return btn;
  }

  function findSingleApply() {
    for (const sel of SELECTORS.singleApply) {
      for (const el of document.querySelectorAll(sel)) {
        const btn = asButton(el);
        if (!visible(btn)) continue;
        const ng = `${btn.getAttribute?.('ng-click') || ''} ${el.getAttribute?.('ng-click') || ''}`;
        if (/applyBulk/.test(ng)) continue;
        const text = btn.textContent.replace(/\s+/g, ' ').trim();
        if (/not interested|view job|^save$/i.test(text)) continue;
        if (SELECTORS.appliedText.test(text) && !/apply/i.test(text)) continue;
        return btn;
      }
    }
    return null;
  }

  function findByText(regex) {
    return [...document.querySelectorAll('button, a, [role="button"]')]
      .find((b) => visible(b) && regex.test(b.textContent.replace(/\s+/g, ' ').trim()) && b.textContent.trim().length < 40);
  }

  function readJob() {
    const root = document.querySelector('.modal.in, .modal.show, [role="dialog"], .modal') || document.body;
    const textOf = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
    const titleEl = [...root.querySelectorAll('h1, h2, h3, [class*="job-title" i], [class*="jobTitle"], [class*="candidate-title" i]')]
      .find((el) => {
        const t = textOf(el);
        return t.length > 2 && t.length < 140 && !/instahyre|opportunit/i.test(t);
      });
    const companyEl = [...root.querySelectorAll('[class*="company" i], [class*="employer" i]')]
      .find((el) => {
        const t = textOf(el);
        return t.length > 1 && t.length < 80;
      });
    const title = textOf(titleEl);
    const company = textOf(companyEl).split(' ').slice(0, 8).join(' ');
    return {
      title: title || 'Instahyre opportunity',
      company,
      href: location.href.split('#')[0],
    };
  }

  const titleOk = (t) => {
    const lower = (t || '').toLowerCase();
    if (!lower || lower === 'instahyre opportunity') return true; // title not in the DOM — Instahyre already matched the profile
    return CONFIG.TITLE_KEYWORDS.some((k) => lower.includes(k)) &&
           !CONFIG.TITLE_BLOCKLIST.some((k) => lower.includes(k));
  };

  const bulkCount = (btn) => {
    const n = parseInt((btn.textContent.match(/(\d+)\s*jobs?/i) || [])[1] || '1', 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  };

  // ======================= CROSS-PASTE STATE =======================
  const STORE_KEY = 'autoApplyInstahyre';
  let state;
  try { state = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { state = {}; }
  const SEEN_KEY = CONFIG.DRY_RUN ? 'seenDry' : 'seen';
  if (!Array.isArray(state[SEEN_KEY])) state[SEEN_KEY] = [];
  if (typeof state.applied !== 'number') state.applied = 0;
  const saveState = () => localStorage.setItem(STORE_KEY, JSON.stringify(state));

  function jobKey(job, kind) {
    return `${kind}|${(job.title || '').toLowerCase()}|${(job.company || '').toLowerCase()}`;
  }

  async function dismissBlocked(job) {
    log(`  skip (title filter): ${job.title}${job.company ? ' @ ' + job.company : ''}`);
    const pass = findByText(SELECTORS.notInterestedText);
    if (!pass) {
      log('  ⚠ blocklisted job is on screen and there is no "Not interested" button — stopping so it is not applied.');
      return false;
    }
    if (!CONFIG.DRY_RUN) pass.click();
    else log('  🔍 DRY_RUN — would click: "Not interested"');
    state[SEEN_KEY].push(jobKey(job, 'skip'));
    saveState();
    await sleep(1500);
    return true;
  }

  function logApplying(job, extra) {
    const at = job.company ? `${job.title} @ ${job.company}` : job.title;
    log(`▶ Applying: ${at}${extra ? ' — ' + extra : ''} | ${job.href}`);
  }

  // Dry runs must not touch state.applied — that counter is the live cap, and a
  // practice pass would otherwise burn it. The runner counts the log lines itself.
  async function countApplies(n) {
    const room = CONFIG.MAX_APPLICATIONS - state.applied;
    const take = Math.min(n, room);
    for (let i = 0; i < take; i++) {
      if (CONFIG.DRY_RUN) {
        log('  🔍 DRY_RUN — would click: "Apply"');
      } else {
        state.applied++;
        saveState();
        log('  ✅ applied');
        log(`  progress: ${state.applied}/${CONFIG.MAX_APPLICATIONS}`);
      }
    }
    return take;
  }

  // Experience slider lives on both Opportunities and the public job search.
  // Leaving it on "All" includes senior roles. 3 is the 0–3 year band.
  async function ensureExperienceFilter() {
    const el = document.querySelector('.experience-filter');
    if (!el || !window.angular) return false;
    let scope;
    try { scope = window.angular.element(el).scope(); } catch (e) { return false; }
    if (!scope || !scope.search) return false;
    const label = () => (document.querySelector('.experience-filter .slider-value')?.textContent || '').trim();
    if (label() === String(CONFIG.MAX_YEARS)) return true;
    const owner = typeof scope.applyYearsFilter === 'function' ? scope : scope.$parent;
    if (!owner || typeof owner.applyYearsFilter !== 'function') return false;
    try {
      if (scope.$$phase) scope.search.sliderExperience = CONFIG.MAX_YEARS;
      else scope.$apply(() => { scope.search.sliderExperience = CONFIG.MAX_YEARS; });
      owner.applyYearsFilter();
    } catch (e) {
      log('  ⚠ could not set experience filter: ' + e.message);
      return false;
    }
    log(`Experience filter set to ${CONFIG.MAX_YEARS} years (0–${CONFIG.MAX_YEARS}).`);
    for (let i = 0; i < 20; i++) {
      await sleep(300);
      if (label() === String(CONFIG.MAX_YEARS)) {
        await sleep(2000); // list re-renders after the slider sticks
        return true;
      }
    }
    return false;
  }

  // Opportunities was empty. Walk skill searches; a navigation reloads the page
  // and the runner injects this script again.
  function goToNextSearch() {
    let skill = '';
    try { skill = new URL(location.href).searchParams.get('skills') || ''; } catch (e) { skill = ''; }
    const idx = CONFIG.SEARCHES.findIndex((u) => {
      try { return (new URL(u).searchParams.get('skills') || '') === skill; } catch (e) { return false; }
    });
    const next = idx === -1 ? CONFIG.SEARCHES[0] : CONFIG.SEARCHES[idx + 1];
    if (!next || next === location.href) return false;
    log(`No Apply button on this page. Next search: ${next}`);
    location.href = next;
    return true;
  }

  const OPEN_KEY = 'instahyreOpenJob';

  function readScore() {
    const text = (document.body.innerText || '').replace(/\s+/g, ' ').trim();
    const m = text.match(/InstaMatch score\s+\S{0,6}\s*(high|medium|low)/i);
    return {
      rating: m ? m[1].toLowerCase() : 'unknown',
      text: m ? m[0].slice(0, 80) : '',
    };
  }

  function pageReady() {
    const text = document.body.innerText || '';
    return /InstaMatch score/i.test(text) && !/\[\[ employer/.test(text);
  }

  function mainActionButton() {
    return [...document.querySelectorAll('button.btn-filled')].find((b) => {
      const text = b.textContent.replace(/\s+/g, ' ').trim();
      return /^(apply|application sent)\b/i.test(text);
    }) || null;
  }

  function jobApplyButton() {
    const btn = mainActionButton();
    if (!btn || btn.disabled) return null;
    const text = btn.textContent.replace(/\s+/g, ' ').trim();
    return /^apply\b/i.test(text) ? btn : null;
  }

  function alreadySent() {
    const btn = mainActionButton();
    return !!(btn && /application sent|already applied/i.test(btn.textContent || ''));
  }

  function finishJob() {
    try { localStorage.removeItem(OPEN_KEY); } catch (e) {}
    if (window.opener) window.close();
  }

  // View job opens a NEW TAB. This runs in that tab: read InstaMatch, and if it
  // is LOW ask the runner to rewrite skills + replace the resume before Apply.
  async function handleJobPage() {
    const job = readJob();
    const urlKey = location.pathname;
    let freshSeen = [];
    try { freshSeen = (JSON.parse(localStorage.getItem(STORE_KEY) || '{}')[SEEN_KEY]) || []; } catch (e) { freshSeen = []; }
    if (window.__aaJobHandled || freshSeen.includes(urlKey) || state[SEEN_KEY].includes(urlKey)) {
      log('This job was already opened — not opening it again.');
      finishJob();
      return;
    }
    window.__aaJobHandled = true;
    state[SEEN_KEY].push(urlKey);
    saveState();
    log(`▶ Applying: ${job.title}${job.company ? ' @ ' + job.company : ''} | ${location.href}`);

    let ready = false;
    for (let i = 0; i < 30 && !ready; i++) {
      ready = pageReady();
      if (!ready) await sleep(400);
    }
    if (!ready) {
      log('Job page did not finish loading — skipping without counting it.');
      finishJob();
      return;
    }

    const score = readScore();
    log(`InstaMatch: ${score.rating}${score.text ? ' — ' + score.text : ''}`);
    const sent = alreadySent();
    const alreadyTailored = localStorage.getItem('instahyreProfileTailored') === '1';

    // Low score: rewrite skills and replace the resume before Apply.
    // If this job was already sent, still do that update once so later jobs match better.
    if (score.rating === 'low' && (!sent || !alreadyTailored)) {
      const id = (location.pathname.match(/\/job-(\d+)/) || [])[1] || 'job';
      window.__aaJobBrief = {
        title: job.title,
        company: job.company,
        href: location.href,
        jd: (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 6000),
      };
      window.__aaTailorDone = false;
      window.__aaTailorSkip = false;
      log(`🎯 TAILOR_NEEDED | ${job.title} | ${id} | ${location.href}`);
      const done = await (async () => {
        const end = Date.now() + 180000;
        while (Date.now() < end) {
          if (window.__aaTailorDone) return true;
          await sleep(500);
        }
        return false;
      })();
      if (!done || window.__aaTailorSkip) {
        log('Profile/resume update did not finish — not applying to this low-score job.');
        finishJob();
        return;
      }
      localStorage.setItem('instahyreProfileTailored', '1');
      log('Profile skills saved and resume replaced for this job.');
    }

    if (sent) {
      log('Already applied — skipping, and it will not be opened again.');
      finishJob();
      return;
    }

    const apply = jobApplyButton() || findSingleApply();
    if (!apply) {
      const labels = [...document.querySelectorAll('button')]
        .map((b) => (b.textContent || '').replace(/\s+/g, ' ').trim())
        .filter((t) => /apply|sent|interest/i.test(t))
        .slice(0, 4);
      log('No Apply button on this job. Buttons: ' + (labels.join(' | ') || 'none'));
      finishJob();
      return;
    }
    if (CONFIG.DRY_RUN) {
      log('  🔍 DRY_RUN — would click: "Apply"');
    } else {
      apply.click();
      await sleep(1200);
      log('  ✅ applied');
    }
    finishJob();
  }

  // ======================= MAIN LOOP =======================
  log(`Starting. DRY_RUN=${CONFIG.DRY_RUN}, max=${CONFIG.MAX_APPLICATIONS}, applied so far: ${state.applied}${CV.name ? ', as ' + CV.name : ''}`);
  if (!/instahyre\./.test(location.hostname)) {
    log('⚠ Open instahyre.com → Opportunities first.');
    return;
  }
  if (/\/candidate\/profile/i.test(location.pathname)) return;
  if (/\/job-\d+/.test(location.pathname)) {
    await handleJobPage();
    return;
  }

  let idlePasses = 0;
  let lastFingerprint = '';
  let demonstrated = 0;
  let experienceReady = false;

  while (state.applied < CONFIG.MAX_APPLICATIONS) {
    if (!experienceReady) {
      experienceReady = await ensureExperienceFilter();
    }
    // Don't open a card until the 0–3 filter is on. An unfiltered list includes senior roles.
    if (!experienceReady) {
      idlePasses++;
      if (idlePasses < 12) { await sleep(1000); continue; }
      log('No View job or Apply button on this page.');
      if (goToNextSearch()) return;
      log('🎉 Skill searches are exhausted.');
      break;
    }
    const bulk = findBulkButton();
    const single = bulk ? null : findSingleApply();
    const job = readJob();

    if (bulk || single) {
      idlePasses = 0;
      const kind = bulk ? 'bulk' : 'single';
      const btn = bulk || single;
      const label = btn.textContent.replace(/\s+/g, ' ').trim().slice(0, 80);
      const named = job.title !== 'Instahyre opportunity';
      const key = named ? jobKey(job, kind) + '|' + label : '';
      // Fingerprint stops a stuck button (dry run never clicks, so the same
      // control stays; a failed live click does too). Unnamed jobs don't go
      // into `seen`, or every card would look like the first one.
      const fingerprint = `${kind}|${job.title}|${job.company}|${label}`;
      const howMany = bulk ? bulkCount(bulk) : 1;

      if (fingerprint === lastFingerprint || (key && state[SEEN_KEY].includes(key))) {
        log(CONFIG.DRY_RUN
          ? 'DRY RUN finished — Apply was found and not clicked. Set DRY_RUN=false (or pass --live) to apply for real.'
          : 'This Apply button is still the one just used — stopping.');
        break;
      }

      if (!bulk && !titleOk(job.title)) {
        const skipKey = jobKey(job, 'skip');
        if (state[SEEN_KEY].includes(skipKey)) {
          log('Blocklisted job is still on screen — stopping so it is not applied.');
          break;
        }
        const moved = await dismissBlocked(job);
        if (!moved) break;
        await humanDelay();
        continue;
      }

      const remaining = CONFIG.MAX_APPLICATIONS - state.applied;
      if (howMany > remaining) {
        log(`Bulk Apply says ${howMany} jobs and only ${remaining} slot(s) remain — not clicking it.`);
        break;
      }

      logApplying(job, label);
      if (key) {
        state[SEEN_KEY].push(key);
        saveState();
      }
      lastFingerprint = fingerprint;

      if (!CONFIG.DRY_RUN) {
        btn.scrollIntoView({ block: 'center' });
        btn.click();
        await sleep(1200);
      }
      demonstrated += await countApplies(howMany);
      if (CONFIG.DRY_RUN) break; // the button stays, so one demonstration is the whole dry run
      await humanDelay();
      continue;
    }

    const view = findViewButton();
    if (view) {
      idlePasses = 0;
      let lock = null;
      try { lock = JSON.parse(localStorage.getItem(OPEN_KEY) || 'null'); } catch (e) { lock = null; }
      // One job tab at a time. The same card used to be clicked on every pass
      // because View job opens a new tab and this list never changed.
      if (lock && Date.now() - lock.at < 90000) {
        await sleep(1500);
        continue;
      }
      const fp = cardFingerprint(view);
      state[SEEN_KEY].push(fp);
      saveState();
      localStorage.setItem(OPEN_KEY, JSON.stringify({ fp, at: Date.now() }));
      log(`👁 Opening job via "View job »" — ${fp.slice(0, 80)}`);
      view.scrollIntoView({ block: 'center' });
      view.click();
      await sleep(1500);
      continue;
    }

    idlePasses++;
    if (idlePasses < 6) {
      await sleep(1000);
      continue;
    }
    const visibleViews = [...document.querySelectorAll('button.btn-interested, button')]
      .filter((b) => visible(b) && /view job/i.test(b.textContent || '')).length;
    const nextPage = findNextPageButton();
    if (visibleViews > 0 && nextPage) {
      log(`All ${visibleViews} jobs on this page already opened — next page.`);
      idlePasses = 0;
      nextPage.click();
      await sleep(2500);
      continue;
    }
    log(visibleViews > 0
      ? `No new View job left (${visibleViews} already opened).`
      : 'No View job or Apply button on this page.');
    if (goToNextSearch()) return;
    log('🎉 Skill searches are exhausted.');
    break;
  }

  if (state.applied >= CONFIG.MAX_APPLICATIONS) {
    log(`Cap reached (${state.applied}/${CONFIG.MAX_APPLICATIONS}).`);
  }
  log(CONFIG.DRY_RUN
    ? `DRY RUN finished — nothing was sent (${demonstrated} Apply click(s) located). Set DRY_RUN=false and re-paste to apply for real.`
    : `Finished. Applied to ${state.applied} jobs total. Clear localStorage["${STORE_KEY}"] to reset the counter.`);
})();
