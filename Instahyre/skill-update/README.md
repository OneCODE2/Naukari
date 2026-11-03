# Instahyre Skill Update

This is an isolated Instahyre profile-skill updater. It does not import or modify the existing Naukri or auto-apply workflows.

## Dry run

From this directory:

```powershell
npm install
node src/cli.js
```

The default input is `..\Aditya_Software_Engineer_.pdf`. Use `--pdf <path>` to select another resume. The proposed list is written to `output\skills.json`.

## Live update

Start or connect to an already authenticated Chromium instance with CDP enabled, then run:

```powershell
node src/cli.js --live --cdp-url http://127.0.0.1:9223
```

Live mode edits only the Instahyre profile skills and requires an explicit `--live` flag. It does not apply to jobs or change the resume/current role.
