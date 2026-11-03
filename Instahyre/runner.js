/**
 * Instahyre Auto-Apply Runner
 * Drives instahyre-auto-apply.js with Playwright.
 *
 * Usage:
 *   node runner.js login            one-time: visible Chrome opens - log in manually, then close window
 *   node runner.js                  dry run: finds Apply, does not click it
 *   node runner.js --live           applies for real
 *   node runner.js --show           keep browser window visible on screen
 *   node runner.js --minimize       keep browser minimised in taskbar
 *   node runner.js --update-skills  runs standalone resume PDF skill updater
 */
const path = require('path');
const fs = require('fs');
const { CV, geminiKey, resumePath: RESUME_PATH } = require('./config');
const { minimizeBrowserWindows, hideBrowserWindows, SHOW_FLAG } = require('./window-utils');
const { tailorForJob } = require('./instahyre-tailor');
const { writeResumePdf } = require('./instahyre-resume-pdf');
const { updateInstahyreProfile } = require('./instahyre-profile');
const { runOpportunitiesBranch } = require('./instahyre-branch');

let chromium;
try {
  const { addExtra } = require('playwright-extra');
  chromium = addExtra(require('playwright-core').chromium);
  chromium.use(require('puppeteer-extra-plugin-stealth')());
} catch (e) {
  ({ chromium } = require('playwright-core'));
}

process.on('unhandledRejection', (e) => console.log(`[${new Date().toLocaleString()}] unhandledRejection (ignored): ${String(e && e.message || e).split('\n')[0]}`));
process.on('uncaughtException', (e) => console.log(`[${new Date().toLocaleString()}] uncaughtException (ignored): ${String(e && e.message || e).split('\n')[0]}`));

if (process.argv.includes('--update-skills')) {
  const { main: runSkillUpdater } = require('./resume-instahyre-skill-update/src/cli');
  const forwardedArgs = process.argv.slice(2).filter((arg) => arg !== '--update-skills');
  runSkillUpdater(forwardedArgs).catch((err) => {
    console.error('Skill updater error:', err.message);
    process.exit(1);
  });
  return;
}

const LOGIN_MODE = process.argv.includes('login');
const LIVE = process.argv.includes('--live');
const SCHEDULED = process.argv.includes('--scheduled');
const SHOW_WINDOW = process.argv.includes('--show');
const MINIMIZE_ONLY = process.argv.includes('--minimize');
const ACTIVE_FROM = 9;
const ACTIVE_UNTIL = 23;

const SITE = {
  script: 'instahyre-auto-apply.js',
  profile: '.instahyre-chrome-profile',
  searches: [
    'https://www.instahyre.com/search-jobs?search=true&skills=Java&years=3',
    'https://www.instahyre.com/search-jobs?search=true&skills=Spring%20Boot&years=3',
    'https://www.instahyre.com/search-jobs?search=true&skills=Spring&years=3',
    'https://www.instahyre.com/search-jobs?search=true&skills=Microservices&years=3',
    'https://www.instahyre.com/search-jobs?search=true&skills=Backend&years=3',
    'https://www.instahyre.com/search-jobs?search=true&skills=Full%20Stack&years=3',
  ],
  loginUrl: 'https://www.instahyre.com/login/',
  injectOn: (url) => /instahyre\.com/.test(url) && !/\/login|\/register/.test(url),
  submittedRe: /✅ applied|DRY_RUN — would click: "Apply"/,
  storeKey: 'autoApplyInstahyre',
  dailyCap: 25,
  perRun: 10,
  tailorBeforeApply: true,
};

const DAILY_CAP = SITE.dailyCap || 25;
const STATE_FILE = path.join(__dirname, 'apply-state-instahyre.json');
const todayKey = new Date().toDateString();
let dayState = { date: todayKey, count: 0 };
try {
  const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8').replace(/^\uFEFF/, ''));
  if (s.date === todayKey) dayState = s;
} catch (e) { }
const bumpDayCount = () => {
  dayState.count++;
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(dayState)); } catch (e) { }
};
const TARGET = Math.min(SITE.perRun || DAILY_CAP, DAILY_CAP - dayState.count);
const MAX_RUNTIME_MS = 100 * 60 * 1000;
const IDLE_ROTATE_MS = 4 * 60 * 1000;

const log = (msg) => console.log(`[${new Date().toLocaleString()}] [instahyre] ${msg}`);

