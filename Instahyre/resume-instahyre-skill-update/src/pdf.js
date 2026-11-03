const fs = require('node:fs/promises');
const pdfParse = require('pdf-parse');
const { parseTechnicalSkills } = require('./skills');

async function extractSkillsFromBuffer(buffer, parser = pdfParse) {
  const parsed = await parser(buffer);
  const text = String(parsed && parsed.text || '').trim();
  if (!text) throw new Error('PDF contains no extractable text');
  return parseTechnicalSkills(text);
}

async function extractSkillsFromPdf(pdfPath) {
  const buffer = await fs.readFile(pdfPath);
  return extractSkillsFromBuffer(buffer);
}

module.exports = { extractSkillsFromBuffer, extractSkillsFromPdf };
