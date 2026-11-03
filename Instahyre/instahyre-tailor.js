/**
 * Gemini-powered per-job tailor for Instahyre: headline, summary, skills, and LaTeX resume.
 */
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const FALLBACK_MODELS = ['gemini-3.8-flash', 'gemini-flash-latest'];

function escapeLatex(text) {
  if (!text) return '';
  return String(text)
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/[%$&_{}#]/g, '\\$&')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

function extractJsonObject(text) {
  if (!text) return null;
  let raw = String(text).trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) raw = fenced[1].trim();
  try { return JSON.parse(raw); } catch (_) {}
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)); } catch (_) {}
  }
  return null;
}

const DEFAULT_BULLETS = [
  'Built and maintained a React 19 admin application with role based access control across 10+ modules, integrating 50+ REST APIs and reducing administrative task time by 40\\%.',
  'Integrated ERP APIs to automate order synchronization, eliminating 100\\% of manual processing and reducing fulfillment errors by 90\\%.',
  'Developed scheduled Java and Spring Boot jobs to collect analytics data and load it into PostgreSQL, automating reporting workflows and resolving JDBC and Hibernate schema validation issues.',
  'Designed PostgreSQL schemas and optimized SQL queries for quotation and inventory systems, using relational constraints and object oriented design principles to maintain data integrity.',
  'Worked on automated testing, code reviews, debugging, and defect resolution across development, testing, and production environments, helping resolve 70+ UAT defects.',
  'Deployed a RAG powered AI chatbot for SleepyHug that autonomously resolves 40--50\\% of inbound customer support queries.',
  'Developed a self service blog CMS and migrated 800+ posts without broken routes. Improved six product pages through server side rendering and image optimization, contributing to 25\\% higher conversions over 90 days.'
];

const DEFAULT_SKILL_CATEGORIES = {
  'Languages': 'Java, Python, TypeScript, JavaScript, SQL',
  'Frontend': 'React.js, React 19, Next.js, Tailwind CSS, Server Side Rendering',
  'Backend': 'Spring Boot, REST APIs, Hibernate/JPA, JDBC, Node.js, Express.js',
  'Databases': 'PostgreSQL, MySQL, Relational Database Design, SQL Optimization',
  'Testing': 'JUnit, Jest, React Testing Library, Unit Testing, Integration Testing, Functional Testing, QA and UAT',
  'Cloud and DevOps': 'AWS, Docker, Jenkins, CI/CD, Linux, Git, Postman',
  'Engineering Practices': 'Object Oriented Programming, Design Patterns, Code Reviews, Debugging, Documentation, Agile/Scrum'
};

function formatSkillRows(skillsMap) {
  return Object.entries(skillsMap)
    .map(([cat, val]) => `\\skillrow{${cat}}{\n${val}\n}`)
    .join('\n\n');
}

function normalizeTailor(parsed, job) {
  if (!parsed || typeof parsed !== 'object') return null;
  const headline = String(parsed.headline || '').trim().slice(0, 120);
  const summary = String(parsed.summary || '').trim().slice(0, 2000);
  let skills = parsed.skills;
  if (typeof skills === 'string') skills = skills.split(/[,|;]/).map((s) => s.trim()).filter(Boolean);
  if (!Array.isArray(skills)) skills = [];
  skills = skills.map((s) => String(s).trim()).filter(Boolean).slice(0, 20);

  let bullets = Array.isArray(parsed.experienceBullets) && parsed.experienceBullets.length
    ? parsed.experienceBullets.map((b) => escapeLatex(b).replace(/\\%/g, '%').replace(/%/g, '\\%'))
    : DEFAULT_BULLETS;

  let skillCategories = (parsed.skillCategories && typeof parsed.skillCategories === 'object')
    ? parsed.skillCategories
    : DEFAULT_SKILL_CATEGORIES;

  if (!headline || !summary || !skills.length) return null;
  return {
    headline,
    summary,
    skills,
    experienceBullets: bullets,
    skillCategories,
    title: job.title || '',
    company: job.company || ''
  };
}

