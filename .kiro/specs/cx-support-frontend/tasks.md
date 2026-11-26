# Implementation Plan for the CX Support frontend redesign

Implement the Photobook Care Studio design in the existing CX Support Tool. Start with the feature map, wire the redesigned workflows to the backend that already exists, and then add the frontend placeholders. Leave backend implementation of those placeholders for later specs.

Read [requirements.md](requirements.md), [design.md](design.md), and [AGENTS.md](../../../AGENTS.md) first. Use the original [CX Support implementation plan](../cx-support-tool/tasks.md) for historical context. Work in the root Next.js app. The Vite design reference at `photobook-care-studio/` is shared separately from GitHub.

## Phase 1 — Map and verify the existing application

- [x] 1. Confirm the feature map before changing the UI
  - Record the starting commit and worktree status. Ensure the implementing agent can open the downloaded reference folder. Review the inbox, supervisor desk, and AI Agent screens alongside the product routes and service code.
  - Verify each row in the [feature map](design.md#feature-map). For a feature with an existing backend, record the entry point, permissions, required inputs, and where its UI belongs. For a placeholder, record the missing capability in the [handoff table](design.md#placeholder-handoff). Update those tables only where the checkout differs.
  - Verify the current assignment rule before wiring it. The existing server permits agents to self-assign accessible cases and supervisors to assign active agents. Product behavior follows that contract in this redesign.
  - **Done when** every target screen has a recorded source or gap, and the checked-out files support the map. This is the first task for the implementation agent.
  - _Requirements: 1.1, 6.3_

- [x] 2. Isolate the reference app and record the product baseline
  - Depends on task 1. Check `tsconfig.json` and `vitest.config.ts`. The root type check currently includes the Vite reference and reports missing reference dependencies and an incompatible import. Root Vitest also discovers its `node:test` suite. Exclude the reference folder from the Next.js type check and scope Vitest discovery to CX Support's `tests/` tree. Preserve the existing X-Ray exclusion and Vitest aliases and options. If Tailwind scans the reference, exclude it in `app/globals.css`.
  - Run `npm test`, `npx tsc --noEmit --incremental false`, and `npm run build` from the root. Follow the [README](../../../README.md) with a temporary `DATABASE_URL`, test-only users and session secret, and a temporary `AI_SETTINGS_ENV_PATH` for settings tests. Keep provider and channel credentials scoped to the test run. Record environment blockers separately from compile or app failures. Baseline before isolation was 588 passing tests across 52 CX Support files with `npm test -- tests/`.
  - **Done when** product checks no longer discover reference sources or tests and the baseline results are recorded.
  - _Requirements: 1.3, 6.2_

## Phase 2 — Connect existing features to the new frontend

- [x] 3. Build the branded shell and verify one connected case
  - Depends on task 2. Read local Next.js docs under `node_modules/next/dist/docs/` and the project shadcn skill before UI changes. Use existing primitives and CSS tokens where possible.
  - Style `app/globals.css`, `app/(auth)/login/page.tsx`, and `app/(auth)/login/login-form.tsx` around the prototype's light Studio design. Update the product title and description in `app/layout.tsx`. Keep login validation and the existing server action.
  - Update `app/(app)/layout.tsx` with responsive navigation, authenticated profile and role, notifications, and logout. Keep `AppProvider` at the authenticated boundary. Link Inbox, Supervisor Desk at `/reports`, and Settings for the appropriate roles. Add AI Agent navigation with its protected route in task 10.
  - **Done when** an agent and a supervisor can sign in to the new shell, open one real synthetic conversation, and sign out. Verify agent role links and forbidden direct access in the same pass.
  - _Requirements: 1.2, 2.3, 6.1_

- [x] 4. Redesign the queue, thread, and mobile navigation
  - Depends on task 3. Update `app/(app)/inbox/page.tsx`, `inbox-filters.tsx`, `labels.ts`, and `[conversationId]/page.tsx`. Colocate shared queue and thread components under `app/(app)/inbox/` if needed. Reuse server query functions and authorized reads. Keep current URL filters and direct links, and expose `nextCursor` through a next-page link.
  - Use a prominent case identifier, short preview, customer, separate labeled color tag for the actual channel, and compact status or unread treatment. Render a neutral treatment for unknown visual variants. Apply the saved design feedback to the default density. Reserve unsupported order, urgency, and multiple-channel controls for task 9.
  - Show the queue and thread together on desktop and a single pane on mobile. Keep filters when opening or leaving a case. Show distinct empty and no-match states. Keep the latest messages reachable and preserve delivery states, attachment presence, and notification read behavior.
  - **Done when** a browser check opens authorized deep links, filters and pages the queue, returns to the same filters on mobile, and observes synthetic SSE updates in the queue and thread. Run `npm test -- tests/app/inbox-pages.test.tsx tests/api/conversations-routes.test.ts tests/events/bus.test.ts`.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 6.1_

- [x] 5. Restyle the composer and protect drafts across case switches
  - Depends on task 4. Update `components/compose/ComposeArea.tsx` and `RetryButton.tsx` as needed. Reuse send, suggestion, and canned-response helpers. Put the actual reply channel next to Send. Keep manual reply available and keep duplicate confirmation before retrying an unconfirmed send.
  - Scope in-memory drafts and in-flight work to the authenticated user and conversation. Reuse the authenticated provider or inbox layout for state shared across inbox navigation. Clear drafts on logout and when access is lost. Keep edits through SSE refresh, return to a case, and failed sends. Bind each request and completion to its originating case and preserve text typed after submission.
  - Add a targeted regression for delayed suggestions during a case switch. In the browser, also verify draft restoration, edits during SSE refresh, send failure, manual fallback, and canned autocomplete with a customer whose name is missing.
  - **Done when** a synthetic reply reaches the correct thread, no late request writes into another customer's composer, and Send and retry are reachable at 390 × 844. Run `npm test -- tests/app/send-reply.test.ts tests/app/suggest-reply.test.ts tests/app/canned-responses.test.ts tests/api/messages-route.test.ts tests/api/ai-suggest-route.test.ts`.
  - _Requirements: 2.3, 3.1, 3.2, 3.3, 6.1_

- [x] 6. Wire case ownership and lifecycle controls
  - Depends on task 5. Add controls beside the thread header and surface the real owner in the queue or header. Wire Claim and Assign to `POST /api/conversations/[id]/assign` with `agentId`. Read minimal active-agent options on the server for supervisors. Show friendly errors for unavailable agents, access loss, and resolved conflicts.
  - Wire Snooze, Resolve, and Reopen to `PATCH /api/conversations/[id]/status`. Use `toStatus`, optional `reason`, and epoch-millisecond `snoozedUntil` for a future local date and time. Offer only current permitted transitions. Use the Open status filter for the active queue and keep All, Snoozed, and Resolved available through the existing query contract.
  - **Done when** an agent claims an accessible case, a supervisor reassigns it, and the new owner receives a notification. Verify that snoozing and resolving remove cases from the active queue, assigning a resolved case still conflicts, and a synthetic inbound message reopens it. Run `npm test -- tests/api/assign-route.test.ts tests/api/conversations-routes.test.ts tests/api/notifications-route.test.ts tests/services/property-13-reopen-on-message.test.ts`.
  - _Requirements: 2.4, 3.4, 6.2_

- [ ] 7. Restyle team reports as the existing Supervisor Desk view
  - Depends on task 3. Update `app/(app)/reports/page.tsx` and `report-filters.tsx`. Keep `/reports` and its supervisor guard. Preserve open, queue, and snoozed totals, received and resolved counts, average response and resolution times, and the existing filters, breakdowns, and low-volume handling.
  - **Done when** the supervisor can change date, agent, platform, and channel filters, the summary updates through existing refresh behavior, and the same synthetic records reconcile with the inbox. Run `npm test -- tests/app/reports-page.test.tsx tests/api/reports-route.test.ts tests/services/property-15-report-totals.test.ts`.
  - _Requirements: 4.1, 6.2_

- [x] 8. Connect supervisor settings to current operations
  - Depends on task 3. Update `app/(app)/settings/page.tsx` and `ai-settings-form.tsx` to match the shell. Keep the existing provider action in `actions.ts`. Preserve server-side provider validation and write-only key handling. Label the form Reply Suggestion Provider.
  - Add a canned-response section under `app/(app)/settings/`. Use the existing list and CRUD endpoints. Display name, shortcode, and body. Handle duplicate shortcodes and confirm deletion. Verify the saved response can be found and inserted from the actual composer.
  - Add an auto-assignment section under `app/(app)/settings/` with the current rule and active-agent options when required. Add a supervisor-guarded form action that validates the choice and calls `configureAutoAssign`. Keep the existing `autoAssign` execution in the webhook service.
  - **Done when** supervisor updates persist through reload, unauthorized changes are rejected, an existing canned response is usable in the composer, and a synthetic new conversation follows a configured routing rule. Run `npm test -- tests/app/settings-page.test.tsx tests/api/ai-settings-route.test.ts tests/api/canned-responses-route.test.ts tests/services/property-08-round-robin.test.ts`.
  - _Requirements: 4.2, 4.3, 6.2_

## Phase 3 — Add placeholders for features to build later

- [x] 9. Add Case Context and Supervisor Desk placeholders
  - Depends on tasks 4–8. Add the collapsed Case Context drawer to the thread. Present real source channel, customer, status, and owner. Add lightweight unavailable sections for order and production details, photo previews, customer history and sentiment, and multi-channel links. Keep one accessible approval or action area for future reprints, holds, refunds, escalations, and overrides.
  - Add the Escalations view to `/reports`. Render approval queue and detail shells with unavailable states. Put future SLA, batch alerts, and CSAT in their relevant context. Keep those states visually distinct from the connected team totals. Avoid live-looking timers, example approvals, or synthetic customers in the product.
  - **Done when** the UI shows where each future workflow will live and its unavailable actions cause no state change or network mutation. Verify the drawer and the report tabs with keyboard and at phone width.
  - _Requirements: 5.1, 5.2, 5.5, 6.1_

- [x] 10. Build the supervisor AI Agent workspace
  - Depends on task 9. Add `app/(app)/ai-agent/page.tsx` and colocated view components as needed. Check the server session before rendering. Add role-appropriate navigation in `app/(app)/layout.tsx`. Use the local prototype's `AiAgentWorkspace.tsx` and the [handoff table](design.md#placeholder-handoff).
  - **Overview and Agent Config.** Show the metric cards and definitions in the design, period and channel affordances, and a link to the working reply-suggestion provider. Depict instructions, allowed channels and sources, handoff rules, pause, and draft/publish controls as unavailable. The pause control describes the future autonomous agent.
  - **Knowledge Base and Knowledge Gaps.** Show article list, editor and source preview states. Give Knowledge Gaps category filters and detail slots for frequency, examples, handoff reason, and linked cases. Depict draft, retrieval preview, publish, and validation without claiming an article answered a question.
  - **Customer Sentiment and Drift Detection.** Show trend and case-evidence areas with unknown or unavailable states. Give drift signals places for comparison windows, sample sizes, model and knowledge versions, and links to affected cases and gaps. Keep selected details coherent with the active filter or signal.
  - **Done when** supervisors can navigate and deep-link each view, agents are denied direct access, zero and unavailable are distinguishable, and no placeholder sends, saves, publishes, or changes the working suggestion provider.
  - _Requirements: 1.2, 5.3, 5.4, 5.5, 6.1_

## Phase 4 — Verify and hand off

- [x] 11. Verify the redesigned application and hand off backend gaps
  - Depends on task 10. Run `npm test`, `npx tsc --noEmit --incremental false`, and `npm run build` from the root. Use the isolated database and settings path from task 2. Run the app with synthetic users and messages using the fixtures and test signers documented in the [README](../../../README.md). Keep real customer data and secrets out of screenshots and logs.
  - Capture desktop and mobile browser evidence for login and role boundaries, queue search and navigation, real thread updates, reply and retry, case switch during AI suggestion, status and assignment, supervisor reports/settings, and placeholder navigation. Compare queue, thread, and reports against the same synthetic fixture.
  - If the dedicated Telegram test channel is available for use, verify inbound through visible reply delivery there. Record fixture and stub results separately from live delivery. Record missing channel or provider evidence explicitly.
  - Update the [placeholder handoff](design.md#placeholder-handoff) with the final frontend entry points and remaining backend inputs and decisions. Confirm fresh UI paths use existing auth/data contracts and no placeholder logic has entered a backend runtime path.
  - **Done when** the connected flow evidence, placeholder review, and checks are recorded here and every completed task is checked off with evidence.
  - _Requirements: 1.3, 6.1, 6.2, 6.3_

## Task 1 verification

Started at `b8411ec` on `main` with an existing unstaged `.gitignore` edit. Fetched `origin` and switched to `docs/cx-frontend-feature-map` from `origin/main`, which pointed to the same commit. The existing edit stayed in the worktree.

Opened the local reference sources under `photobook-care-studio/src/components/`. `AgentWorkspace.tsx` maps to the shell, inbox, thread, composer, and Case Context. `SupervisorDesk.tsx` maps to team reports and the planned Escalations view. `AiAgentWorkspace.tsx` maps to the planned AI Agent views. The product’s current provider, canned responses, and auto-assignment map to Settings.

| Area | Verification path |
| --- | --- |
| Login, shell, events, and notifications | Read the login action, authenticated layout, AppProvider, logout handler, and event and notification routes. See `tests/auth/`, `tests/events/bus.test.ts`, and `tests/api/notifications-route.test.ts`. |
| Inbox, composer, and case controls | Read the pages, compose helpers, conversation and assignment services, and conversation routes. See `tests/app/inbox-pages.test.tsx`, `tests/api/conversations-routes.test.ts`, `tests/api/messages-route.test.ts`, `tests/api/ai-suggest-route.test.ts`, `tests/api/assign-route.test.ts`, and `tests/services/property-13-reopen-on-message.test.ts`. |
| Reports and Settings | Read the supervisor pages and routes, provider settings action, canned-response handlers, and assignment service and webhook caller. See `tests/api/reports-route.test.ts`, `tests/services/property-15-report-totals.test.ts`, `tests/api/ai-settings-route.test.ts`, `tests/api/canned-responses-route.test.ts`, and `tests/services/property-08-round-robin.test.ts`. |
| Placeholders | Compared the reference controls with the product pages, API routes, services, and `lib/db/schema.ts`. The [handoff table](design.md#placeholder-handoff) records each planned location and missing capability. Message attachments are stored as a presence flag. AI suggestions produce drafts and request logs. Autonomous delivery, knowledge, sentiment, and drift data have no product source. |

`npm test -- tests/` passed 588 tests across 52 files with temporary database and AI settings paths. The evidence covers source inspection and local tests. Browser rendering and live delivery were outside this check.

## Task 2 verification

Ran the root checks on Node.js v22.22.3 with a temporary SQLite database and AI settings file, synthetic agent and supervisor users, a test session secret, and test provider and channel values.

| Check | Result |
| --- | --- |
| `npm test` | Passed all 588 tests across 52 files. `npx vitest list --filesOnly` returned the same product file set as `npx vitest list tests/ --filesOnly`. |
| `npx tsc --noEmit --incremental false` | Passed. Adding `--listFilesOnly` confirmed that the root program includes the app and excludes `photobook-care-studio/` and `photobook-xray-main/`. |
| Tailwind | Compiled `app/globals.css` through PostCSS. The Git-ignored reference contributed neither a source dependency nor its `w-[296px]` utility. |
| `npm run build` | The restricted run could not fetch Geist from Google Fonts. The network-enabled retry cleared the font error, then Turbopack could not bind its CSS worker port. |
| `npm run build -- --webpack` | Passed compilation, TypeScript, and page generation with network access. The default build script still uses Turbopack. |

This baseline covers discovery, local tests, and production compilation with webpack. Browser journeys and live channel delivery remain for later tasks.

## Task 3 verification

Chrome passed the agent and supervisor journeys at 1440 × 900 and 390 × 844 against the local production build. Both roles signed in, opened the same conversation ingested through a signed synthetic respond.io webhook, reached the reply composer, and signed out. The browser also verified keyboard focus and invalid-password feedback on sign-in.

Agents saw only Inbox in primary navigation. Direct requests to `/reports` and `/settings` redirected to Inbox, and the corresponding APIs returned 403. Supervisors opened both destinations from the shell. After logout, the case URL redirected to sign-in.

`npm test` passed 588 tests across 52 files. The TypeScript check and production webpack build passed. Chrome reported a 404 for the favicon, which is absent from the base branch. Live delivery was outside this check.

## Task 4 verification

Chrome passed the queue and thread journeys at 1440 × 900 and 390 × 844 with a temporary SQLite database. The queue applied search and channel filters, advanced the cursor, reset pagination after a filter change, and restored the search field on browser Back. The mobile thread returned to the same filters.

The agent could open an assigned case and had no access to another agent’s case. The supervisor could open both. Opening the assigned case cleared its notification. A signed synthetic respond.io webhook updated the selected queue preview and thread over SSE without a manual reload. The latest message and composer were reachable at both viewport sizes.

The three required test files passed all 35 tests. The full suite passed 591 tests across 52 files. `npx tsc --noEmit --incremental false` passed.

## Task 6 verification

Chrome verified Claim and Reassign with two agents and a supervisor on a temporary SQLite database. The new owner received an in-app notification. Selecting an agent who became inactive returned a friendly error.

At 390 × 844, Snooze saved the selected local time as epoch milliseconds and recorded the optional reason. Snoozed and resolved cases left the default Open queue at 1440 × 900. All, Snoozed, and Resolved could still find the matching case. Assigning a resolved case returned 409.

Reopen and a signed synthetic respond.io webhook each returned the case to Open. The thread and queue updated over SSE, and the report summary matched the same case throughout.

The four required suites passed 29 tests. The full suite passed 598 tests across 53 files, and `npx tsc --noEmit --incremental false` passed. Browser checks used the local development server and synthetic data.

## Task 8 verification

Chrome verified supervisor settings at 1440 × 900 and 390 × 844 on the local webpack build. Provider values, the fixed assignment rule, and an edited canned response persisted through reload. The API key field stayed empty after reload. Duplicate shortcodes returned a friendly error. Canceling deletion kept the response, and confirming deletion removed it through reload.

A signed synthetic Telegram webhook assigned a new conversation to the configured agent. The agent inserted the edited canned response in the mobile composer with the customer name substituted. Direct agent access to Settings redirected to Inbox. An agent write to the canned response endpoint returned 403. The settings action test also verified that agents cannot change routing.

The four focused suites passed 28 tests. The full suite passed 604 tests. TypeScript and the production webpack build passed. Browser verification used an isolated database and provider settings file. Live Telegram delivery and live AI provider calls were outside this check.

## Task 11 verification

Ran against `b7457b7` on `chore/cx-frontend-verification` with temporary SQLite and AI settings paths, synthetic accounts, and test provider values.

| Check | Result |
| --- | --- |
| `npm test` | Passed 614 tests across 54 files. |
| `npx tsc --noEmit --incremental false` | Passed. |
| `npm run build` | Turbopack could not bind its CSS worker port, including on the elevated retry. |
| `npm run build -- --webpack` | Passed. The resulting app started on loopback. |
| Production HTTP smoke | Both synthetic roles signed in. Agent requests to Reports, Settings, and AI Agent redirected to Inbox. A signed Telegram fixture appeared in the queue and thread. All six supervisor AI deep links rendered unavailable states. Reports, Escalations, Settings, and the reports API returned 200. |

PR #47 changed frontend pages, shared UI, and tests. Its diff contains no API route, adapter, service, or schema changes. The [placeholder handoff](design.md#placeholder-handoff) records the current entry points and remaining decisions.

The embedded browser host was unavailable. Native Chrome verified agent sign-in, opening the synthetic conversation, claiming it, expanding Case Context to read unavailable states, and redirecting an agent from /ai-agent to Inbox. Native Chrome also verified supervisor sign-in, Escalations, the Settings sections, the Knowledge Gaps deep link, and supervisor logout back to sign-in. Team Reports showed one open, zero queued, zero snoozed, one received, and zero resolved. These counts matched the single claimed inbox fixture. Desktop and mobile screenshots, report filter changes, and the remaining interactive workflows are pending. Task 7 and task 11 remain unchecked. The Telegram webhook status request failed, so live Telegram inbound and visible reply delivery remain unverified. No live AI provider call was verified.

Native Chrome also applied the Telegram report filter by keyboard. The URL retained `channel=telegram`, and the report showed one open, one received, and zero resolved. Inbox search found the fixture and preserved `search=Synthetic+QA` in the thread and its Back to inbox link. Resolving the case showed Resolved and offered Reopen. Reopening restored Open and returned the fixture to the filtered queue.

A Playwright script drove system Chrome against the same server and fixture. Agent A snoozed the case at 1440 × 900 with a reason. The thread showed Snoozed and Reopen, and the stored `snoozed_until` matched the chosen local time. The Open queue emptied without a reload. The Snoozed and All filters still found the case, and the history row kept the reason. Reopen returned the case to the Open queue. At 390 × 844 the supervisor reassigned the case to Agent B and back to Agent A, and the database owner changed each time. Agent B's notifications contained the case. Desktop and mobile screenshots of these steps stayed outside the repository.

The previous production server's test bot token was unrecoverable, so it was restarted on the same port and database with a synthetic token, session secret, and AI settings file. The AI endpoint pointed to a local stub that answers after 4.5 seconds. A signed synthetic Telegram webhook created a second case. No auto-assignment rule was set, so the database assigned that case to Agent A to put both cases in one queue.

| Flow | 1440 × 900 | 390 × 844 |
| --- | --- | --- |
| SSE | A signed webhook message appeared in the open thread without a reload. | Same. The hidden queue preview also updated. |
| Case switch during AI suggestion | After a full navigation and after queue navigation, the second case's composer stayed empty. The suggestion appeared in the first case's draft on return. | Same, using Back to inbox and the queue. |
| Reply and retry | The synthetic token made Telegram reject the send. The reply was stored and shown as Failed with Retry. Retry sent through the existing path and added another failed attempt. | Same. |

Successful delivery needs the live bot token, so the delivered and sent states remain unverified in the browser. While the agent viewed the first case, the queue still showed its unread count.

The supervisor report matched `/api/reports` for every filter at 1440 × 900 and 390 × 844. With no filter, 2 conversations were received and 0 resolved. Filtering to Agent A or to Telegram gave the same totals, because Agent A owns both fixture cases and both arrived through Telegram. Agent B, WhatsApp, and a date range that ends yesterday each showed zero. At 390 × 844 the breakdown tables scroll inside their own containers, and the page stays 390 pixels wide.

Settings saves were checked at 390 × 844. A new model name persisted through reload. The API key field stayed empty, and the stored key was unchanged. The model name was then restored for the AI stub. A routing rule that assigns new cases to Agent B persisted through reload, and the next signed Telegram case was assigned to Agent B. A canned response was created, survived reload, and was removed after the delete confirmation.

Live Telegram was then checked by restarting the server with the bot token from `.env.local`. The other settings stayed synthetic, and `npm run telegram:poll` forwarded updates to it. The owner sent the bot a private message from a phone. It arrived as a new Telegram case, the Agent B routing rule assigned it, and Agent B saw it in the inbox and thread. Agent B replied from the thread at 1440 × 900. Telegram accepted the send, and the thread showed the reply as Sent. The first run of the reply check wrongly passed because the owner's message matched the reply text. The fixed check matches only outbound messages.

The Sent state comes from Telegram's API. The owner confirmed that the reply appeared in the Telegram chat one minute after the inbound message. The app has no separate Delivered signal for Telegram. Live AI provider calls remain unverified.
