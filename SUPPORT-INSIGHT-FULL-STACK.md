# Support Insight · Full-stack development

You own the local app, commands, source adapters, redaction and model workflow. The database developer owns migrations, persistence and reporting queries. The support lead is the sole MVP user and applies KB fixes by hand. Requirements R1–R8 and goals G1–G5 refer to the original brief.

## Build order and acceptance

| Step | Build | Acceptance |
| --- | --- | --- |
| 1 | Zaapi adapter, import command and setup (R1, R7, R8) | Stream JSONL into the database contract. Skip malformed or invalid lines with line number and reason. Print read, inserted, updated, skipped and date range. A source flag selects the adapter. Bind the app to 127.0.0.1. |
| 2 | Redaction, classification and sample check (R2, R3, R7) | Redact names, emails, MY/SG phones, addresses and order numbers before model calls or display. Use summary or customer text. Validate one reason and one outcome. Resume by classifier version and retry invalid or missing labels next run. Sample 100 by reason, accept hand labels and report agreement and confused pairs. |
| 3 | KB import and gap analysis (R4) | Parse Q&A headings and product Markdown/XLSX. Group unresolved and no-reply questions, match KB entries and assign coverage. Show and export up to 20 partial or uncovered topics by chat count, with reason, closest entry and three redacted examples where available. |
| 4 | Trends and drill-down (R5, R6) | Show ISO weeks in Malaysia time, four outcome shares, reason/channel filters, an empty-chat toggle, dated notes and a low-confidence flag below 30 chats. Show Zaapi daily AI rates alongside classifier rates. Each selection opens matching tickets. Transcripts start masked and require an explicit action to show originals. Corrections create hand labels. |
| 5 | Refresh and pilot (R3, R7, R8, G1–G5) | Document setup and one command each for import, classify, gaps, sample and app. Refresh runs import → classify → gaps. Commands report actions and model cost. Verify on the author's Mac and record timings, spend and sample agreement. |

## Handoff

Agree on fixture records and callable interfaces with the database developer before parallel work. You own CLI summaries, format parsing, UI and model calls. Use the database interface for writes and reads. Provide the database developer with synthetic adapter outputs and expected UI filters. Test trend totals against drill-down results together.

## Privacy and launch gates

Keep raw chats and DB on the Mac. Gitignore exports and DB files. Keep keys in the environment or macOS Keychain. Send only redacted text to the model API. Mask summaries as well as transcripts and exports. Use synthetic privacy tests and fail closed when text cannot be safely redacted. Never fetch attachment URLs. Logs must omit raw text and personal data.

MVP excludes customer replies, bot settings changes, Shopify orders, contacts, sales and marketing tools, multi-user access, hosting, mobile UI, live sync and image analysis. Measure agreement on 100 hand-reviewed chats (reason ≥85%, outcome ≥80%), gaps ≤USD 3 per run and pages <2 seconds. A rise above the historical 23% resolved share is a business measure.

## Owner decisions before affected work

Q1 Closed. Ah Va does not support chat exports. MVP reports use Zaapi data through 20 Nov 2026. Show the last imported date and keep the source adapter for future sources. Q2 Who reviews 100 chats. Q3 Whether staff-resolved chats count in the bot metric. Q4 Whether to keep the 11 Zaapi reasons. Q5 How to distinguish staff from bot replies. Q6 Which KB is the gap baseline. Q7 Choose UI, classification and gap methods with the database developer. Brief candidates include Streamlit, static HTML or FastAPI + HTML, and embedding, model or keyword grouping.

Use Zaapi and synthetic fixtures for work independent of these decisions. Keep the brief's separate timing targets visible. R1 gives import <5 minutes, R2 gives classification <15 minutes and G4 gives combined import and classification <15 minutes. Classification target is <USD 5 per 20,000 chats. Record each measure separately.