const CSV_FILE = path.join(__dirname, 'applications.csv');
const SKILLS = ['JavaScript', 'TypeScript', 'Python', 'Java', 'React', 'Next.js', 'React Native', 'Node.js',
  'Express', 'FastAPI', 'MongoDB', 'PostgreSQL', 'Redis', 'GraphQL', 'WebSockets', 'Docker', 'Kubernetes',
  'GCP', 'AWS', 'CI/CD', 'LangChain', 'LangGraph', 'RAG', 'LLM', 'GenAI', 'Machine Learning', 'MCP', 'Pinecone', 'FAISS'];
const matchSkills = (t) => { const l = t.toLowerCase(); return SKILLS.filter((s) => l.includes(s.toLowerCase())).join('; '); };
const csvRow = (vals) => vals.map((v) => '"' + String(v || '').replace(/"/g, '""').replace(/\s+/g, ' ').trim() + '"').join(',') + '\n';
function logApplication(job) {
  if (!fs.existsSync(CSV_FILE)) {
    fs.writeFileSync(CSV_FILE, '\uFEFF' + csvRow(['Date', 'Site', 'Role', 'Company', 'CTC/Salary', 'Skills', 'Job Link', 'Verified', 'Job Description']));
  }
  fs.appendFileSync(CSV_FILE, csvRow([new Date().toLocaleString(), 'instahyre', job.title, job.company, job.salary, job.skills, job.link, job.verified || 'n/a', job.jd]));
}

const seenJobs = new Set();
function buildInjection() {
  const raw = fs
    .readFileSync(path.join(__dirname, SITE.script), 'utf8')
    .replace(/DRY_RUN: true/, `DRY_RUN: ${!LIVE}`)
    .replace(/MAX_APPLICATIONS: \d+/, `MAX_APPLICATIONS: ${TARGET}`);
  return `(async () => {
    if (window.__aaBusy) return; window.__aaBusy = true;
    window.__APPLY_CONFIG = ${JSON.stringify({ CV, geminiKey, seen: [...seenJobs], tailorBeforeApply: !!SITE.tailorBeforeApply, resumeName: path.basename(RESUME_PATH) })};
    try { await ${raw}
    } finally { window.__aaBusy = false; }
  })()`;
}

(async () => {
  if (SCHEDULED && !LOGIN_MODE) {
    const hour = new Date().getHours();
    if (hour < ACTIVE_FROM || hour >= ACTIVE_UNTIL) {
      log(`Outside active hours (${ACTIVE_FROM}:00-${ACTIVE_UNTIL}:00) — skipping this run.`);
      return;
    }
    const jitterMs = Math.floor(Math.random() * 14 * 60 * 1000);
    log(`Scheduled run: waiting ${Math.round(jitterMs / 60000)} min before starting.`);
    await new Promise((r) => setTimeout(r, jitterMs));
  }
  if (!LOGIN_MODE && TARGET <= 0) {
    log(`Daily cap of ${DAILY_CAP} applications already reached (${dayState.count} today) — exiting.`);
    return;
  }

  const launch = () => chromium.launchPersistentContext(path.join(__dirname, SITE.profile), {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      SHOW_WINDOW || MINIMIZE_ONLY || LOGIN_MODE ? '--window-position=0,0' : '--window-position=-32000,-32000',
    ],
  });

  let sweepTimer = null;
  const tuckAway = async (ctx) => {
    if (LOGIN_MODE || SHOW_WINDOW) return;
    const stow = MINIMIZE_ONLY ? minimizeBrowserWindows : hideBrowserWindows;
    const dir = path.join(__dirname, SITE.profile);
    const sweep = async () => {
      if (fs.existsSync(SHOW_FLAG)) return;
      await stow(dir).catch(() => { });
    };
    await new Promise((r) => setTimeout(r, 1200));
    await sweep();
    if (sweepTimer) clearInterval(sweepTimer);
    sweepTimer = setInterval(() => { sweep(); }, 4000);
    sweepTimer.unref?.();
    ctx.once('close', () => { if (sweepTimer) clearInterval(sweepTimer); });
  };

  if (LOGIN_MODE) {
    const ctx = await launch();
    const mainPage = ctx.pages()[0] || (await ctx.newPage());
    await mainPage.goto(SITE.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => { });
    log('Chrome is open — log in to Instahyre, then CLOSE the browser window. Session is saved automatically.');
    await new Promise((res) => ctx.on('close', res));
    log('Login window closed. Session saved. Now test with: npm run dry-run (or node runner.js)');
    return;
  }

  log(`Starting. mode=${LIVE ? 'LIVE' : 'DRY RUN'} target=${TARGET} applications, max ${MAX_RUNTIME_MS / 60000} min`);
  const deadline = Date.now() + MAX_RUNTIME_MS;
  let submitted = 0;
  let lastActivity = Date.now();
  let searchIdx = 0;
  let pendingJob = null;
  let lastTailoredJob = false;
  const VERIFY_PAGES = new Set();
  const injectedJobTabs = new WeakSet();

  const isBusy = (p) => p.evaluate('!!window.__aaBusy').catch(() => false);
  const lastInjectAt = new WeakMap();
  const inject = async (page, { force = false } = {}) => {
    const now = Date.now();
    const prev = lastInjectAt.get(page) || 0;
    if (!force && now - prev < 20000) return;
    lastInjectAt.set(page, now);
    await page.evaluate(buildInjection()).catch(() => { });
  };

  function wire(page) {
    page.once('domcontentloaded', async () => {
      try {
        if (VERIFY_PAGES.has(page)) return;
        if (!SITE.injectOn(page.url())) return;
        if (/\/job-\d+/.test(page.url())) await inject(page, { force: true });
      } catch (_) { }
    });

    page.on('console', (msg) => {
      const text = msg.text();
      if (!/auto-apply/.test(text)) return;
      lastActivity = Date.now();
      const clean = text.replace(/%c\[auto-apply\]\s*\S*/, '').trim();
      log('  ' + clean.slice(0, 160));

      if (/Opening job via/i.test(clean)) {
        (async () => {
          const ctx = page.context();
          const d = Date.now() + 15000;
          while (Date.now() < d) {
            const jobTab = ctx.pages().find((p) => /\/job-\d+/.test(p.url()) && !injectedJobTabs.has(p));
            if (jobTab) {
              injectedJobTabs.add(jobTab);
              await jobTab.waitForLoadState('domcontentloaded').catch(() => { });
              await inject(jobTab, { force: true });
              return;
            }
            await new Promise((r) => setTimeout(r, 400));
          }
        })();
      }

      const m = clean.match(/▶ (?:Applying|Opening)[^:]*: (.+)/);
      if (m) {
        const [main, link, cardSalary] = m[1].split(' | ');
        const atParts = main.split(' @ ');
        const company = atParts.length > 1 ? atParts.pop() : '';
        const title = atParts.join(' @ ');
        const idm = (link || main).match(/\/job[s]?[/-](\d+)/);
        const slug = idm ? '/job-' + idm[1] : undefined;
        if (slug) seenJobs.add(slug);
        pendingJob = { title: title.trim(), company: (company || '').replace(/^\?$/, '').trim(), link: (link || '').trim(), salary: (cardSalary || '').trim(), skills: '', jd: '' };
      }

      const tailorM = clean.match(/🎯 TAILOR_NEEDED \| (.+) \| ([^|]+) \| (\S+)/);
      if (tailorM && SITE.tailorBeforeApply) {
        const title = tailorM[1].trim();
        const jk = tailorM[2].trim();
        (async () => {
          try {
            log(` Low InstaMatch — updating profile and resume for: ${title}`);
            const scraped = await page.evaluate(() => window.__aaJobBrief || null);
            const job = {
              title: (scraped && scraped.title) || title,
              company: (scraped && scraped.company) || '',
              jd: (scraped && scraped.jd) || '',
            };
            const tailor = await tailorForJob({ geminiKey, CV, job });
            tailor.jobJd = job.jd || '';
            log(`  tailor(${tailor.source || '?'}): ${(tailor.skills || []).slice(0, 6).join(', ')}`);
            const pdfPath = await writeResumePdf(page.context(), {
              tailor,
              name: CV.name,
              jobKey: jk,
            });
            await updateInstahyreProfile(page.context(), {
              tailor, pdfPath, live: LIVE, log: (msg) => log(msg), guard: VERIFY_PAGES, jobTitle: job.title,
            });
            await page.evaluate(() => { window.__aaTailorSkip = false; window.__aaTailorDone = true; });
            lastTailoredJob = true;
            log(LIVE ? '  Profile and resume updated — unblocking Apply' : '  DRY RUN — resume not replaced — unblocking Apply');
            lastActivity = Date.now();
          } catch (e) {
            const err = String(e && e.message || e).split('\n')[0].slice(0, 160);
            log(`  Profile/resume update FAILED — skipping apply: ${err}`);
            await page.evaluate(() => { window.__aaTailorSkip = true; window.__aaTailorDone = true; }).catch(() => { });
          }
        })();
      }

      if (SITE.submittedRe.test(text)) {
        submitted++;
        log(`==> ${submitted}/${TARGET} this run (${dayState.count + (LIVE ? 1 : 0)}/${DAILY_CAP} today)`);
        if (LIVE) {
          bumpDayCount();
          const job = pendingJob || { title: 'unknown' };
          try { logApplication(job); } catch (e) { log('CSV write failed: ' + e.message); }
        }
        pendingJob = null;

        // Tree Workflow (Option A): After successfully tailoring and applying to a job,
        // spawn a child branch to apply directly to recommended opportunities based on the updated profile.
        if (lastTailoredJob) {
          lastTailoredJob = false;
          (async () => {
            try {
              const remaining = TARGET - submitted;
              if (remaining > 0) {
                await runOpportunitiesBranch(page.context(), {
                  live: LIVE,
                  maxBranchApplies: Math.min(3, remaining),
                  log: (msg) => log(msg),
                  guard: VERIFY_PAGES,
                  onApplied: (childJob) => {
                    submitted++;
                    if (LIVE) {
                      bumpDayCount();
                      try { logApplication(childJob); } catch (_) {}
                    }
                  },
                });
              }
            } catch (err) {
              log(`  Opportunities branch failed (non-fatal): ${err.message}`);
            }
          })();
        }
      }
    });

    page.on('load', async () => {
      if (VERIFY_PAGES.has(page)) return;
      if (!SITE.injectOn(page.url())) return;
      lastActivity = Date.now();
      if (SITE.storeKey) {
        await page.evaluate(([key, today]) => {
          try {
            const s = JSON.parse(localStorage.getItem(key) || '{}');
            if (s.day !== today) {
              s.day = today; s.submitted = 0; s.applied = 0;
              s.seen = (s.seen || []).slice(-2000);
              s.seenDry = (s.seenDry || []).slice(-2000);
              localStorage.setItem(key, JSON.stringify(s));
            }
          } catch (e) { }
        }, [SITE.storeKey, new Date().toDateString()]).catch(() => { });
      }
      await inject(page);
    });
  }

  async function session() {
    const ctx = await launch();
    await tuckAway(ctx);
    const mainPage = ctx.pages()[0] || (await ctx.newPage());
    searchIdx = 0;
    lastActivity = Date.now();
    let fruitless = 0;
    let submittedAtCycle = submitted;

    try {
      ctx.pages().forEach(wire);
      ctx.on('page', wire);

      await mainPage.goto(SITE.searches[0], { waitUntil: 'domcontentloaded', timeout: 60000 });
      await mainPage.waitForTimeout(6000);
      const bodyText = await mainPage.evaluate('document.body.innerText.slice(0, 2000)').catch(() => '');
      if (/sign in|log in to continue|create an account/i.test(bodyText) && !/sign out/i.test(bodyText)) {
        log('WARNING: page looks logged out. Run: npm run login (or node runner.js login)');
      }
      await inject(mainPage);

      while (submitted < TARGET && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 45000));
        const pages = ctx.pages();
        let anyBusy = false;
        for (const p of pages) {
          if (VERIFY_PAGES.has(p)) continue;
          if (await isBusy(p)) anyBusy = true;
        }

        if (!anyBusy) {
          if (Date.now() - lastActivity > IDLE_ROTATE_MS) {
            searchIdx++;
            if (searchIdx >= SITE.searches.length) { log('All searches exhausted.'); break; }
            log(`Rotating to next search: ${SITE.searches[searchIdx]}`);
            await mainPage.goto(SITE.searches[searchIdx], { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => { });
          } else {
            if (submitted === submittedAtCycle) {
              if (++fruitless >= 3) {
                log('No applications in 3 script cycles — closing browser and reopening.');
                return;
              }
            } else {
              fruitless = 0;
              submittedAtCycle = submitted;
            }
            await inject(mainPage);
          }
        }
      }
    } finally {
      await ctx.close().catch(() => { });
    }
  }

  while (submitted < TARGET && Date.now() < deadline) {
    await session().catch((e) => log('session error: ' + (e && e.message || e)));
    if (submitted < TARGET && Date.now() < deadline) {
      log('Restarting browser session in 10s…');
      await new Promise((r) => setTimeout(r, 10000));
    }
  }

  log(`Finished: ${submitted}/${TARGET} applications ${LIVE ? 'submitted' : 'simulated (dry run)'}.`);
})().catch((e) => {
  log('FATAL: ' + (e && e.message || e));
  process.exit(1);
});

