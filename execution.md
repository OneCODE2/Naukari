# Execution Guide

This file is the required pre-run reference for work in this repository.

## Required guidance

Read these files before changing or running project code:

1. [CLAUDE.md](./CLAUDE.md) — concise Karpathy-style coding guidance.
2. [.cursor/rules/karpathy-guidelines.mdc](./.cursor/rules/karpathy-guidelines.mdc) — always-applied editor guidance.
3. [.agents/skills/karpathy-guidelines/SKILL.md](./.agents/skills/karpathy-guidelines/SKILL.md) — implementation behavior and verification criteria.
4. [agents.md](./agents.md) — engineering, testing, security, and reporting requirements.

The local project instructions supplied in `AGENTS.md` are also applicable when present. In this checkout, the equivalent project guidance is recorded in `agents.md`.

## External local checkout

The requested GSD repository is available locally at [`gsd-core/`](./gsd-core/):

- Repository: <https://github.com/open-gsd/gsd-core.git>
- Current checkout: `next`
- Recorded revision at setup: `ceef6898be2f3b09b4c55c51a524fde49803bb54`

Inspect its own instructions before using it:

```powershell
Get-ChildItem -Force .\gsd-core
if (Test-Path .\gsd-core\AGENTS.md) { Get-Content -Raw .\gsd-core\AGENTS.md }
if (Test-Path .\gsd-core\README.md) { Get-Content -Raw .\gsd-core\README.md }
```

## Pre-run checklist

From `D:\New folder\naukari`:

```powershell
Get-Content -Raw .\CLAUDE.md
Get-Content -Raw .\.cursor\rules\karpathy-guidelines.mdc
Get-Content -Raw .\.agents\skills\karpathy-guidelines\SKILL.md
Get-Content -Raw .\agents.md
git status --short --branch
```

Before making changes:

- State assumptions and acceptance criteria.
- Inspect the relevant architecture and existing tests.
- Make the smallest change that satisfies the request.
- Do not expose credentials, cookies, tokens, or personal data.
- Do not run live browser automation unless the task explicitly requires it and the target session is authorized.

## Verification

Run the narrowest relevant tests first, then available project checks. Report the exact commands and actual results. Do not claim a check passed unless it ran successfully.

For documentation-only changes, verify the referenced files and links exist:

```powershell
$required = @(
  '.\CLAUDE.md',
  '.\.cursor\rules\karpathy-guidelines.mdc',
  '.\.agents\skills\karpathy-guidelines\SKILL.md',
  '.\agents.md',
  '.\gsd-core'
)
$required | ForEach-Object { if (-not (Test-Path $_)) { throw "Missing: $_" } }
git -C .\gsd-core rev-parse --short HEAD
git diff --check
git status --short --branch
```

## Change report

After execution, report:

- What changed and why.
- Files affected.
- Tests and checks actually run.
- Security or performance findings, if applicable.
- Remaining risks and unverified assumptions.
