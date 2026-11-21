# AGENTS.md

## Scope

Support Insight is a local, single-user tool for the Photobook support lead. It imports historical Zaapi chats, labels them, and reports support trends and knowledge-base gaps. The lead applies fixes by hand.

- Zaapi is the only MVP source. The available export ends on 20 Nov 2026. Ah Va does not support chat exports.
- Keep future source adapters separate from storage and reports. Show the latest imported date in the app.
- Keep customer messaging, bot settings changes, live sync, and multi-user hosting outside the MVP.
- Treat the ignored X-Ray folder as separate reference material.

## Read before changing

- App, CLI, source formats, redaction, or classification: read [Full-stack spec](SUPPORT-INSIGHT-FULL-STACK.md).
- Schema, migrations, persistence, or reporting queries: read [Database spec](SUPPORT-INSIGHT-DATABASE.md).
- Requirement IDs, source fields, or acceptance thresholds: read [Original brief](KIRO-SPEC-BRIEF-support-insight.md). Use the role specs for the later Ah Va decision.
- For a change across both roles, read both specs and agree on record shapes, interfaces, and synthetic fixtures first. Keep open design choices pending owner approval.

## Build workflow

1. Before using a framework, library, or component, check for an applicable installable skill. If one exists, install it at project scope, then read and follow it when building the component. If no applicable skill exists, use the official docs.
2. Build with tracer bullets. Start with the smallest working path through the affected layers. Verify it end to end with a synthetic fixture before expanding it.

## Data handling

- Keep raw chats, contacts, local databases, and database sidecars off Git. Use synthetic fixtures in tests.
- Redact names, addresses, emails, phone numbers, and order numbers before model calls. Keep raw text out of logs and exports.
- Mask transcripts and summaries by default. Reveal originals only after an explicit local action.
- Bind the app to `127.0.0.1`. Keep API keys in environment variables or macOS Keychain. Never fetch chat attachment URLs.

## Verify and deliver

1. Check the affected requirement and run focused tests. For shared data changes, verify import, report totals, and drill-down against the same fixture.
2. Before committing, inspect the staged diff for personal data, credentials, and unrelated files.

## Git branches

1. Check `git status` and preserve existing work. Fetch `origin` and start one branch per task from `origin/main`. If the task depends on an unmerged branch, use that branch as the base and record the dependency.
2. Use `<type>/<short-slug>` in lowercase with hyphens. Include the issue number when available. Use `feature/` for new behavior, `bugfix/` for defects, `spike/` for research, `refactor/` for internal changes, and `docs/` or `chore/` for documentation or maintenance.
3. Time-box spikes and record the findings. Move any proposed implementation to a fresh branch from the target base.
4. Keep commits scoped. If the base moves, rebase unpublished work or merge the base into a shared branch. Preserve shared history.
5. With explicit authorization, push the named branch and open a pull request against its base. Merge into `main` through a pull request after required checks and reviews pass. Delete the task branch after merge with owner approval.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
