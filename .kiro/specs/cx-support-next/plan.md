# Plan for Case Context, Supervisor Desk, and AI Agent backends

This plan replaces the **Not connected** placeholders from the [frontend handoff](../cx-support-frontend/design.md#placeholder-handoff) with working features. It covers Case Context, the Supervisor Desk escalations, AI Agent configuration, Knowledge, and AI analytics. Each section below is one PR. An owner runs it box by box, and the operator audits from the evidence.

Read [AGENTS.md](../../../AGENTS.md), the [current design](../cx-support-tool/design.md), and the [frontend design](../cx-support-frontend/design.md) first.

## Owner decisions this plan builds on

The owner made these calls on 2026-11-26.

1. Order data has no known source yet. Build an `OrderProvider` interface with a synthetic fixture provider. A real adapter plugs in later and gets `shortcut:` comments for undocumented gaps.
2. A policy approval records a decision only. The app stores the request, the approver, the decision, and the audit trail. A person performs the refund, reprint, or return in the real system. The app makes no external writes.
3. The AI may reply to customers without a human on channels that a supervisor enables. This changes the current contract, which says "Keep server redaction, manual fallback, and human send". PR C5 updates the requirements and design before any code sends a message.

## Out of scope until the owner decides

| Feature | Why it waits |
| --- | --- |
| Photo and attachment previews | AGENTS.md says "Never fetch chat attachment URLs." A preview needs that rule changed. |
| CSAT | A survey is a message to the customer. Its timing, channel, and wording are owner decisions. |
| Batch alerts | No production batch data exists. The fixture `OrderProvider` must not invent alerts that look real. |
| Automatic identity matching across platforms | Joining identities without proof can show one customer's case to another. This plan links cases by hand only. |
| A real order source | It depends on decision 1. |

## Data shape first

Every later PR reads these shapes. PR F1 lands them, so nothing downstream guesses.

- `messages.sent_by` is `'human' | 'ai'`, and `messages.sent_by_user_id` is set for a human sender. Existing outbound rows backfill to `'human'`. AI analytics count only from these columns.
- `conversation_events` is an append-only log with `type`, `conversation_id`, `actor` (`user id` or `'ai'` or `'system'`), `data` (JSON with no customer text), and `created_at`. Handoffs, escalation decisions, links, and priority changes all write here. Reports and drift read from here, so no feature adds its own counter table.
- Each escalation is a state machine with these transitions. `pending` moves to `approved`, `rejected`, or `returned`. `returned` moves back to `pending` after the agent edits it. `approved` and `rejected` are final. The transition table lives in one place, the same way `status` transitions do today.
- An AI reply is keyed by the inbound message ID it answers. A unique index on `ai_replies(inbound_message_id)` makes a retried webhook or a restart send at most one reply.

## PRs in landing order

| PR | Change | Waits for | May touch |
| --- | --- | --- | --- |
| F1 | Sender attribution and the event log | Nothing. It branches from `main`. | `lib/db/schema.ts`, new migration, `lib/services/message.ts`, `lib/services/conversation.ts`, `scripts/seed-users.ts`, tests |
| A1 | Customer history from real conversations | F1 | `lib/services/conversation.ts`, `app/(app)/inbox/[conversationId]/`, tests |
| A2 | `OrderProvider`, fixture provider, and manual order link | F1 | `lib/adapters/orders/`, `lib/services/order-link.ts`, schema, migration, Case Context, tests |
| A3 | Priority and SLA computed on read | F1 | schema, migration, `lib/services/sla.ts`, `lib/services/conversation.ts`, queue, thread header, `/settings`, tests |
| A4 | Manual multi-channel case links | F1, A1 | schema, migration, `lib/services/case-link.ts`, Case Context, tests |
| B1 | Escalation requests and approval queue | F1, A2 | schema, migration, `lib/services/escalation.ts`, `app/api/escalations/`, Case Context, `/reports?view=escalations`, tests |
| B2 | SLA alerts on the Supervisor Desk | A3 | `/reports?view=escalations`, `lib/services/sla.ts`, tests |
| C1 | Knowledge Base with versions and retrieval preview | F1 | schema, migration (FTS5), `lib/services/knowledge.ts`, `app/api/knowledge/`, `/ai-agent?tab=knowledge_base`, tests |
| C2 | Suggestions cite Knowledge Base articles and record gaps | C1 | `lib/adapters/ai.ts`, `app/api/conversations/[id]/ai-suggest/`, `lib/services/knowledge.ts`, composer, tests |
| C3 | Knowledge Gaps view | C2 | `lib/services/knowledge-gap.ts`, `/ai-agent?tab=knowledge_gaps`, tests |
| C4 | Agent Config drafts, publishing, and pause | F1 | schema, migration, `lib/services/agent-config.ts`, `/ai-agent?tab=agent_config`, tests |
| C5 | Autonomous replies on allowed channels | C2, C4, A3 | requirements and design docs, `lib/services/ai-agent.ts`, `lib/services/webhook.ts`, `lib/services/message.ts`, tests |
| D1 | AI Overview metrics | C5 | `lib/services/ai-metrics.ts`, `/ai-agent?tab=overview`, tests |
| D2 | Customer Sentiment | F1 | schema, migration, `lib/services/sentiment.ts`, a script under `scripts/`, `/ai-agent?tab=sentiment`, tests |
| D3 | Drift Detection | D1, D2 | `lib/services/drift.ts`, `/ai-agent?tab=drift`, tests |

The PRs that can run in parallel after F1 are A1, A2, A3, C1, C4, and D2. Two PRs that both add a migration must land one after the other, because Drizzle numbers migrations in order. Rebase the later one and regenerate its migration.

Every PR except F1 and D3 changes an interaction. Each of those PRs waits for the operator's review before merge.

## Shared verification rules

- Unit. Run `npm test -- <paths>`. Tests use the in-memory database and synthetic fixtures.
- Live. Run `npm run seed:users` against a separate SQLite file, start `npm run dev`, and drive the real page in Chrome at 1440 × 900 and 390 × 844. Inbound messages come from a signed Telegram fixture or from the Telegram test bot through `scripts/telegram-poll.mts`.
- Perf. Seed 10,000 synthetic conversations with 20 messages each. Measure the named query or route on `main` first, then on the PR. Report the median of 20 runs.
- Data. Before each commit, inspect the staged diff for personal data, credentials, and unrelated files.

---

## F1. Sender attribution and the event log

- [ ] Depends on nothing. Branch from `main`.
- [ ] Edits `lib/db/schema.ts`, a new migration, `lib/services/message.ts`, `lib/services/conversation.ts`, and tests.
- [ ] Change. Add `messages.sent_by` and `messages.sent_by_user_id`, and backfill existing outbound rows to `'human'`. Add the `conversation_events` table. Make `storeOutbound` take an actor instead of reading one from a session. Write a `conversation_events` row from the existing assign and status paths.
- [ ] Result. Every outbound message records who sent it. Assign and status changes appear in `conversation_events` with no customer text.
- [ ] Unit. A human send stores `sent_by = 'human'` with the user ID. The migration backfills a pre-existing outbound row. An assign and a status change each write one event. Event `data` never contains message text. Run `npm test -- tests/services tests/db`.
- [ ] Live. Send a reply from the thread to the Telegram fixture. Pass when `sqlite3 <db> "select sent_by, sent_by_user_id from messages where direction='outbound'"` shows `human` and the agent's ID.
- [ ] Perf. Measure `POST /api/conversations/[id]/messages` time to 202. Fail if the median rises more than 5 ms over `main`.

## A1. Customer history from real conversations

- [ ] Depends on F1.
- [ ] Edits `lib/services/conversation.ts`, the thread page, the Case Context panel, and tests.
- [ ] Change. List earlier conversations with the same `platform` and `customer_identifier`, each with its status, date, and message count. Apply the same access rule as the inbox. An agent sees only the conversations they can open.
- [ ] Result. Case Context shows **Previous conversations** with links. A customer with no earlier conversation shows an empty state, not **Not connected**.
- [ ] Unit. The list includes only rows with the same identifier and platform. An agent never sees another agent's assigned case. The current conversation is excluded.
- [ ] Live. Send two messages from the test bot, resolve the conversation, and send again. Pass when the reopened thread is the same conversation. Then send from a second synthetic identifier and pass when its Case Context shows no history.
- [ ] Perf. Measure the thread page server render. Fail if the median rises more than 20 ms over `main`.

## A2. Order provider, fixture provider, and manual order link

- [ ] Depends on F1.
- [ ] Edits `lib/adapters/orders/` (new), `lib/services/order-link.ts`, schema, migration, the Case Context panel, and tests.
- [ ] Change. Define `OrderProvider.lookup(orderNumber)`. It returns the order, its items, its production stage, and its shipment, or `not_found`, or `unavailable`. Add a fixture provider that `ORDER_PROVIDER=fixture` selects. An agent links an order number to a conversation by hand. The link writes a `conversation_events` row.
- [ ] Result. Case Context shows the linked order's product, production stage, and tracking. An unset `ORDER_PROVIDER` keeps **Not connected**.
- [ ] Unit. The provider is chosen from the environment. `not_found` and `unavailable` render different states. The order number is redacted before any model call.
- [ ] Live. Link a fixture order number in the thread. Pass when the stage and tracking show and survive a reload. Pass when an unknown number shows **Order not found** and stores nothing.
- [ ] Perf. Measure thread render with a linked order. The provider has a 2-second timeout, and a timeout renders **unavailable**. Fail if the render waits longer than the timeout.

## A3. Priority and SLA computed on read

- [ ] Depends on F1.
- [ ] Edits schema, migration, `lib/services/sla.ts` (new), `lib/services/conversation.ts`, the queue, the thread header, `/settings`, and tests.
- [ ] Change. Add `conversations.priority` (`normal`, `high`, or `urgent`), which an agent or supervisor sets by hand. A supervisor sets a first-response target for each priority in `/settings`. Compute the deadline on read from the oldest inbound message that has no reply. No timer process runs.
- [ ] Result. The queue shows a priority badge and a due or overdue label. A filter for overdue cases uses the existing query contract.
- [ ] Unit. The deadline equals the first unanswered inbound time plus the target. A reply clears the deadline. Snoozed and resolved cases have no deadline. An agent cannot change the targets.
- [ ] Live. Set the `normal` target to 2 minutes and send from the test bot. Pass when the queue shows **Overdue** after 2 minutes with no reload, through SSE or a 30-second refresh. Pass when a reply clears it.
- [ ] Perf. Measure `GET /api/conversations` with an overdue filter on the 10,000-row seed. Fail if the median exceeds 2 times `main` without the filter.

## A4. Manual multi-channel case links

- [ ] Depends on F1 and A1.
- [ ] Edits schema, migration, `lib/services/case-link.ts`, the Case Context panel, and tests.
- [ ] Change. An agent links the current conversation to another conversation that they can open. Each link writes a `conversation_events` row, and either side can remove it. Links never merge messages.
- [ ] Result. Case Context lists the linked conversations with their channels.
- [ ] Unit. Linking twice is a no-op. Linking to an inaccessible conversation returns 404. An agent who loses access to one side stops seeing that link.
- [ ] Live. Link two fixture conversations from different identifiers. Pass when both threads show the link after a reload, and when an unlink removes it from both threads.
- [ ] Perf. Measure thread render with 10 links. Fail if the median rises more than 20 ms over A1.

## B1. Escalation requests and approval queue

- [ ] Depends on F1 and A2.
- [ ] Edits schema, migration, `lib/services/escalation.ts`, `app/api/escalations/`, Case Context, `/reports?view=escalations`, and tests.
- [ ] Change. An agent requests a refund, reprint, return, hold, or override from Case Context, with a reason and an optional amount. A supervisor approves, rejects, or returns the request with a note. The transition table is the state machine above. One pending request exists for each conversation and type. Every transition writes a `conversation_events` row. No external system is called.
- [ ] Result. The Escalations view shows a real queue and a detail panel. The thread shows the request state. An approved request reads **Approved. Perform the refund in the order system.**
- [ ] Unit. Every illegal transition returns 409. An agent cannot approve. A second pending request of the same type returns 409. A repeated approve request with the same request ID converges to one decision.
- [ ] Live. As Agent A, request a reprint on a fixture case. As the supervisor, return it with a note. As Agent A, edit and resubmit it. As the supervisor, approve it. Pass when the thread and the queue both show each state without a reload, and the case history lists four events.
- [ ] Perf. Measure the Escalations view with 500 pending requests. Fail if the server render median exceeds 300 ms.

## B2. SLA alerts on the Supervisor Desk

- [ ] Depends on A3.
- [ ] Edits the Escalations view, `lib/services/sla.ts`, and tests.
- [ ] Change. Replace the **SLA alerts** placeholder with the overdue and due-within-15-minutes cases from A3. Batch alerts stay **Not connected**.
- [ ] Result. A supervisor sees which cases miss their first-response target and who owns them.
- [ ] Unit. The alert list matches the overdue filter for the same clock.
- [ ] Live. Reuse the A3 scenario. Pass when the case appears in **SLA alerts** and leaves it after a reply.
- [ ] Perf. Same probe and threshold as A3.

## C1. Knowledge Base with versions and retrieval preview

- [ ] Depends on F1.
- [ ] Edits schema, a migration with an FTS5 table, `lib/services/knowledge.ts`, `app/api/knowledge/`, `/ai-agent?tab=knowledge_base`, and tests.
- [ ] Change. A supervisor creates an article with a title, body, category, and source owner. Edits create a new draft version, and publishing makes that version current. Archiving hides the article from retrieval. A preview box runs the same retrieval query that C2 uses and lists the matching published versions with their scores.
- [ ] Result. The Knowledge Base tab lists the articles with their status, and the preview shows which articles a question retrieves.
- [ ] Unit. Retrieval returns only published current versions. Publishing a draft keeps the earlier version readable in history. An agent gets 403 on every write.
- [ ] Live. Publish a synthetic article about delivery times. Pass when the preview query "how long is delivery" returns it first, and when it disappears from the preview after you archive it.
- [ ] Perf. Measure retrieval with 2,000 synthetic articles. Fail if the median exceeds 20 ms.

## C2. Suggestions cite Knowledge Base articles and record gaps

- [ ] Depends on C1.
- [ ] Edits `lib/adapters/ai.ts`, the ai-suggest route, `lib/services/knowledge.ts`, the composer, and tests.
- [ ] Change. Before the model call, retrieve the top three published articles for the redacted latest customer message and add them to the prompt. The suggestion response lists the cited article IDs. When retrieval returns nothing above the score threshold, store a gap event with the redacted question and no customer name.
- [ ] Result. The composer shows the suggestion and its cited articles. Agents still press **Send**.
- [ ] Unit. The prompt contains only redacted text. A retrieval with no match writes one gap event. A gap event contains no unredacted name, email, phone number, address, or order number, which the existing property 19 redaction checks confirm.
- [ ] Live. Point the AI endpoint at a local OpenAI-compatible model. Ask the delivery question from the test bot and request a suggestion. Pass when the suggestion cites the delivery article. Ask an unrelated question and pass when a gap event appears.
- [ ] Perf. Measure suggestion latency against a local stub that answers in a fixed 200 ms. Fail if the added retrieval time exceeds 30 ms.

## C3. Knowledge Gaps view

- [ ] Depends on C2.
- [ ] Edits `lib/services/knowledge-gap.ts`, `/ai-agent?tab=knowledge_gaps`, and tests.
- [ ] Change. List the open gap events and group them by the topic that a supervisor assigns. A supervisor turns a gap into a draft article, which C1 then publishes. A gap closes when a published article answers its question in the retrieval preview.
- [ ] Result. The tab shows the uncategorized gaps, the categorized gaps with counts and example questions, and links to their source cases.
- [ ] Unit. Topic counts match the stored events. Closing a gap requires a published article that retrieval returns for the gap question.
- [ ] Live. Use the unrelated question from C2. Create a draft from it, publish the draft, and pass when the gap shows **Closed** and the next suggestion for that question cites the new article.
- [ ] Perf. Measure the tab with 5,000 gap events. Fail if the server render median exceeds 300 ms.

## C4. Agent Config drafts, publishing, and pause

- [ ] Depends on F1.
- [ ] Edits schema, migration, `lib/services/agent-config.ts`, `/ai-agent?tab=agent_config`, and tests.
- [ ] Change. Store versions of the config, each with instructions, allowed channels, the knowledge categories it may use, handoff rules, and a confidence threshold. A supervisor edits a draft and publishes it. **Pause** is a separate flag that takes effect at once and does not need a publish. The default config is paused and has no allowed channels.
- [ ] Result. The tab shows the published version, the draft with its diff, and the pause state. Nothing sends yet, because C5 adds the runtime.
- [ ] Unit. Only supervisors write. Publishing a draft that fails validation returns 400. The published config is the only one any reader sees.
- [ ] Live. Allow the Telegram channel in a draft and publish it, then pause. Pass when a reload shows version 2, Telegram allowed, and **Paused**.
- [ ] Perf. Not applicable. The page reads one row. Record the render median for C5 to compare against.

## C5. Autonomous replies on allowed channels

- [ ] Depends on C2, C4, and A3.
- [ ] Edits the requirements and design docs first, then `lib/services/ai-agent.ts` (new), `lib/services/webhook.ts`, `lib/services/message.ts`, and tests.
- [ ] Change. Update [requirements.md](../cx-support-tool/requirements.md) and [design.md](../cx-support-tool/design.md) to describe autonomous replies, and get owner approval on that diff before writing code. After `ingest`, an inbound message on an unassigned conversation goes to the AI agent when the published config allows its channel and is not paused. The agent retrieves articles and drafts a reply. It sends only when all of the following hold. The reply cites an article above the threshold. It contains no redaction placeholder such as `[NAME]`. No handoff rule matches. Otherwise it hands off. A handoff writes an event with its reason and runs the existing `autoAssign`. A sent reply uses `sent_by = 'ai'`. The unique `ai_replies(inbound_message_id)` key prevents a second reply after a retry or restart. A conversation that a human owns never gets an AI reply.
- [ ] Result. On an allowed channel, a question that the Knowledge Base covers gets an AI reply. Every other message reaches a human with a recorded reason.
- [ ] Unit. The same webhook delivered twice sends one reply. A reply with a placeholder hands off. Pause stops sending on the next message. A human-assigned case gets no AI reply. A model timeout hands off with reason `model_unavailable`.
- [ ] Live. The operator must be present for this check, because it sends real messages to the Telegram test bot. Publish a config that allows Telegram. Ask the delivery question from the owner's phone, and pass when the AI answers on the phone and the thread shows the reply as sent by AI. Ask the unrelated question, and pass when no reply goes out and the case is assigned with reason `no_grounding`. Pause, ask the delivery question again, and pass when no reply goes out.
- [ ] Perf. Measure webhook time to 200 with the AI enabled. The AI work must run after the response, so fail if the median rises more than 10 ms over `main`.

## D1. AI Overview metrics

- [ ] Depends on C5.
- [ ] Edits `lib/services/ai-metrics.ts`, `/ai-agent?tab=overview`, and tests.
- [ ] Change. Compute the metrics from `messages.sent_by` and `conversation_events` for a period and channel. **AI messages sent** counts delivered AI messages. **Full AI resolution** counts resolved cases with no human outbound message. **Partial AI resolution** counts resolved cases with at least one AI message and at least one human message. Handoffs are counted by reason. Both resolution rates use the same cohort, which is the cases resolved in the period.
- [ ] Result. The Overview cards show real numbers, with definitions that match [the frontend design](../cx-support-frontend/design.md#placeholder-handoff).
- [ ] Unit. Build one fixture with each outcome type, and assert each count and that the rates share a denominator.
- [ ] Live. After the C5 scenario, resolve both cases. Pass when Overview shows 1 AI message, 1 full AI resolution, and 1 handoff with reason `no_grounding`.
- [ ] Perf. Measure the tab on the 10,000-conversation seed. Fail if the server render median exceeds 300 ms.

## D2. Customer Sentiment

- [ ] Depends on F1.
- [ ] Edits schema, migration, `lib/services/sentiment.ts`, `scripts/sentiment.ts`, `/ai-agent?tab=sentiment`, and tests.
- [ ] Change. A script classifies the inbound messages that have no label. It sends redacted text to the configured model and stores `positive`, `neutral`, `negative`, or `unknown`, together with the model name. The unique message ID makes a rerun skip the stored labels. The tab shows daily shares and the cases behind a negative shift. A day with fewer than 10 labels shows **Low evidence**.
- [ ] Result. Supervisors see sentiment trends with the source cases and the model that produced each label.
- [ ] Unit. A rerun labels nothing new. A model failure stores `unknown`. The model receives only redacted text.
- [ ] Live. Send three synthetic messages with a clear tone from the test bot and run the script against a local model. Pass when the tab shows three labels that match the tone and links to the cases.
- [ ] Perf. Measure the script throughput against a local stub. Record the number. The gate is that a rerun on 10,000 labeled messages finishes in under 5 seconds.

## D3. Drift Detection

- [ ] Depends on D1 and D2.
- [ ] Edits `lib/services/drift.ts`, `/ai-agent?tab=drift`, and tests.
- [ ] Change. Compare two windows of equal length for the handoff rate, the gap rate, and the negative sentiment share. Flag a signal when both windows have at least 30 samples and the change passes a threshold that the supervisor sets. Each signal shows the published config version, the article count, the model name, and links to the cases.
- [ ] Result. The tab lists the real signals with their sample sizes, or **Not enough data**.
- [ ] Unit. A window under 30 samples never flags. Fixed fixture windows produce the expected signals.
- [ ] Live. Seed two synthetic windows with a known jump in handoffs. Pass when the tab flags the handoff rate and links to the cases in the later window.
- [ ] Perf. Measure the tab on the 10,000-conversation seed. Fail if the server render median exceeds 300 ms.

## What stays unproven

- No real order source exists, so A2 shows only fixture orders.
- C5 is tested only on the Telegram test bot. Zaapi and respond.io have no live accounts, and their webhook routes were removed in #45.
- Retrieval quality depends on the articles and the local model. The C2 and C5 checks prove the mechanism, not the quality of the answers.
