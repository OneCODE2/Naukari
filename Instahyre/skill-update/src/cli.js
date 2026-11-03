const path = require('node:path');
const fs = require('node:fs/promises');
const { extractSkillsFromPdf } = require('./pdf');
const { selectSkills } = require('./skills');
const { updateProfileSkills } = require('./instahyre');

const PROJECT_DIR = path.resolve(__dirname, '..');
const DEFAULT_PDF = path.resolve(PROJECT_DIR, '..', '..', 'naukri_update', 'Aditya_Software_Engineer_.pdf');
const OUTPUT_FILE = path.join(PROJECT_DIR, 'output', 'skills.json');

function buildDryRunResult(skills) {
  const selected = selectSkills(skills);
  return { mode: 'dry-run', skills: selected, count: selected.length };
}

async function main(argv = process.argv.slice(2)) {
  const live = argv.includes('--live');
  const pathIndex = argv.indexOf('--pdf');
  const pdfPath = pathIndex >= 0 && argv[pathIndex + 1] ? path.resolve(argv[pathIndex + 1]) : DEFAULT_PDF;
  const skills = await extractSkillsFromPdf(pdfPath);
  const result = buildDryRunResult(skills);
  if (live) {
    const cdpIndex = argv.indexOf('--cdp-url');
    const cdpUrl = cdpIndex >= 0 ? argv[cdpIndex + 1] : process.env.CDP_URL;
    if (!cdpUrl) throw new Error('Live mode requires --cdp-url or CDP_URL');
    const { chromium } = require('playwright-core');
    const browser = await chromium.connectOverCDP(cdpUrl);
    const context = browser.contexts()[0];
    if (!context) throw new Error('No browser context available at the supplied CDP URL');
    const page = await context.newPage();
    try {
      const finalSkills = await updateProfileSkills(page, result.skills, console.log);
      console.log(JSON.stringify({ mode: 'live', skills: finalSkills, count: finalSkills.length }, null, 2));
    } finally {
      await page.close().catch(() => { });
      await browser.close().catch(() => { });
    }
    return result;
  }
  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, JSON.stringify({ ...result, source: pdfPath }, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { DEFAULT_PDF, OUTPUT_FILE, buildDryRunResult, main };
