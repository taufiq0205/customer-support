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

## Data handling

- Keep raw chats, contacts, local databases, and database sidecars off Git. Use synthetic fixtures in tests.
- Redact names, addresses, emails, phone numbers, and order numbers before model calls. Keep raw text out of logs and exports.
- Mask transcripts and summaries by default. Reveal originals only after an explicit local action.
- Bind the app to `127.0.0.1`. Keep API keys in environment variables or macOS Keychain. Never fetch chat attachment URLs.

## Verify and deliver

1. Check the affected requirement and run focused tests. For shared data changes, verify import, report totals, and drill-down against the same fixture.
2. Before committing, inspect the staged diff for personal data, credentials, and unrelated files.
3. Use a scoped branch for later changes. Push or merge only with explicit authorization.
