/**
 * Compiles tailored resume LaTeX to PDF using local Tectonic engine.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { formatSkillRows, escapeLatex } = require('./instahyre-tailor');

const OUT_DIR = path.join(__dirname, '.instahyre-tailored');
const TEMPLATE_PATH = path.join(__dirname, 'resume-template.tex');
const TECTONIC_BIN = path.join(__dirname, '..', 'bin', 'tectonic.exe');

/**
 * Builds full LaTeX code by populating resume-template.tex placeholders.
 */
function generateLatex(tailor) {
  let template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

  // Summary
  const summaryTex = escapeLatex(tailor.summary || '')
    .replace(/\\%/g, '%')
    .replace(/%/g, '\\%');
  template = template.replace('{{SUMMARY}}', summaryTex);

  // Experience bullets
  const bullets = (tailor.experienceBullets || [])
    .map((b) => `\\item ${b}`)
    .join('\n\n');
  template = template.replace('{{EXPERIENCE_BULLETS_1}}', bullets);

  // Skill rows
  const skillRows = formatSkillRows(tailor.skillCategories || {});
  template = template.replace('{{SKILL_ROWS}}', skillRows);

  return template;
}

/**
 * Compiles the tailored LaTeX file to PDF.
 * @param {any} _context Unused (kept for signature compatibility)
 * @param {{ tailor: object, jobKey?: string }} opts
 * @returns {Promise<string>} absolute path to PDF
 */
async function writeResumePdf(_context, opts) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const safe = String(opts.jobKey || Date.now()).replace(/[^\w.-]+/g, '_').slice(0, 40);
  const texPath = path.join(OUT_DIR, `resume-${safe}.tex`);
  const pdfPath = path.join(OUT_DIR, `resume-${safe}.pdf`);

  const latexContent = generateLatex(opts.tailor || {});
  fs.writeFileSync(texPath, latexContent, 'utf8');

  try {
    const cmd = `"${TECTONIC_BIN}" "${texPath}" --outdir "${OUT_DIR}"`;
    execSync(cmd, { stdio: 'pipe' });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : err.message;
    throw new Error(`Tectonic compilation failed: ${stderr.slice(0, 300)}`);
  }

  if (!fs.existsSync(pdfPath) || fs.statSync(pdfPath).size < 1000) {
    throw new Error('PDF output missing or too small');
  }

  return pdfPath;
}

module.exports = { writeResumePdf, generateLatex, OUT_DIR };
