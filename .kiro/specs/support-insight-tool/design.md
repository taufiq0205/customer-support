# Support Insight design

Draft for owner review. R1–R8 and G1–G5 refer to the [original brief](../../../KIRO-SPEC-BRIEF-support-insight.md). The [app spec](../../../SUPPORT-INSIGHT-FULL-STACK.md) and [database spec](../../../SUPPORT-INSIGHT-DATABASE.md) define ownership and supersede the brief on Ah Va exports.

## Scope

One support lead runs the tool on an Apple Silicon Mac. Zaapi is the only source. The available export ends on 20 November 2026. Show the actual latest imported date. The lead applies KB fixes manually. Customer messaging, bot settings, contacts, Shopify orders, live sync, attachment analysis and hosting are outside scope.

## Data flow

```text
Zaapi JSONL → source adapter → ticket and message store
                                      ↓
                             local redaction → classifier → versioned labels
                                                               ↓
Daily Zaapi CSV → source metrics → trends → shared filters → ticket drill-down
                                                               ↓
KB files → versioned entries → match grouped failed chats → gap report
                                             Sample and drill-down → hand labels
```

## Shared contract for review

| Area | Proposed contract |
| --- | --- |
| Import (R1) | Stream JSONL through the selected source adapter. Emit normalized tickets keyed by source and source ticket ID, with ticket number, channel, UTC open/close times, open state and nullable summary. Messages carry sequence, speaker, UTC time, nullable name/text and attachment presence. Atomically replace ordered messages with each valid full ticket snapshot. Invalid rows leave prior data intact. Report sanitized line errors, counts and date range. |
| Labels (R2–R3) | Join seed CSV by Zaapi ticket ID into `zaapi-haiku-v0`. Report duplicate, unmatched and missing IDs. Store one validated label per ticket and classifier version (prompt hash and model ID), timestamp, cost and staff evidence or unknown. Use summary or customer messages after redaction. Resume by skipping valid labels for the selected version. Invalid responses remain eligible on the next run. Keep hand labels separate and retain history. |
| Gaps (R4) | Version parsed Q&A and product Markdown/XLSX entries. Group redacted questions from unresolved and no-reply chats. Store run inputs, topic membership, coverage and closest KB entry. Publish only complete runs. Rank partial and uncovered topics by distinct ticket count. Show and export up to 20, with reason, closest entry and up to three masked examples. |
| Reports (R5–R6) | Share one filter contract across totals and paged drill-down: version, ISO week, channel, reason, outcome, include-empty and gap membership. Bucket opens in Malaysia time. Expose totals, denominator and label coverage. Exclude empty chats from rates by default. Flag fewer than 30 filtered chats. Keep dated notes and daily Zaapi rates separate from classifier outcome shares. |
| Operations (R7–R8) | App owns parsing, CLI, model calls, redaction and UI. Database owns migrations, transactions and queries. Share synthetic fixtures and expected totals before work splits. Provide import, classify, gaps, sample, app and refresh commands. Refresh runs import → classify → gaps and stops on a failed stage. Report stage counts, elapsed time and model spend. Preserve hand labels and notes in backups before any rebuild. |

## Privacy

Keep raw exports and database sidecars local and gitignored. Bind the app to `127.0.0.1` and load keys from the environment or macOS Keychain. Redact names, addresses, emails, MY/SG phone numbers and order numbers before model calls, display and exports. Withhold text that cannot be safely masked. Keep raw text out of logs and omit attachment URLs from normalized records. Gate raw detail behind an explicit local reveal action.

## Pending owner decisions

| Decision | Proposed starting point and trade-off |
| --- | --- |
| Q2 | Name the reviewer for the stratified 100-chat sample. |
| Q3–Q5 | Confirm staff-assisted resolution, the 11 legacy reasons and staff evidence rules. Confirm the denominator for unlabelled chats and how hand corrections affect reports. Show staff attribution as unknown where evidence is insufficient. |
| Q6 | Confirm the KB snapshot. The 20 November Zaapi snapshot supports historical comparisons. Current Ah Va content would answer a different coverage question. |
| Q7 storage and UI | SQLite fits local transactional writes. Benchmark DuckDB if rollups miss the target. Reserve Postgres for a future hosting decision. Streamlit offers built-in charts. FastAPI + HTML gives more control over reveal and editing. Static HTML needs a separate write path for corrections and notes. |
| Q7 model and gaps | Propose Claude Haiku-class API with structured output. Compare synchronous calls with batch turnaround against the runtime gate. The legacy CLI is a comparison baseline. Compare keyword grouping, multilingual embeddings and model grouping on the same fixture. Keywords can split paraphrases, embeddings can miss exact product terms, and model grouping raises cost. Compare shortlist retrieval plus model coverage checks with local matching before choosing. |

## Pilot gates

Measure import under 5 minutes and classification under 15 minutes for 20,000 chats. Measure combined import and classification under 15 minutes separately. Classification must cost under USD 5 and gaps at most USD 3. Pages must load in under 2 seconds. Hand-check 100 chats for at least 85% reason and 80% outcome agreement. Verify gap ranking, report-to-ticket counts and privacy controls. The historical 23% resolved share is a business baseline.
