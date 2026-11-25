# Design for the CX Support frontend redesign

Use the current Next.js App Router application and the project's shadcn primitives. Use Photobook Care Studio as a visual and workflow reference. The live application reads and writes through the existing CX Support boundaries. The reference app stays outside the app's imports, build, and test discovery.

Read [repository instructions](../../../AGENTS.md), the [current design](../cx-support-tool/design.md), and the [local setup and test instructions](../../../README.md). For layout, use `AgentWorkspace.tsx`, `SupervisorDesk.tsx`, and `AiAgentWorkspace.tsx` under the local prototype's `photobook-care-studio/src/components/` folder. The prototype's theme switcher, role switcher, fabricated records, test controls, and blueprint views are design tools.

## Feature map

The map reflects the checkout at `9c99731`. Recheck it before implementation. **Connected** has an existing user flow. **Existing backend** needs a UI built around its current contract. **Placeholder** needs future feature work.

| New frontend | Status | Source and binding |
| --- | --- | --- |
| Login, app shell, profile, logout | Connected | `/login`, [`currentUser()`](../../../lib/auth/current-user.ts), [app layout](<../../../app/(app)/layout.tsx>), and existing logout route. Keep role navigation tied to the current session. |
| Inbox queue, filters, thread | Connected | [`parseConversationQuery`, `getConversations`, `getConversation`](../../../lib/services/conversation.ts) and the [current inbox](<../../../app/(app)/inbox/page.tsx>) and [thread](<../../../app/(app)/inbox/[conversationId]/page.tsx>). Use safe server-rendered reads, existing ID and channel, cursor, timestamps, and unread count. |
| Live refresh and notifications | Connected | [AppProvider](<../../../app/(app)/app-provider.tsx>) and `/api/events`, `/api/notifications`. Keep one SSE connection and current notification clearing and ownership. Notification read state and conversation unread count come from different fields. |
| Thread composer, retry, canned insertion | Connected | [ComposeArea](../../../components/compose/ComposeArea.tsx), [send helper](../../../components/compose/send-reply.ts), and [messages endpoint](<../../../app/api/conversations/[id]/messages/route.ts>). Use the conversation's channel and platform. Attachments have a presence flag. |
| AI reply suggestion | Connected | [Suggestion endpoint](<../../../app/api/conversations/[id]/ai-suggest/route.ts>) and [suggestion helper](../../../components/compose/suggest-reply.ts). Keep server redaction, manual fallback, and human send. |
| Owner, claim, reassign, lifecycle | Existing backend | [`POST .../assign`](<../../../app/api/conversations/[id]/assign/route.ts>) and [`PATCH .../status`](<../../../app/api/conversations/[id]/status/route.ts>). Accessible agents can self-assign. Supervisors can assign or reassign to active agents. Use the existing transition table and errors. |
| Supervisor Desk team reports | Connected | [`/reports`](<../../../app/(app)/reports/page.tsx>), [report service](../../../lib/services/report.ts), and `/api/reports`. Keep live queue totals, historical metrics, breakdowns, and filters. |
| Suggestion provider settings | Connected | [`/settings`](<../../../app/(app)/settings/page.tsx>), [settings action](<../../../app/(app)/settings/actions.ts>), and `/api/settings/ai`. Continue using the server form. |
| Canned-response settings | Existing backend | [`GET`, `POST /api/canned-responses`](../../../app/api/canned-responses/route.ts) and [`PUT`, `DELETE .../[id]`](<../../../app/api/canned-responses/[id]/route.ts>). Use the existing response library, mutations, validation, and conflicts. |
| Auto-assignment settings | Existing backend | [`configureAutoAssign` and `autoAssign`](../../../lib/services/assignment.ts), [rule table](../../../lib/db/schema.ts), and [webhook service](../../../lib/services/webhook.ts). Read the active rule server-side and call the existing configuration service through a supervisor-only server action. |
| Case Context and escalation actions | Placeholder with connected context fields | Display real customer label, channel, platform, status, and safe ownership context. Leave order, shipment, print details, photo preview, policy decisions, returns/refunds, reprints, overrides, and escalations unavailable. |
| SLA, priority, multi-channel cases, customer insights | Placeholder | Current conversation model has one channel and one platform thread. It has no SLA clock, priority, order search, customer history, or sentiment store. Display unavailable states in context or overflow so queue scanning remains simple. |
| Supervisor Desk escalation queue and operations signals | Placeholder | Future approval history, escalation routing, batch and SLA alerts, and CSAT need data beyond existing team reports. Placeholders use unavailable states and remain clearly separate from real report totals. |
| AI Agent workspace | Placeholder with provider-settings link | Config controls, Knowledge Base, categorized Knowledge Gaps, Customer Sentiment, Drift Detection, and AI metrics need future storage and operations. The existing AI adapter supplies draft suggestions only. |

## Routes and state

