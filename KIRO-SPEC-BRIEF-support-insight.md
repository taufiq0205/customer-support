# Kiro Spec Brief — Support Insight Tool

> **For the Kiro agent.** This is the single input for a Kiro spec. Use it to
> write `.kiro/specs/support-insight-tool/requirements.md`, then `design.md`,
> then `tasks.md`. Everything the author has decided is marked **DECIDED**.
> Everything still open is marked **OPEN** — raise those with the author
> during the matching phase instead of guessing. Do not change decided items
> without asking.
>
> *   Author / owner: Muhammad Taufiq (Photobook Worldwide)
> *   Written: 2026-11-21
> *   Repo: `/Users/photobook/Documents/work/ahva-agent`
> *   Related files: `design_draft.md` (EGM draft, sections Overview → Open
>     Questions), `discussion_summary.md` (full discussion log), `README.md`
>     (Ah Va status), `CLAUDE.md` (git rules).

--------------------------------------------------------------------------------

## 0. How to use this brief (Kiro workflow)

1.  **Requirements phase:** turn Section 6 into `requirements.md`. Keep the
    user stories and EARS acceptance criteria; tighten wording; add any
    criteria you find missing and flag them as "added by Kiro". Before moving
    on, ask the author about every **OPEN** item in Section 11 that affects
    requirements (Q1, Q3 at minimum).
2.  **Design phase:** use Sections 7–9 for `design.md`. The stack in
    Section 8 is a **suggested default**, not decided. Present it with the
    listed alternatives and let the author choose before writing the design.
3.  **Tasks phase:** use Section 10 as the starting task list for
    `tasks.md`. Each task must reference the requirement IDs it satisfies.
4.  **Git rule (binding, from `CLAUDE.md`):** every change goes on its own
    branch named `<folder>/<short-change>` (repo-root files use
    `docs/<short-change>`), created from an up-to-date `main`, committed there,
    then merged back with `git merge --no-ff` and the branch deleted. Never
    commit on `main` directly. Suggested branches: `.kiro` spec files →
    `kiro/support-insight-spec`; app code → `support-insight/<change>`.
5.  **Data rule (binding):** customer chats and contacts are personal data.
    Never commit them, never send them to any service except redacted text to
    the model API (Section 9), never paste raw transcripts into chat output.

--------------------------------------------------------------------------------

## 1. Background

*   **Company:** Photobook Worldwide — sells custom photobooks and prints in
    Malaysia, Singapore and the region, through its own website/app and
    marketplaces (Shopee, Lazada, TikTok Shop).
*   **Old support tool: Zaapi.** Omnichannel inbox with an AI agent, a
    knowledge base (KB) and "scenarios" (rules for specific situations). Used
    until about 20 Nov 2026.
