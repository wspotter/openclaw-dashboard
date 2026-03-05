# OpenClaw Dashboard — AGENTS.md

## Project Overview
This is a standalone modular dashboard for OpenClaw integrations. It uses a **template system** that allows LLM agents to register new service integrations by generating JSON template files — no dashboard code changes needed.

## Rules
- **Stack:** Vite + vanilla JS + vanilla CSS. No React, no Vue, no Svelte, no Tailwind.
- **No external CDNs.** Everything works offline on LAN.
- **No hardcoded absolute paths in JS.** Use relative paths or env vars.
- **All HTTP fetches must have a 5-second timeout.** No unbounded requests.
- **Templates are runtime-loaded JSON.** No build-time compilation.
- **Do not modify files outside this repo** unless the task brief explicitly says to.
- **Fill out the Work Product Report** at `~/.openclaw/reports/REPORT_YYYY-MM-DD.md` when done.

## Key Files
- `~/.openclaw/CODEX_DASHBOARD_PROJECT.md` — Your full task brief. **Read this first.**
- `~/.openclaw/WORKER_INSTRUCTIONS.md` — General worker rules.
- `~/.openclaw/PROJECT_BIBLE.md` — Overall project context.

## Communication — How to Ask Questions

You have a direct line to the senior engineer (Bob / Antigravity) via email. Use it when you're stuck or facing a real design decision.

**To ask a question:**
1. Use the `gmail-pro` skill or `sendmail` to email **`bob@theprintery.biz`**
2. Subject line MUST start with `[WORKER QUESTION]`
3. In the body, include:
   - What you're trying to do
   - What options you found
   - Which option you're leaning toward and why
4. **Do NOT send vague emails like "I'm stuck."** Be specific.

**To get the answer:**
1. Check `~/openclaw-dashboard/ANTIGRAVITY_REPLY.md` — Bob will write the answer directly into the repo.
2. If that file doesn't exist yet, wait a few minutes and check again.
3. Once you've read the reply, proceed accordingly.

**Emergency stop:** If VS Code closes unexpectedly, check `ANTIGRAVITY_REPLY.md` for the reason. It means Bob pulled the plug because something was going wrong. Do NOT restart work until the reply file explains what to fix.

## Testing
- `npm run dev` should serve on `localhost:5173`
- Dashboard must render tiles with live health polling
- Adding a new `*.template.json` to `templates/` must auto-discover
- Layout must adapt from 1 tile to 20+ without getting clunky
