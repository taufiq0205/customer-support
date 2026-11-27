# AGENTS.md

## Scope

CX Support Tool is a portfolio project: a multi-user customer support inbox. It receives messages from a Telegram bot used as a live test channel and gives agents one inbox to reply to, assign, snooze, and resolve conversations. Supervisors also see reports and manage AI settings. Updates stream to the browser over SSE. AI reply suggestions are optional.

- It runs on the owner's Mac. There is no hosted deployment.
- It handles live conversations only. It does not import historical chat exports.
- There is no live Zaapi or respond.io account to test against. Build adapters from the public docs, mark undocumented gaps with `shortcut:` comments, and don't ask the owner for live payloads. Telegram is the only live channel: use the bot for end-to-end tests (see README).
- A resolved conversation is a closed ticket. A new inbound message reopens it. Assigning a resolved conversation returns 409. Don't change this without owner approval.

## Read before changing

- Requirements and acceptance criteria: [requirements.md](.kiro/specs/cx-support-tool/requirements.md).
- Architecture, schema, API routes, data flows, and correctness properties: [design.md](.kiro/specs/cx-support-tool/design.md).
- Task history and status: [tasks.md](.kiro/specs/cx-support-tool/tasks.md).
- Setup, env vars, and offline testing: [README.md](README.md).
- `SUPPORT-INSIGHT-*.md` and `KIRO-SPEC-BRIEF-support-insight.md` describe an earlier, single-user chat-import design. They are not the current spec. Don't build from them.
- Keep open design choices pending owner approval.

## Code map

- `app/(app)/`: inbox, thread, reports, and settings pages. `app/(auth)/login`: login page.
- `app/api/`: route handlers. The [proxy](proxy.ts) lists routes that accept requests without a login. Telegram intake verifies its bot-derived secret.
- `lib/adapters/`: one `PlatformAdapter` per platform (`verifyWebhook`, `parseWebhook`, `sendReply`), plus the AI client. Keep platform code here, separate from storage and services.
- `scripts/`: `seed-users.ts` (migrations and users) and `telegram-poll.mts` (long-polls the bot and forwards updates to `api/webhooks/telegram`, so the app needs no public URL).
- `lib/services/`: webhook intake, conversations, assignment, messages, canned responses, reports, redaction, AI settings.
- `lib/events/`: in-process SSE bus. It assumes a single server process.
- `lib/auth/`: JWT session cookie, bcrypt passwords, `currentUser()`. Supervisor-only routes return 403 to agents.
- `lib/db/`: SQLite through better-sqlite3 and Drizzle. Migrations run only from `npm run seed:users`, not at app startup.

## Build workflow

1. Before using a framework, library, or component, check for an applicable installable skill. If one exists, install it at project scope, then read and follow it when building the component. If no applicable skill exists, use the official docs.
2. Build with tracer bullets. Start with the smallest working path through the affected layers. Verify it end to end with a synthetic fixture before expanding it.

## Data handling

- Keep real chats, contacts, local databases, database sidecars, and `.env.local` off Git. Use synthetic fixtures in tests.
- Redact names, addresses, emails, phone numbers, and order numbers before model calls. Keep raw message text and webhook payloads out of logs.
- Bind the app to `127.0.0.1`. Keep API keys and secrets in environment variables or macOS Keychain. Never fetch chat attachment URLs.

## Verify and deliver

1. Check the affected requirement and correctness property, then run focused tests (`npm test -- <path>`). Tests use an in-memory database.
2. For changes to ingestion or shared data, verify webhook intake, inbox listing, and report totals against the same fixture.
3. Before committing, inspect the staged diff for personal data, credentials, and unrelated files.

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