| Route | Frontend |
| --- | --- |
| `/login` | Photobook-branded sign-in using the existing action and validation. |
| `/inbox`, `/inbox/[conversationId]` | A shared inbox layout with queue and thread on desktop. Mobile shows the queue on `/inbox` and the selected thread at its direct link. Preserve the existing search parameters across links. |
| `/reports` | Supervisor Desk. Existing team reports are the default. An Escalations view holds future escalation and approval workflows. |
| `/settings` | Supervisor settings with the current reply-suggestion provider, canned responses, and auto-assignment sections. Preserve `/settings` as a working direct link. |
| `/ai-agent` | Supervisor-only views. Use `tab` for Overview, Agent Config, Knowledge Base, Knowledge Gaps, Customer Sentiment, and Drift Detection so reload and back navigation work. Overview links to the working reply-suggestion provider settings. |

Reuse one queue presentation and one thread presentation. Server components read the current session and authorized conversation data. When sharing the queue across routes, keep the filter-dependent query in a server page or slot that receives search params. Keep the composer, menus, tabs, and drawer interactions local. Reuse `AppProvider` for the session, notifications, and SSE. Protect `/ai-agent` before rendering any view. User selectors expose only the active agent IDs and display names needed by authorized supervisors.

Use the real conversation ID everywhere for navigation and writes. A long ID can have a short display label derived from the ID. Make the full value available in the header and keep the route keyed by the full value. Existing search matches customer name, identifier, and preview. Use the actual channel list in `lib/adapters/types.ts` and provide labeled colors with accessible contrast. Keep order search and cross-channel linking in the feature backlog. When a filter changes, take the user to the matching queue and keep their draft available for that conversation if they return.

Keep drafts in memory for the authenticated session and key them by conversation ID. An SSE refresh or route change must preserve draft text and the identity of any in-flight request. A successful send clears only the submitted text for the originating case if that text is still current. Ignore response updates for an obsolete case or request. Clear drafts when the session ends and discard a draft when access to that case is lost. Do not persist customer messages or drafts in browser storage.

Use `/settings` actions only for existing services and keep them supervisor-guarded. Keep suggestion settings and the future autonomous-agent configuration visually distinct. The suggestion settings save takes effect immediately. The future configuration shows a staged draft and publish affordance with the current unavailable reason.

## Placeholder handoff

Use actual empty states for connected views with zero results and **Not connected** for missing capabilities. Use disabled action controls with a visible reason or static previews. Keep synthetic examples in test fixtures. Use one small shared UI treatment for unavailable panels if the design repeats it. Define view props only as needed for rendering. Keep future API or storage design open until its feature spec.

| Future frontend | Missing backend input or action | Decision for the later feature spec |
| --- | --- | --- |
| Queue priority, SLA, and case links | SLA clock, priority signal, and a case identity across platform threads | Identify who owns the timer and channel linking, and which identities can be safely joined. |
| Case Context | Order and production records, permitted photo evidence, customer interaction history, order verification | Pick authorized data providers, identity matching, and permitted evidence access. |
| Policy actions and Supervisor Desk | Eligibility, approval requests and decisions, refund/reprint/hold execution, operations and CSAT signals | Define authority, audit events, duplicate protection, and the source of each signal. |
| Agent Config | Published version, draft version, allowed channels and sources, handoff rules and autonomous runtime state | Define edit and publish semantics, validation, and how pause affects the autonomous runtime. |
| Knowledge Base | Article records, source ownership, approved versions, retrieval preview, and publish | Define article visibility, publication lifecycle, and evidence for a retrieval result. |
| Knowledge Gaps | Uncategorized and categorized unanswered events, counts, example questions, linked source cases and articles | Define gap grouping, safe evidence, draft creation, and verification after publication. |
| Customer Sentiment | AI-estimated labels, time windows, matching case evidence, and unknown or low-evidence state | Define the customer utterances eligible for analysis and what supports a shift claim. |
| Drift Detection | Comparable time windows, sample sizes, source cases, thresholds, model and knowledge versions | Define signal scope and how affected cases or topics connect to an investigation. |
| AI metrics | Delivery events with sender attribution, AI-handled cases, agent contribution, handoff reasons, and final outcomes | Choose cohort and channel attribution, when to finalize resolution, and overlap or deduplication of handoff events. |

The metrics UI should label **AI messages sent** as delivered customer-facing messages sent by AI. **Full AI resolution** means a case resolved without human handling. **Partial AI resolution** means AI answered a substantive part, handed off what it could not answer, and a human completed the case. Use the same displayed cohort for the two resolution rates. Show unable-to-answer handoffs, policy transfers, and pending handoffs with explicit labels. A handoff can be part of a later partial resolution. Preserve that distinction when designing future event counts. The current app has no data source for these metrics.

## Verification boundaries

- Compare the redesigned views with the downloaded design at 1440 × 900 and 390 × 844. In the default inbox, the queue, latest message, and send destination should be easy to locate. On mobile, the composer and context control should be reachable without horizontal overflow.
- Use a separate local SQLite database, synthetic agent and supervisor sessions, and existing fixture signers. Test denied routes and cross-agent access as well as successful actions. Keep a deterministic regression for switching cases during AI generation and for server refresh during an edit.
- Run focused checks at each completed slice. Verify the product build, type check, and CX Support suite at the final checkpoint. Browser checks on stubbed delivery show UI behavior. Live delivery evidence comes from the dedicated Telegram test channel when available.
