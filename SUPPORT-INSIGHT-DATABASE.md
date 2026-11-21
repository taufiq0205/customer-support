# Support Insight · Database development

You own the local schema, migrations, persistence, seed import and reporting queries. The full-stack developer owns file-format adapters, redaction, models, commands and UI. Requirements R1–R8 and goals G1–G5 refer to the original brief.

## Data contract to agree first

| Data | Contract to implement |
| --- | --- |
| Tickets and messages | Use source and source ticket ID as the proposed identity so future sources can reuse IDs. Store ticket number, channel, UTC timestamps, open state and nullable summary. Store ordered messages with speaker, nullable name/text and an attachment flag. Upsert a ticket and its messages atomically. Define how a repeat snapshot updates messages. |
| Model labels and hand labels | One model label per ticket and classifier version. Store reason, outcome, staff-replied evidence or unknown, timestamp and cost. Keep manual reviews separate from model labels. Queries must identify the reporting classifier version and preserve history. |
| KB and gaps | Store versioned KB entries with source, section, title and body. Store gap topics by run, coverage, closest entry and ticket membership. Publish a complete gap run atomically so failed runs leave the prior results readable. |
| Analytics and notes | Store daily Zaapi counts and reported rates by date, account and channel. Keep these rates separate from classifier outcome shares. Store dated trend notes and run summaries with timestamps, counts and cost. |
| Queries | Provide weekly totals, outcome counts and rate denominators, daily source analytics, run-specific gaps, paged ticket lists, one ticket with ordered messages, and hand-label writes. Share filters across trend counts and drill-down. Raw transcript reads are local and used behind the app's explicit reveal flow. |

## Build order and acceptance

1. **Migrate and load (R1, R7).** Deliver repeatable migrations, local storage configuration, constraints and indexes for query paths. Test duplicate imports, nullable fields, invalid records, source ID collisions and interrupted writes using fake data. Support 20,000 tickets in under five minutes on the author's Mac, excluding classification.
2. **Seed and resume (R2, R3).** Import the historical CSV as `zaapi-haiku-v0` with provenance and no model spend. Report unmatched and duplicate rows. The supplied brief cites 20,216 tickets and 20,215 seed rows. Reconcile using IDs. Return tickets missing a valid current-version label. Persist hand labels for agreement checks and future regression runs.
3. **Report and drill down (R4–R6).** Bucket ticket opens by ISO week in Malaysia time. Exclude `empty` from rate denominators by default. Expose outcome counts and label coverage so the app can account for unlabelled records. Test week boundaries, empty and low-volume results, filter parity, gap membership and analytics cross-checks.
4. **Recover and hand off (R7, R8).** Keep the database and any sidecar files local and gitignored. Use migrations and preserve hand labels and trend notes before any rebuild. Provide synthetic fixtures, data examples, query interfaces and setup notes. Jointly verify refresh, report totals and drill-down after a repeated import.

## Decisions to close with the owner and full-stack developer

Q7 Storage is open. The brief proposes SQLite, with DuckDB as an analytics alternative and Postgres if multi-user use arrives later. Agree on transaction and migration behavior before coding. Q1 Closed. Ah Va does not support chat exports. Keep source-scoped ticket IDs. Zaapi is the only MVP source, with data through 20 Nov 2026. Q3–Q5 gate outcome definitions, the fixed reason list and staff attribution. Q6 gates live gap comparisons. Agree on the rate denominator for unlabelled chats and the display policy for hand corrections versus model labels before finalizing reports.

## First handoff

Give the full-stack developer migration and fixture commands, stable record shapes, upsert results, classification and review interfaces, and report query signatures. Verify the same fixture from import through trend and drill-down. Use the original brief as the source for the exact input files and category definitions.
