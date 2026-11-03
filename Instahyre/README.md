# Instahyre Automation & Skill Updaters

A self-contained automation workspace for **Instahyre**:
- **Auto-Apply with Dynamic Match / Skill Optimization**
- **Manual Resume Skill Updater** (when profile skills get distorted and you need to restore/re-align them directly from your resume PDF)

---

## 1. Setup

Navigate to the `Instahyre` directory:

```powershell
cd Instahyre
npm install
```

Configure your credentials and details in `.env` (copied from `.env.example`).
Ensure your resume PDF (`Aditya_Software_Engineer_.pdf`) is placed in this directory.

---

## 2. Commands & Scripts

### A. One-Time Login
Opens Chrome with your persistent profile in `.instahyre-chrome-profile/`. Log in once, then close the browser:

```powershell
npm run login
# or: node runner.js login
```

### B. Auto-Apply Runner
Applies to Instahyre opportunities and search feeds. If InstaMatch is low, it automatically optimizes the profile and resume for the target job before applying:

```powershell
# Dry run (checks jobs, tests selectors, does not submit):
npm run dry-run
# or: node runner.js

# Live auto-apply:
npm run apply
# or: node runner.js --live

# Watch live in browser (not hidden):
node runner.js --live --show
```

### C. Resume Individual Skill Updater (Manual Restore / Sync)
When profile skills get distorted or you need to align your profile skills directly from your resume PDF without applying:

```powershell
# Dry run (extracts 20 priority skills from PDF and outputs to output/skills.json):
npm run update-skills
# or: node runner.js --update-skills

# Live update (connects to your active Chrome browser via CDP to apply the 20 skills):
npm run update-skills:live -- --cdp-url http://127.0.0.1:9223
```

### D. Running Tests

```powershell
npm test
```