*   **New support tool: Ah Va** ([app.ahva.com.sg](https://app.ahva.com.sg/dashboard)).
    AI receptionist/support agent. WhatsApp and Shopify connected;
    Instagram/Messenger not yet. Ah Va now answers customers.
*   **What exists today:** both tools show daily counts (tickets, AI messages,
    AI full/partial resolution rate). Neither shows *why* chats fail or
    *which* questions the KB cannot answer.
*   **What was done by hand once:** a full Zaapi chat export (20,216 tickets)
    and a script (`zaapi-conversations/sort_by_reason.py`) that tagged every
    chat with a reason and an outcome using Claude Haiku. That one-off result is
    the evidence for this project.

## 2. How we got here (decisions, in order)

| # | Decision | Status |
| --- | --- | --- |
| 1 | Original idea: one app for customer support, marketing and sales. Challenged as three apps for three audiences. | Superseded |
| 2 | **Customer support first.** Sales and marketing go to a later spec. | **DECIDED** |
| 3 | **Path A — Insight tool** chosen for the MVP. | **DECIDED** |
| 4 | Path B — Staff inbox (staff reply in it, Shopify orders beside chat): rejected for MVP. Ah Va's own inbox may already cover it; needs live two-way data. | **DECIDED** (rejected) |
| 5 | Path C — Own bot replacing Ah Va: rejected. Large build, duplicates a paid tool. | **DECIDED** (rejected) |
| 6 | The tool never talks to customers and never changes Ah Va/Zaapi settings. The support lead applies fixes by hand. | **DECIDED** |
| 7 | Local, single user, runs on the author's Mac. | **DECIDED** |

## 3. Problem statement

Between 1 Oct and 20 Nov 2026 the company got **20,215 classified support
chats** on 8 channels. Only **23% ended resolved**. The support lead cannot
see which questions fail, so knowledge-base fixes are guesses and there is no
way to tell whether a fix helped.

### 3.1 Evidence (model-classified, not yet checked by a person)

**By channel**

| Channel | Chats |
| --- | --- |
| widget (website chat) | 10,559 |
| facebook | 3,601 |
| shopee | 2,306 |
| line | 2,239 |
| instagram | 914 |
| lazada | 328 |
| tiktok | 256 |
| gmail | 12 |

**By outcome**

| Outcome | Meaning (classifier definition) | Chats | Share |
| --- | --- | --- | --- |
| resolved | customer got a clear answer or fix | 4,583 | 23% |
| unresolved | replies were given but the issue was not solved | 7,224 | 36% |
| unclear | cannot tell | 4,542 | 22% |
| no_reply | chat closed with no useful reply to the customer | 3,866 | 19% |

**By reason, with outcomes**

| Reason | Chats | Resolved | Unresolved | Unclear | No reply |
| --- | --- | --- | --- | --- | --- |
| buying | 5,043 | 656 | 1,807 | 1,662 | 918 |
| voucher | 3,998 | 1,272 | 1,587 | 731 | 408 |
| order_status | 2,385 | 852 | 845 | 360 | 328 |
| old_project | 2,369 | 795 | 844 | 587 | 143 |
| how_to_design | 2,252 | 516 | 775 | 525 | 436 |
| empty | 1,080 | 3 | 3 | 145 | 929 |
| other | 1,027 | 70 | 280 | 175 | 502 |
| change_cancel_refund | 887 | 203 | 540 | 86 | 58 |
| checkout_payment | 589 | 114 | 317 | 116 | 42 |
| login_account | 341 | 72 | 137 | 108 | 24 |
| affiliate_business | 244 | 30 | 89 | 47 | 78 |

*   Human staff replied in 8,015 chats (model-inferred; see 5.1 caveat).
*   45% of chats are `buying` or `voucher` — sales-like questions inside
    support. The MVP must handle them as support topics even though sales
    features are out of scope.
*   `empty` (greeting only, blank, spam) should be excluded from rate
    calculations or shown separately.

### 3.2 Reason and outcome definitions (from the existing classifier)

| Reason | Covers |
| --- | --- |
| order_status | where is my order, tracking, shipping time, delivery deadline |
| old_project | old website/app projects, lost projects, legacy orders, migration |
| voucher | voucher/promo code redeem, errors, expiry, free prints, Shopee/Lazada vouchers |
| buying | pricing, product options, sizes, design service, wants to buy |
| how_to_design | using the editor: upload photos, pages, layout, save, preview |
| login_account | cannot log in, account, password, switch account |
| checkout_payment | checkout, payment, invoice, shipping fee at checkout |
| change_cancel_refund | change/cancel order, refund, damaged/wrong item, quality, taxes |
| affiliate_business | creators, affiliates, bulk/corporate, partnerships |
| empty | no real question (greeting only, blank, spam) |
| other | anything else |

These categories are a starting point. The spec may keep them as the fixed
taxonomy (recommended, so the existing 20k labels stay comparable) or revise
them — **OPEN** (Q4).

## 4. Users

| User | Need |
| --- | --- |
| **Support lead** (primary, only user in MVP) | See why customers write, which chats failed, which KB answers are missing; check after a KB change whether things improved. |
| Support staff | Not users in MVP. They benefit indirectly from a better bot. |
| Management | Not users in MVP. May get a weekly export later. |

## 5. Data inputs

All paths relative to the repo root. **Personal data stays local.**

### 5.1 Chat export (main input)

*   **File:** `zaapi-conversations/zaapi-chats-2026-10-01-to-11-20.jsonl`
    (gitignored; 20,216 lines, 1 ticket per line; 236,099 messages).
*   **Ticket fields:**

| Field | Type | Notes |
| --- | --- | --- |
| `ticketId` | string | Unique, e.g. `6b008785fd6d06f935e9539b`. Primary key. |
| `ticketNumber` | string | Human-readable, e.g. `261120Q7IVS4`. |
| `channel` | string | `widget`, `facebook`, `shopee`, `line`, `instagram`, `lazada`, `tiktok`, `gmail`. |
| `openedAt` | ISO-8601 UTC string | Range 2026-10-01T00:09Z → 2026-11-20T17:46Z. |
| `isOpen` | bool | 280 open, 19,936 closed at export time. |
| `closedAt` | ISO-8601 or null | |
| `aiSummary` | string or null | Zaapi's English summary of the chat. Present on 15,454 tickets (76%). |
| `transcript` | array of messages | See below. |

*   **Message fields:** `who` (`customer` or `bot` — **staff replies are
    also labelled `bot`**, so human vs AI is not directly in the data),
    `name` (sender name or null), `at` (timestamp), `text` (string or null),
    `images` (array of signed CloudFront URLs that expire; 23,010 messages
    have images).
*   Transcripts are multilingual (English, Malay, Chinese, Thai and mixes).
*   **Caveat:** image URLs expire. Do not depend on them.

### 5.2 Existing labels

*   **File:** `zaapi-conversations/chat-reasons.csv` — columns
    `ticket_id, channel, month, reason, outcome, human_replied`. 20,215 rows.
    No personal data. Use it to seed the database and as a regression set.

### 5.3 Existing classifier

*   **File:** `zaapi-conversations/sort_by_reason.py` (98 lines, stdlib only).
*   Method: input text = `aiSummary` if present, else first 4 customer
    messages; emails and phone numbers replaced with `[x]` by regex; cut to
    600 characters; batches of 80 sent to Claude Haiku via `claude -p` with 6
    workers; output one JSON line per chat; resumable (skips ticket IDs
    already in the CSV). Cost for all 20k: about USD 2.35.
*   Weaknesses to fix in the spec: names and addresses are not redacted; the
    `human` flag is guessed by the model; uses the `claude` CLI instead of the
    API; no stored prompt version, so labels from different runs cannot be
    told apart.

### 5.4 Daily analytics

*   **Files:** `zaapi-analytics/zaapi-ai-case-analytics-2026-10.csv`,
    `zaapi-analytics/zaapi-ai-case-analytics-2026-11-01-to-20.csv`.
*   Columns: `report_date` (DD-MM-YYYY), `account_name`, `channel`,
    `total_tickets`, `ai_messages_sent`, `human_resolved_tickets`,
    `ai_full_resolved_tickets`, `ai_partial_resolved_tickets`,
    `ai_full_resolution_rate`, `ai_partial_resolution_rate` (strings like
    `25.00%`).
*   Use: cross-check daily ticket counts against the chat export; show
    Zaapi's own resolution rate next to ours.

### 5.5 Knowledge base (what the bot knows)

*   **Folder:** `zaapi-kb/latest-kb-2026-11-20/`
    *   `general-qna-v2_zaapi_1.md` — 175 KB, about 440 Markdown headings;
        each `##` heading is a customer question, the body is the answer;
        `#` headings are topic groups (e.g. "General Business Information",
        "Contacting Support").
    *   `products-and-designs-v2.md` — 1.6 MB, product and design catalogue.
    *   `product-specifications-v2_zaapi_1.xlsx` — product spec sheet.
*   Use: the gap finder compares customer questions with these entries.

### 5.6 Scenarios (bot rules)

*   **Folder:** `zaapi-scenarios/latest-scenarios-2026-11-20/` — 12 Markdown
    files (S1, S2, S4–S11, two Affiliate Creator Program files). Each has:
    scenario name, trigger condition, response mode (follow instructions or
    escalate to human), reply steps. S8 "Human requested" escalates
    immediately.
*   Use: optional in MVP — map failing reasons to the scenario that should
    have handled them.

### 5.7 Contacts (not used in MVP)

*   `zaapi-contacts/*.csv` — about 9,800 rows/month, heavy personal data
    (name, email, phone, address, free-book fields). **Not an MVP input.**
    Listed so the spec explicitly excludes it.

### 5.8 Future data (biggest risk)

*   Zaapi data stops at 20 Nov 2026. Future chats live in **Ah Va**. It is
    **not known** whether Ah Va can export chats (file or API) — **OPEN**
    (Q1). The import design must use a source adapter so a second format
    (Ah Va) can be added without changing the rest of the pipeline.

--------------------------------------------------------------------------------

## 6. Draft requirements (for `requirements.md`)

IDs are stable; reference them in design and tasks. Acceptance criteria use
EARS wording.

### R1 — Import chat exports

**User story:** As the support lead, I want to import a chat export file with
one command, so that new chats are added without manual work.

1.  WHEN the lead runs the import command with a Zaapi JSONL file THEN the
    system SHALL store every ticket and its messages in the local database.
2.  WHEN a ticket ID already exists THEN the system SHALL update it in place
    and SHALL NOT create a duplicate.
3.  WHEN a line cannot be parsed THEN the system SHALL skip it, log the line
    number and reason, and continue.
4.  WHEN the import finishes THEN the system SHALL print counts: read,
    inserted, updated, skipped, and the date range covered.
5.  The system SHALL import 20,000 tickets in under 5 minutes on the
    author's Mac (excluding classification).
6.  The import SHALL accept the source format as a parameter (`zaapi` now;
    `ahva` later) so new formats plug in without changing storage or reports.

### R2 — Classify each chat (reason + outcome)

**User story:** As the support lead, I want every chat labelled with one
reason and one outcome, so that I can see why customers write and how it ends.

1.  WHEN a chat has no label for the current classifier version THEN the
    system SHALL classify it with exactly one reason and one outcome from the
    fixed lists (Section 3.2 and 3.1).
2.  Before sending text to the model, the system SHALL redact emails, phone
    numbers, order numbers, street addresses and personal names (see R7).
3.  The system SHALL store, per label: classifier version (prompt hash +
    model ID), timestamp, and cost.
4.  WHEN the model returns an invalid or missing label THEN the system SHALL
    mark the chat as unlabelled and retry on the next run.
5.  The system SHALL be resumable: an interrupted run continues without
    re-paying for chats already labelled.
6.  The system SHALL seed labels from `chat-reasons.csv` as version
    `zaapi-haiku-v0` so the existing 20k labels are not paid for twice.
7.  Classifying 20,000 chats SHALL cost under USD 5 and finish in under 15
    minutes.
8.  The system SHALL determine "staff replied" from data where possible (for
    example a `name` that is not the bot's name), and fall back to the model
    only when the data cannot tell — **OPEN** (Q5).

### R3 — Accuracy check

**User story:** As the support lead, I want to hand-check a sample, so that I
know how far to trust the labels.

1.  WHEN the lead runs the sample command THEN the system SHALL pick 100
    random labelled chats (stratified by reason) and show each one with its
    redacted text and model label.
2.  The lead SHALL be able to enter the correct reason and outcome for each.
3.  The system SHALL report agreement: reason ≥ 85% and outcome ≥ 80% is a
    pass; below that, the report SHALL list the most-confused pairs.
4.  Hand labels SHALL be stored and reused as a regression set for future
    classifier versions.

### R4 — Knowledge-base gap list

**User story:** As the support lead, I want a list of questions the bot
could not answer and the KB does not cover, so that I know what to add.

1.  The system SHALL parse the KB files into entries (one per `##` question
    in `general-qna`, plus product entries) with an ID, title and text.
2.  WHEN gap analysis runs THEN the system SHALL group the customer questions
    from `unresolved` and `no_reply` chats into topics (similar questions
    together).
3.  For each topic, the system SHALL find the closest KB entries and decide
    if the topic is covered, partly covered, or not covered.
4.  The system SHALL output the top 20 topics by chat count that are not
    covered or partly covered, each with: a short question, chat count,
    reason, closest KB entry (if any), and 3 example ticket numbers.
5.  The output SHALL be readable in the app and exportable as Markdown or CSV.
6.  Example chats SHALL be shown redacted.

### R5 — Weekly trends

**User story:** As the support lead, I want weekly rates per reason and
channel, so that I can see whether a KB change helped.

1.  The system SHALL show, per ISO week (Malaysia time, UTC+8): total chats,
    and the share resolved / unresolved / unclear / no_reply.
2.  The lead SHALL be able to filter by reason and by channel.
3.  `empty` chats SHALL be excluded from rates by default, with a toggle to
    include them.
4.  The lead SHALL be able to add a dated note (e.g. "KB v3 uploaded") that
    appears as a marker on the trend chart.
5.  Weeks with fewer than 30 chats for the selected filter SHALL be shown as
    low-confidence.
6.  The view SHALL show Zaapi's own daily AI resolution rate (Section 5.4)
    beside the classifier's rate for the same period.

### R6 — Drill-down

**User story:** As the support lead, I want to open the chats behind any
number, so that I can read real examples.

1.  WHEN the lead selects a reason, outcome, week, channel or gap topic THEN
    the system SHALL list the matching chats (ticket number, date, channel,
    reason, outcome, summary).
2.  WHEN the lead opens a chat THEN the system SHALL show its transcript with
    personal data masked by default, and an explicit "show original" action.
3.  The lead SHALL be able to correct a chat's label; corrections are stored
    as hand labels (R3.4).

### R7 — Privacy and security

1.  Raw chats, contacts and the database SHALL stay on the author's Mac and
    SHALL be gitignored.
2.  Only redacted text SHALL be sent to the model API; the redaction SHALL be
    unit-tested on samples covering emails, Malaysian/Singapore phone formats,
    order numbers, addresses and names.
3.  The app SHALL listen on `127.0.0.1` only.
4.  The API key SHALL come from an environment variable or the macOS
    Keychain, never from a committed file.
5.  Image URLs SHALL NOT be fetched.

### R8 — Operations

1.  One command each for: import, classify, gap analysis, sample check, start
    app. A single `refresh` command SHALL run import → classify → gaps.
2.  Every command SHALL print what it did and the cost of model calls.
3.  The README SHALL document setup, the commands, and how to add a new
    export.

--------------------------------------------------------------------------------

## 7. Out of scope (MVP)

*   Replying to customers or sending messages on any channel.
*   Changing Ah Va or Zaapi settings, or uploading KB files automatically.
*   Sales and marketing features: customer segments, free-book funnel,
    campaign reports, stuck-buyer outreach.
*   Shopify orders, customer profiles, the contacts CSVs.
*   Multiple users, logins, hosting on a server, mobile view.
*   Real-time data; data is as fresh as the last import.
*   Image analysis of chat attachments.

--------------------------------------------------------------------------------

## 8. Design guidance (for `design.md`)

### 8.1 Constraints (DECIDED)

*   Runs locally on macOS (Apple Silicon), single user.
*   Python is already used in this repo (stdlib-only scripts); Claude is the
    model provider already in use.
*   Small and boring beats clever: fewest dependencies that meet the
    requirements.

### 8.2 Suggested default stack (OPEN — author picks in design phase)

| Layer | Suggested default | Alternatives to present |
| --- | --- | --- |
| Storage | SQLite (one file, stdlib `sqlite3`) | DuckDB (faster analytics); Postgres (only if multi-user later) |
| Import / jobs | Python CLI scripts | — |
| Classification | Claude API (Haiku-class model, Message Batches API for ~50% lower cost), structured JSON output | Keep `claude -p` CLI as today |
| Topic grouping for gaps | Embeddings + clustering, or model-based grouping in batches | Keyword grouping only (cheaper, weaker) |
| KB matching | Embedding similarity, then a model check on the top 3 matches | Model-only check against full KB (expensive: KB is 1.8 MB) |
| UI | Streamlit (Python, charts built in) | Static HTML report generated per run (no server at all); small FastAPI + HTML |
| Scheduling | Manual `refresh` command | macOS `launchd` daily job |

Ask the author to choose storage, UI and the grouping method before
writing `design.md`. Each choice: state mechanism, trade-offs, and when it
fails.

### 8.3 Data flow (target)

```text
 export file (Zaapi JSONL, later Ah Va)
        │  source adapter (zaapi | ahva)
        ▼
   import ──► tickets, messages (SQLite)
                    │
                    ▼
   redact ──► classify (Claude API) ──► labels (versioned)
                    │
                    ├──► weekly rollups ──► Trends view
                    │
   KB files ──► parse ──► kb_entries
                    │            │
   unresolved chats ─► group ─► match ──► gap list ──► Gaps view
                    │
   hand labels ◄──── Sample check / Drill-down corrections
```

### 8.4 Suggested data model

| Table | Key fields |
| --- | --- |
| `tickets` | ticket_id (PK), ticket_number, source, channel, opened_at, closed_at, is_open, ai_summary |
| `messages` | ticket_id (FK), seq, who, name, at, text, has_images |
| `labels` | ticket_id, classifier_version, reason, outcome, staff_replied, labelled_at, cost_usd |
| `hand_labels` | ticket_id, reason, outcome, labelled_at, note |
| `kb_entries` | kb_id, source_file, section, title, body, kb_version |
| `gap_topics` | topic_id, run_id, question, chat_count, reason, coverage, closest_kb_id |
| `gap_topic_tickets` | topic_id, ticket_id |
| `notes` | date, text (trend markers) |
| `runs` | run_id, kind, started_at, finished_at, counts, cost_usd |

### 8.5 Redaction rules (minimum)

*   Emails → `[email]`; phone numbers incl. `+60`, `+65`, `01x-xxxxxxx` →
    `[phone]`; order numbers (pattern to confirm from data) → `[order]`;
    street addresses and postcodes → `[address]`; personal names (customer
    `name` field values and names in text) → `[name]`.
*   Redaction happens before any model call and before any example is shown
    in reports.

--------------------------------------------------------------------------------

## 9. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Privacy | R7. Personal data never committed; only redacted text leaves the Mac. |
| Cost | ≤ USD 5 per 20k chats classified; gap run ≤ USD 3. Print cost per run. |
| Speed | Import 20k < 5 min; classify 20k < 15 min; app pages load < 2 s. |
| Repeatability | Same input + same classifier version → same stored labels (no re-classification). |
| Testability | Unit tests for import parser, redaction, rollups; regression check of classifier against hand labels. |
| Rollback | All data in one SQLite file; delete it and re-run `refresh` to rebuild. |

--------------------------------------------------------------------------------

## 10. Suggested task breakdown (for `tasks.md`)

1.  Project skeleton: folder `support-insight/`, dependency file, `.gitignore`
    for DB and exports, README stub. (R7.1, R8.3)
2.  SQLite schema and migration script. (R1, R2.3, 8.4)
3.  Zaapi source adapter + import command with upsert, skip log and counts.
    Tests on a small fixture built from fake data. (R1)
4.  Seed labels from `chat-reasons.csv` as `zaapi-haiku-v0`. (R2.6)
5.  Redaction module with unit tests. (R2.2, R7.2)
6.  Classifier: prompt, versioning, batching, resume, cost tracking. (R2)
7.  Staff-replied detection from message data. (R2.8)
8.  Sample-check command and agreement report; hand-label storage. (R3)
9.  KB parser for `general-qna` and product files. (R4.1)
10. Gap analysis: grouping, KB matching, top-20 output (app + Markdown/CSV).
    (R4)
11. Weekly rollups + trend view with filters, notes and low-confidence
    flag; Zaapi daily rate overlay. (R5)
12. Drill-down view with masked transcript and label correction. (R6)
13. `refresh` command chaining import → classify → gaps; cost print. (R8)
14. README: setup, commands, adding a new export, privacy rules. (R8.3)
15. Run on the real export; record results; hand-check 100 chats. (R3, G1)

--------------------------------------------------------------------------------

## 11. Open questions (ask the author)

| ID | Question | Affects |
| --- | --- | --- |
| **Q1** | Can Ah Va export chats (file or API)? If not, the tool only sees Zaapi data up to 20 Nov 2026 and the weekly trend (R5) has no future data. Biggest risk. | R1.6, R5 |
| **Q2** | Who hand-labels the 100-chat sample? | R3 |
| **Q3** | Fixed definition of "resolved" (current: "customer got a clear answer or fix"). Should a chat where staff took over and solved it count as resolved by the bot? | R2, R5 |
| **Q4** | Keep the 11 reasons as the fixed taxonomy, or revise? Revising breaks comparison with the 20k existing labels. | R2 |
| **Q5** | How to tell staff replies from bot replies when the export labels both `bot`? Check whether `name` differs. | R2.8 |
| **Q6** | Which KB is the baseline for gaps — the Zaapi KB (2026-11-20) or Ah Va's current knowledge? | R4 |
| **Q7** | Stack choices in 8.2 (storage, UI, grouping method). | Design |

--------------------------------------------------------------------------------

## 12. Success measures (from the EGM draft goals)

*   **G1** Labels match a 100-chat hand check: reason ≥ 85%, outcome ≥ 80%.
*   **G2** Each run lists the top 20 uncovered questions with counts and 3
    examples each.
*   **G3** Weekly resolved / unresolved / no-reply rates per reason and
    channel, with change markers.
*   **G4** One-command import + classify of 20k chats in < 15 min and < USD 5.
*   **G5** No personal data leaves the Mac except redacted text to the model.
*   **Business outcome (not a build gate):** resolved share rises above the
    23% baseline after KB fixes guided by the gap list.

## 13. Glossary

| Term | Meaning |
| --- | --- |
| Ah Va | Current AI support agent tool (replaced Zaapi). |
| Zaapi | Previous support tool; source of the current export. |
| KB | Knowledge base — the Q&A and product files the bot answers from. |
| Scenario | A Zaapi rule: trigger + response mode + reply steps. |
| Ticket / chat | One customer conversation. |
| Reason | Why the customer wrote (one of 11). |
| Outcome | How the chat ended (one of 4). |
| Gap | A customer question in failed chats that the KB does not answer. |
| Classifier version | Prompt hash + model ID that produced a label. |
