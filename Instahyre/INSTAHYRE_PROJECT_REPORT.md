# Instahyre Project Report

This report describes the **Instahyre** workspace folder — a self-contained automation toolkit for the Indian job portal [Instahyre](https://www.instahyre.com). It automates job searching, auto-apply, resume tailoring, and profile skill syncing.

---

## 1. What this project is

The folder `Instahyre/` is **not** the Instahyre website. It is a local, personal automation project that drives your own logged-in Instahyre browser session to:

- **Auto-apply** to matching jobs inside your browser.
- **Tailor** your Instahyre profile + resume (via Gemini) to a specific job when your "InstaMatch" score is low.
- **Sync your profile skills** back from your resume PDF (a separate, isolated tool).

It uses **Playwright** (headless/stealthed Chromium) with a persistent Chrome profile, plus **Gemini** for AI rewriting.

## 2. Layout & key files

| File | Purpose |
|------|---------|
| `runner.js` | Main entry point / orchestrator. Parses flags (login, dry-run, live, update-skills). |
| `config.js` | Loads personal data + credentials from `.env` (never hardcoded). |
| `instahyre-auto-apply.js` | The core auto-apply logic, injected into the page. |
| `instahyre-tailor.js` | Gemini-powered rewrite of headline/summary/skills/resume HTML. |
| `instahyre-profile.js` | Updates the Instahyre profile (current role + skills) and replaces the resume. |
| `instahyre-resume-pdf.js` | Renders tailored resume HTML to a PDF via Playwright. |
| `instahyre-score.js` / `instahyre-score-loop.js` | InstaMatch score parsing + feedback loop logic. |
| `instahyre-job-id.js` | Small helper to normalize job keys from URLs. |
| `instahyre-watchdog.js` | Stall-recovery helper (kept as a small pure module). |
| `window-utils.js` | Windows-only PowerShell helpers to hide/minimize the automation browser. |
| `applications.csv` | Log of applied jobs (Date, Site, Role, Company, Link, …). |
| `apply-state-instahyre.json` | Daily apply counter (cap enforcement). |
| `resume-instahyre-skill-update/` | Isolated skill updater sub-project (separate npm package). |

> Note: `.instahyre-chrome-profile/` is the persistent Chrome user-data-dir (saved login session). `.instahyre-tailored/` holds generated resume PDFs. Both are gitignored.

## 3. How it works (main flow)

### 3.1 One-time login
`npm run login` → `node runner.js login` opens a visible Chrome with the persistent profile at the Instahyre login page. You log in manually and close the window; the session is saved for later runs.

### 3.2 Auto-apply
`npm run dry-run` (safe) or `npm run apply` (live).

The runner launches a stealthed, usually-hidden Chromium with the saved profile, then injects `instahyre-auto-apply.js` into Instahyre pages. That script:

1. Enforces a **daily cap** (default 25) via `apply-state-instahyre.json`.
2. Sets the experience slider to **0–3 years**.
3. Iterates a set of **skill searches** (`Java`, `Spring Boot`, `Backend`, `Full Stack`, …).
4. Opens job cards via "View job »" and reads the **InstaMatch** score.
5. **If the score is LOW**, it asks the runner to tailor the profile/resume for that job *before* applying (see §4).
6. Applies via Instahyre's one-click Apply (bulk or single). Delays (20–45 s) are added to look human.
7. Logs each application to `applications.csv` and counts it toward the daily cap.

Title keyword allowlists/blocklists filter which jobs are eligible.

### 3.3 Resume skill updater (isolated tool)
`npm run update-skills` (dry run) or `npm run update-skills:live` connects to a running Chrome via CDP and sets the profile's top 20 skills directly from the resume PDF's "Technical skills" section.

---

## 4. The "tailor" (match-optimization) step

When a job shows a **low InstaMatch** score, `instahyre-tailor.js` asks **Gemini** (with a local fallback) to produce:

- A headline,
- A summary,
- Up to 15–20 skills,
- Resume HTML.

Then `instahyre-profile.js` **modifies your live Instahyre profile**:

- Sets the **current role** to match the job (e.g. "Full-Stack Development", "Backend Development").
- **Adds/removes profile skills** (capped at 20) to align with the job — keeping high-match skills, dropping low-match ones.
- **Replaces the uploaded resume PDF** with the tailored version.

⚠️ **Important:** This means the automation *changes your public Instahyre profile and resume* to improve match scores. The "Last updated" date on skills moves. Skills are only edited to a max of 20.

## 5. Tests

- `instahyre-score.test.js` — score parsing / decision logic.
- `instahyre-profile-loop.test.js` — skill edit planning (planProfileVariation).
- `instahyre-job-id.test.js` — job-key normalization.
- `instahyre-watchdog.test.js` — stall recovery.
- `resume-instahyre-skill-update/test/` — cli, skills, pdf, instahyre logic.

Run with `npm test`.

## 6. Security & privacy notes

- Credentials live in a gitignored `.env` (loaded by `config.js`). **No `.env.example` is present in the repo** — copy a template or the README mentions creating `.env`.
- The automation uses your real logged-in session; it applies to real jobs and edits a real profile.
- Auto-applying may violate Instahyre's Terms of Service (the code itself warns about this).
- The project handles personal data (resume, contact info, skills) — treat the files as sensitive.

## 7. Quick start

```powershell
cd Instahyre
npm install
# create .env from README guidance (NAME, EMAIL, SKILLS, GEMINI_KEY, etc.)
npm run login        # one-time
npm run dry-run      # safe check
npm run apply        # live (use carefully)
npm test
```
