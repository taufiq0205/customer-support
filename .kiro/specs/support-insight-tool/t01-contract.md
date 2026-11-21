# T01 shared contract

Draft for both developers to review. The full-stack role owns parsing and masking. The database role owns storage and report queries.

## Records and interfaces

- Ticket identity is `(source, sourceTicketId)`. A snapshot carries ticket number, channel, UTC open and close times, open state, nullable summary, and ordered messages. Each message has a zero-based sequence, speaker, UTC time, nullable name and text, and an attachment flag. Map Zaapi's `bot` speaker to unknown bot-or-staff attribution. Drop attachment URLs at the adapter boundary.
- `upsertSnapshot(snapshot) → inserted | updated` replaces the ticket fields and all messages in one transaction. The last valid snapshot wins. Invalid rows never reach storage. A failed write leaves the previous snapshot intact. `latestOpenedAt() → UTC time | null` reads the stored import cutoff.
- `putModelLabel(ticketKey, version, label)` stores one valid label per ticket and version. Capture prompt hash, model ID, reason, outcome, staff evidence or unknown, UTC timestamp and USD cost. `listMissingLabels(version, page)` returns tickets without a valid label in that version. `addHandLabel(ticketKey, label)` appends a correction with a timestamp. `listHandLabels(ticketKey)` reads its history.
- `weeklyTotals(filters)` and `listTickets(filters, page)` share version, Malaysia ISO week, channel, reason, outcome, include-empty and gap membership filters. Totals return matched count, outcome counts, denominator and label coverage. `getTicket(ticketKey)` returns ordered messages for local masking or explicit reveal.
- `putKbVersion(version, entries)`, `publishGapRun(run, topics, memberships)`, and `listGapTopics(runId)` retain versioned KB and publish only complete runs. Membership uses distinct ticket keys. `putDailyMetrics(rows)`, `listDailyMetrics(range)`, `addTrendNote(note)`, and `listTrendNotes(range)` keep source metrics and notes separate from label totals.

## Owner gates

| Decision | Proposed starting point | Gates |
| --- | --- | --- |
| Q2 reviewer | Reviewer remains unassigned | T11 |
| Q3–Q5 labels | Proposal: keep the 11 reasons, count staff-assisted outcomes separately, and use unknown when staff evidence is weak | T06, T08 |
| Report policy | Proposal: exclude empty and unlabelled tickets from rate denominators. Show hand corrections separately from model labels. | T08, T09 |
| Q6 baseline | Proposal: use the Zaapi KB dated 20 November 2026 | T07.1 |
| Q7 stack and methods | Next.js App Router selected for the frontend and backend. SQLite with Drizzle is proposed. Driver and migration choices, model, and gap method remain open. | T02, T06, T07.2–T07.5, T09 |

## Synthetic fixture

Fixture inputs live in `tests/fixtures/t01/`. The JSONL file has two tickets, a repeated ticket snapshot, and a malformed line. Separate files cover seed labels, daily Zaapi metrics, two KB inputs, and a normalized cross-source ID collision.

Expected counts and report results live in `expected.json`. They retain the proposed denominator policy for review. The fixture includes nullable fields, a Malaysia week boundary, a synthetic email, and an attachment URL that must not be stored or fetched.

Both developers must sign off on the contract and expected totals before T02–T09 split across workstreams. T02 also waits for storage approval. Q2–Q7 decisions remain gated as listed above.