function buildPrompt(CV, job) {
  return `You are tailoring a software engineer's profile & LaTeX resume to MAXIMIZE ATS match for this job.
Keep factual integrity (NIT Manipur graduate, GrowthJockey SDE I experience) while prioritizing JD tech stack & keywords.

Return ONLY valid JSON (no markdown) with this exact schema:
{
  "headline": "Role title | Core stack (max 100 chars)",
  "summary": "3-4 sentence professional summary explicitly highlighting experience in the stack needed by the JD",
  "skills": ["15 to 20 skill strings for ATS & Instahyre profile matching"],
  "skillCategories": {
    "Languages": "Comma separated languages relevant to JD",
    "Frontend": "Comma separated frontend tech",
    "Backend": "Comma separated backend tech",
    "Databases": "Databases & query optimization",
    "Testing": "Testing tools & practices",
    "Cloud and DevOps": "Cloud & CI/CD tools",
    "Engineering Practices": "Engineering practices"
  },
  "experienceBullets": [
    "7 concise bullet points matching Aditya's GrowthJockey work, tailored to emphasize keywords in the JD"
  ]
}

CANDIDATE CV:
${JSON.stringify(CV, null, 2)}

TARGET JOB:
Title: ${job.title || ''}
Company: ${job.company || ''}
Description:
${(job.jd || '').slice(0, 6000)}`;
}

function localTailor(CV, job) {
  const title = (job.title || 'Software Engineer').replace(/\s+/g, ' ').trim();
  const company = (job.company || '').trim();
  const jd = (job.jd || '').toLowerCase();
  const baseSkills = String(CV.skills || '')
    .split(/[,|;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const jdSkills = [
    'React', 'Next.js', 'Node.js', 'TypeScript', 'JavaScript', 'Java', 'Spring Boot', 'Spring',
    'Python', 'FastAPI', 'MySQL', 'Microservices', 'Jenkins',
    'MongoDB', 'PostgreSQL', 'Redis', 'Docker', 'AWS', 'GCP', 'GraphQL', 'LangChain',
    'RAG', 'LLM', 'GenAI', 'React Native', 'Express', 'Kubernetes',
  ].filter((s) => jd.includes(s.toLowerCase()) || title.toLowerCase().includes(s.toLowerCase().split('.')[0]));
  const skills = [...new Set([...jdSkills, ...baseSkills])].slice(0, 20);
  const headline = `${title}${company ? ' | ' + company : ''}`.slice(0, 100);

  const summary = `Software Engineer with 1.5+ years of experience building and maintaining production web applications using ${skills.slice(0, 6).join(', ')}. Experienced in developing REST APIs, designing relational databases, integrating external services, and optimizing backend performance. Comfortable across frontend and backend, writing automated tests, and delivering reliable software in Agile teams.`;

  return normalizeTailor({
    headline,
    summary,
    skills,
    skillCategories: DEFAULT_SKILL_CATEGORIES,
    experienceBullets: DEFAULT_BULLETS
  }, job);
}

async function tailorForJob({ geminiKey, CV, job, model = DEFAULT_MODEL }) {
  if (geminiKey) {
    const candidateModels = [model, ...FALLBACK_MODELS.filter((m) => m !== model)];
    for (const activeModel of candidateModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${geminiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: buildPrompt(CV, job) }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
          }),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 200)}`);
        }
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const parsed = extractJsonObject(text);
        const out = normalizeTailor(parsed, job);
        if (!out) throw new Error('Gemini returned unusable tailor JSON');
        out.source = `gemini (${activeModel})`;
        return out;
      } catch (e) {
        console.log(`[instahyre-tailor] ${activeModel} failed:`, String(e.message || e).slice(0, 120));
      }
    }
    console.log('[instahyre-tailor] All Gemini models failed, using local CV tailor.');
  }
  const out = localTailor(CV, job);
  if (!out) throw new Error('Local tailor failed');
  out.source = 'local';
  return out;
}

module.exports = {
  tailorForJob,
  extractJsonObject,
  normalizeTailor,
  buildPrompt,
  localTailor,
  formatSkillRows,
  escapeLatex
};
