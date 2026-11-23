# Implementation Plan: CX Support Tool

## Overview

Build the CX Support Tool as a tracer-bullet sequence: lay the data foundation first, then authentication, then one working path from webhook ingestion through inbox display, then expand layer by layer with replies, real-time updates, assignment, canned responses, AI suggestions, and supervisor features. Each task ends with a verifiable unit of running code.

**Language / stack:** TypeScript, Next.js 16 App Router, Drizzle ORM + better-sqlite3, Jose (JWT), fast-check (property tests).

> **Note:** Next.js 16 deprecates `middleware.ts`. Use `proxy.ts` at the project root with the named export `proxy` (not `middleware`). Run the codemod `npx @next/codemod@canary middleware-to-proxy .` if migrating existing files.

---

## Tasks

- [x] 1. Install dependencies and set up project foundation
  - Add `better-sqlite3`, `drizzle-orm`, `drizzle-kit`, `bcryptjs`, `jose`, `uuid` to `dependencies` in `package.json`
  - Add `@types/better-sqlite3`, `@types/bcryptjs`, `fast-check`, `vitest`, `@vitejs/plugin-react` to `devDependencies`
  - Create `vitest.config.ts` configured for the project root with path aliases matching `tsconfig.json`
  - Create `tsconfig.json` path aliases: `@/lib/*`, `@/app/*`, `@/components/*`
  - Create `.env.example` documenting all required environment variables (`DATABASE_URL`, `SESSION_SECRET`, `ZAAPI_API_KEY`, `ZAAPI_WEBHOOK_SECRET`, `RESPOND_IO_API_KEY`, `RESPOND_IO_WEBHOOK_SECRET`, `AI_ENDPOINT_URL`, `AI_MODEL_NAME`, `AI_API_KEY`) with placeholder values — no real secrets
  - _Requirements: 2.1, 3.1, 9.5, 10.1, 12.2_

- [x] 2. Define database schema and run initial migration
  - [x] 2.1 Create `lib/db/schema.ts` with all Drizzle table definitions
    - Define tables: `users`, `platformConfigs`, `conversations`, `messages`, `conversationHistory`, `notifications`, `cannedResponses`, `assignmentRules`, `roundRobinState`, `webhookLog`, `aiRequestLog` exactly as specified in the design data model section
    - Export each table definition and a combined `schema` object for Drizzle
    - _Requirements: 1.4, 2.5, 3.5, 4.1, 6.1, 7.1, 7.4, 8.1, 9.1, 12.10_

  - [x] 2.2 Create `lib/db/index.ts` with the Drizzle client singleton
    - Instantiate `better-sqlite3` with the path from `DATABASE_URL` env var (default `./cx_tool.db`)
    - Export a `db` singleton using `drizzle(sqlite, { schema })`
    - Export a `runMigrations()` helper that calls `drizzle-kit`'s migration runner against `lib/db/migrations/`
    - _Requirements: 11.3_

  - [x] 2.3 Generate and apply the initial Drizzle migration
    - Configure `drizzle.config.ts` pointing to `lib/db/schema.ts` and outputting to `lib/db/migrations/`
    - Run `npx drizzle-kit generate` to produce the first migration SQL file
    - Verify the migration applies cleanly against a local test database
    - _Requirements: 1.4, 7.4_

  - [x] 2.4 Write unit tests for schema integrity
    - Confirm all table names, column names, and types match the design spec
    - Confirm `UNIQUE(externalId, platform)` constraint exists on `conversations`
    - Confirm `UNIQUE(externalId, conversationId)` constraint exists on `messages`
    - _Requirements: 2.5, 3.5_

- [x] 3. Implement auth layer (session, passwords, proxy)
  - [x] 3.1 Create `lib/auth/passwords.ts`
    - Wrap `bcryptjs.hash` at cost factor 12 and `bcryptjs.compare` in typed async functions
    - _Requirements: 9.5_

  - [x] 3.2 Create `lib/auth/session.ts`
    - Implement `createSession(userId, role)`: signs a JWT with `jose` using `SESSION_SECRET`, 8-hour expiry, returns a serialized cookie string
    - Implement `getSession(request)`: reads the `session` HttpOnly cookie, verifies and decodes the JWT, returns `{ userId, role }` or `null`
    - Implement `deleteSession()`: returns a cookie string with `maxAge=0`
    - _Requirements: 9.1, 9.6_

  - [x] 3.3 Create `proxy.ts` at the project root (Next.js 16 convention)
    - Export a named `proxy` function (not `middleware`) matching `NextProxy` type
    - On every request not matching `/(api/webhooks|_next|favicon)`, read and verify the JWT from the cookie
    - Attach `x-auth-user` header (JSON `{ userId, role }`) on success; redirect to `/login` on page routes or return 401 on API routes when session is absent or expired
    - Slide the session expiry by writing a refreshed cookie on each successful validation
    - Use a `config.matcher` that excludes `/api/webhooks/:path*`, `/_next/static`, `/_next/image`
    - _Requirements: 9.1, 9.6, 10.4_

  - [x] 3.4 Write unit tests for auth utilities
    - `createSession` / `getSession` round-trip with valid and expired tokens
    - `getSession` returns `null` for tampered tokens
    - `passwords.ts` hash/compare symmetry and negative case
    - _Requirements: 9.5, 9.6_

- [x] 4. Build login API route and login page (tracer-bullet auth flow)
  - [x] 4.1 Create `app/api/auth/login/route.ts`
    - `POST`: parse `{ username, password }` from JSON body; query `users` table; call `passwords.verify`; on success call `createSession` and set the cookie; return 200 with `{ userId, role }`; on failure return 401
    - _Requirements: 9.1_

  - [x] 4.2 Create `app/api/auth/logout/route.ts`
    - `POST`: call `deleteSession()`, return 200
    - _Requirements: 9.1_

  - [x] 4.3 Create the login page at `app/(auth)/login/page.tsx`
    - Server Component that renders a login form; form uses a Server Action (`'use server'`) to call the login logic and redirect on success
    - Display validation errors inline; never expose stack traces
    - _Requirements: 9.1_

  - [x] 4.4 Seed one supervisor and one agent user via a `scripts/seed-users.ts` script
    - Accepts `--username`, `--password`, `--role` flags; hashes the password and inserts into `users`; never commits credentials
    - _Requirements: 9.1, 9.5_

- [x] 5. Checkpoint — Verify auth tracer bullet
  - Ensure migration runs, the seed script creates users, login sets a cookie, proxy redirects unauthenticated requests to `/login`, and logout clears the cookie.
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement adapter types and Zaapi adapter
  - [x] 6.1 Create `lib/adapters/types.ts`
    - Define and export `IncomingMessage`, `OutboundReply`, `SendResult`, `WebhookVerificationResult`, and `PlatformAdapter` interfaces exactly as specified in the design
    - _Requirements: 2.5, 2.6, 3.5, 3.6_

  - [x] 6.2 Create `lib/adapters/zaapi.ts` implementing `PlatformAdapter`
    - `verifyWebhook(req)`: read HMAC signature from request header; compute HMAC-SHA256 over raw body using `ZAAPI_WEBHOOK_SECRET`; return `{ valid, rawPayload }`
    - `parseWebhook(rawPayload)`: parse Zaapi JSON envelope; map to `IncomingMessage[]`; set `platform: 'zaapi'`; never fetch attachment URLs
    - `sendReply(reply)`: call Zaapi REST API with `ZAAPI_API_KEY` from env; return `SendResult`; timeout after 30 s
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 10.3, 10.5_

  - [x] 6.3 Write unit tests for `zaapi.ts`
    - `verifyWebhook` returns `valid: true` for a correctly signed payload and `valid: false` for a tampered one
    - `parseWebhook` maps known fixture JSON to the expected `IncomingMessage` shape with `platform: 'zaapi'`
    - `sendReply` with a mocked HTTP client returns `{ status: 'sent' }` on 200 and `{ status: 'failed' }` on 4xx/5xx
    - _Requirements: 2.1–2.6, 10.5_

- [x] 7. Implement respond.io adapter
  - [x] 7.1 Create `lib/adapters/respond-io.ts` implementing `PlatformAdapter`
    - Mirror the Zaapi adapter structure; use `RESPOND_IO_API_KEY` and `RESPOND_IO_WEBHOOK_SECRET`; set `platform: 'respond_io'`
    - _Requirements: 3.1–3.6, 10.3, 10.5_

  - [x] 7.2 Write unit tests for `respond-io.ts`
    - Same pattern as Zaapi adapter tests: signature verification, payload parsing, send with mock HTTP
    - _Requirements: 3.1–3.6, 10.5_

- [x] 8. Implement core services — conversation and message
  - [x] 8.1 Create `lib/services/conversation.ts`
    - `ingest(messages: IncomingMessage[])`: upsert conversation (keyed on `externalId + platform`); insert new messages; update `unreadCount`, `lastMessageAt`, `lastMessagePreview`; reopen resolved/snoozed conversations on inbound message (transition to `open`, write `conversationHistory` row); emit SSE event after each write
    - `getConversations(filters, session)`: query with index-backed filters (`status`, `assignedAgentId`, `platform`, `channel`); apply agent ownership restriction (agents see only their own or unassigned); cursor-paginate on `lastMessageAt DESC`
    - `getConversation(id, session)`: return conversation + messages in `sentAt ASC` order; enforce ownership
    - `changeStatus(id, toStatus, session, reason?, snoozedUntil?)`: validate transition; update `conversations`; write `conversationHistory`; emit SSE event
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.7, 2.2, 3.2, 7.1, 7.2, 7.3, 7.4, 7.5, 10.4_

  - [x] 8.2 Create `lib/services/message.ts`
    - `storeOutbound(conversationId, body, session)`: insert message with `status: 'pending'`; emit SSE event
    - `updateMessageStatus(messageId, status, externalId?)`: update message; emit SSE event
    - _Requirements: 5.2, 5.3, 5.4_

  - [x] 8.3 Write property test — Property 4: message thread chronological order
    - **Property 4: Message thread is in chronological order**
    - **Validates: Requirements 1.7**
    - Generate arbitrarily ordered message arrays; call `getConversation` with a seeded DB; assert `sentAt` values are non-decreasing
    - _Requirements: 1.7_

  - [x] 8.4 Write property test — Property 2: inbox filter returns only matching conversations
    - **Property 2: Inbox filter returns only matching conversations**
    - **Validates: Requirements 1.5**
    - Generate arbitrary conversation arrays and filter combinations; assert all returned items satisfy every applied filter and no qualifying conversation is omitted
    - _Requirements: 1.5_

  - [x] 8.5 Write property test — Property 3: inbox search returns only matching conversations
    - **Property 3: Inbox search returns only matching conversations**
    - **Validates: Requirements 1.6**
    - Generate arbitrary conversations and query strings; assert all results contain the query in name, identifier, or preview (case-insensitive)
    - _Requirements: 1.6_

  - [x] 8.6 Write property test — Property 9: resolved conversations absent from queue
    - **Property 9: Resolved conversations are absent from the queue**
    - **Validates: Requirements 4.7, 7.1**
    - Transition conversations to `resolved`; assert queue query returns none of them
    - _Requirements: 4.7, 7.1_

  - [x]* 8.7 Write property test — Property 12: snoozed conversation hidden before expiry
    - **Property 12: Snoozed conversation is hidden before snooze expiry**
    - **Validates: Requirements 7.2**
    - Generate future and past snooze times; assert inbox query at `t < T` omits the conversation and at `t ≥ T` returns it as `open`
    - _Requirements: 7.2_

  - [x]* 8.8 Write property test — Property 13: new message reopens resolved/snoozed
    - **Property 13: New message reopens resolved or snoozed conversation**
    - **Validates: Requirements 7.3**
    - Generate conversations with `resolved` or `snoozed` status; call `ingest` with an inbound message; assert status is `open`
    - _Requirements: 7.3_

  - [x]* 8.9 Write property test — Property 14: every status transition recorded in history
    - **Property 14: Every status transition is recorded in history**
    - **Validates: Requirements 7.4**
    - Generate N sequential status transitions; assert `conversationHistory` contains at least N rows for that conversation
    - _Requirements: 7.4_

- [x] 9. Implement SSE event bus and /api/events route
  - [x] 9.1 Create `lib/events/types.ts`
    - Define and export `SSEEventType` union and `SSEEvent` interface as specified in the design
    - _Requirements: 1.2, 11.2_

  - [x] 9.2 Create `lib/events/bus.ts`
    - In-process `Map<clientId, { controller, userId, role }>` bus
    - Implement `addClient`, `removeClient`, `emit(event, visibleToUserId?)` — supervisors receive all events; agents receive only events for accessible conversations
    - _Requirements: 1.2, 9.3, 11.2_

  - [x] 9.3 Create `app/api/events/route.ts`
    - `GET`: verify session via `getSession`; return 401 if absent
    - Return a `ReadableStream` response with `Content-Type: text/event-stream`
    - Register controller with `addClient`; send 30-second keepalive comments; remove on stream close
    - _Requirements: 1.2, 11.2_

  - [x]* 9.4 Write unit tests for the SSE bus
    - `emit` delivers to supervisors for all events
    - `emit` delivers to agents only for events matching their accessible conversations
    - `removeClient` stops delivery to that client
    - _Requirements: 1.2, 9.3_

- [x] 10. Build webhook ingestion routes
  - [x] 10.1 Create `app/api/webhooks/zaapi/route.ts`
    - `POST`: immediately write `webhookLog` entry (timestamp, platform, `verified: false`)
    - Call `ZaapiAdapter.verifyWebhook(req)`; on failure update log (`verified: false, rejected`), return 401 — no payload stored
    - On success call `ZaapiAdapter.parseWebhook`, then `ConversationSvc.ingest`; update log (`verified: true, processed`); return 200
    - On processing error update log (`failed`); return 500
    - _Requirements: 2.2, 10.5, 11.4_

  - [x] 10.2 Create `app/api/webhooks/respond-io/route.ts`
    - Mirror the Zaapi webhook route using `RespondAdapter`
    - _Requirements: 3.2, 10.5, 11.4_

  - [x]* 10.3 Write integration test for webhook ingestion
    - Mock Zaapi HMAC signature; call the route handler with a fixture payload; assert DB state (conversation + message inserted) and SSE event emitted
    - Call with an invalid signature; assert 401, no DB row, no SSE event
    - Mirror for respond.io
    - _Requirements: 2.2, 3.2, 10.5_

  - [x]* 10.4 Write property test — Property 18: invalid webhook signatures always rejected
    - **Property 18: Invalid webhook signatures are always rejected**
    - **Validates: Requirements 10.5**
    - Generate arbitrary payloads with mismatched signatures; assert all return 401 and nothing is persisted
    - _Requirements: 10.5_

- [x] 11. Checkpoint — Verify webhook-to-inbox tracer bullet
  - Post a fixture webhook to `/api/webhooks/zaapi`; confirm the conversation appears in the DB and the SSE bus emits the event.
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Build conversations API routes
  - [x] 12.1 Create `app/api/conversations/route.ts`
    - `GET`: parse query params (`platform`, `channel`, `status`, `assignedTo`, `search`, `page`); delegate to `ConversationSvc.getConversations`; return paginated JSON
    - Agents see only their conversations or unassigned; supervisors see all (enforced inside `getConversations`)
    - _Requirements: 1.1, 1.4, 1.5, 1.6, 9.3, 9.4_

  - [x] 12.2 Create `app/api/conversations/[id]/route.ts`
    - `GET`: delegate to `ConversationSvc.getConversation`; return conversation + messages; enforce ownership (return 403 if agent tries to read another agent's conversation)
    - _Requirements: 1.7, 10.4_

  - [x] 12.3 Create `app/api/conversations/[id]/status/route.ts`
    - `PATCH`: parse `{ toStatus, reason?, snoozedUntil? }`; call `ConversationSvc.changeStatus`; return updated conversation
    - _Requirements: 7.1, 7.2, 7.4, 7.5_

  - [x]* 12.4 Write property test — Property 17: agent cannot read another agent's conversations
    - **Property 17: Agent cannot read another agent's conversations**
    - **Validates: Requirements 10.4**
    - Generate pairs of agents and conversations assigned to one of them; call the detail endpoint as the other agent; assert 403 or 404, never the conversation data
    - _Requirements: 10.4_

  - [x]* 12.5 Write property test — Property 1: inbox items contain all required fields
    - **Property 1: Inbox items contain all required fields**
    - **Validates: Requirements 1.4**
    - Generate arbitrary conversations; call the list endpoint; assert every returned item has `customerName` or `customerIdentifier`, `channel`, `platform`, `lastMessageAt`, and `lastMessagePreview`
    - _Requirements: 1.4_

- [x] 13. Build reply send route and messages API
  - [x] 13.1 Create `app/api/conversations/[id]/messages/route.ts`
    - `POST`: read session; read conversation (enforce ownership); call `MessageSvc.storeOutbound`; return 202
    - After response: call platform adapter `sendReply`; call `MessageSvc.updateMessageStatus` with result (`sent` or `failed`); emit SSE event
    - On timeout (30 s), network error, or HTTP 5xx: mark `unconfirmed`; a resend of the same body needs `confirmResend: true`, else 409
    - _Requirements: 5.2, 5.3, 5.4, 2.3, 2.4, 3.3, 3.4_

  - [x]* 13.2 Write integration tests for message send
    - Mock platform adapter returning success; assert message status transitions `pending → sent` and SSE event emitted
    - Mock adapter returning failure; assert `failed` status and inline error returned
    - Mock adapter timing out; assert `failed` status
    - _Requirements: 5.2–5.4_

- [x] 14. Build inbox UI — unified inbox page
  - [x] 14.1 Create the protected app layout at `app/(app)/layout.tsx`
    - Server Component; establishes sidebar, top nav, and SSE connection bootstrap
    - Passes session context to child pages via a React context provider (Client Component)
    - _Requirements: 1.1, 9.3_

  - [x] 14.2 Create the inbox page at `app/(app)/inbox/page.tsx`
    - Server Component; fetches initial conversations via `ConversationSvc.getConversations`
    - Renders conversation list with unread indicator, platform badge, channel badge, preview, and timestamp (all fields from Requirement 1.4)
    - Filter bar (platform, channel, assignment status, conversation status) and search box as Client Components
    - On SSE `conversation.updated` / `message.created` events, re-fetch and merge the updated conversation into the list
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6_

  - [x] 14.3 Create the conversation thread page at `app/(app)/inbox/[conversationId]/page.tsx`
    - Server Component; fetches messages from `ConversationSvc.getConversation`; renders in `sentAt ASC` order
    - Shows pending/sent/failed delivery status per message
    - _Requirements: 1.7, 5.3_

  - [x]* 14.4 Write snapshot tests for inbox and thread pages
    - Render both pages with seeded conversation data; assert expected elements are present (conversation items, channel labels, message order)
    - _Requirements: 1.4, 1.7_

- [x] 15. Build compose area and reply UI
  - [x] 15.1 Create `components/compose/ComposeArea.tsx` (Client Component)
    - Text area, send button, canned response trigger (`/` prefix), pending state while send is in progress
    - The canned response `/` picker lands in 21.3, once the canned response API from task 21 exists
    - Calls `POST /api/conversations/[id]/messages`; shows pending indicator then updates to sent/failed
    - Renders clear error on failure with retry action
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 15.2 Integrate `ComposeArea` into the conversation thread page
    - Wire up the composed reply to the message send route; update the thread on SSE `message.created` event
    - _Requirements: 5.1, 5.2_

- [x] 16. Implement redaction service
  - [x] 16.1 Create `lib/services/redaction.ts`
    - Implement pure `redact(text: string): string` applying patterns in order: email → `[EMAIL]`, Malaysian/SG phone → `[PHONE]`, Photobook order number → `[ORDER]`, street address / postcode → `[ADDRESS]`, customer name (escaped) → `[NAME]`
    - _Requirements: 12.6_

  - [x]* 16.2 Write unit tests for `redaction.ts`
    - Fixture for each PII type, mixed input with multiple types, and a string containing no PII (must return unchanged)
    - _Requirements: 12.6_

  - [x]* 16.3 Write property test — Property 19: PII redaction removes all recognised patterns
    - **Property 19: PII redaction removes all recognised patterns**
    - **Validates: Requirements 12.6**
    - Generate strings containing one or more recognised PII tokens (email, phone, order, name); assert no original PII token survives and each replaced position contains the appropriate label
    - _Requirements: 12.6_

- [x] 17. Implement AI adapter and suggestion route
  - [x] 17.1 Create `lib/adapters/ai.ts` implementing `AIAdapter`
    - `suggest(req: AISuggestionRequest)`: POST to `endpointUrl/v1/chat/completions`; 10-second timeout; return `{ suggestion }` on success or `{ suggestion: null, errorMessage }` on timeout/error
    - Import `redact` from `lib/services/redaction.ts` and enforce redaction before assembling the request body
    - Write to `aiRequestLog` (timestamp, model, conversationId — no PII)
    - _Requirements: 12.3, 12.6, 12.7, 12.8, 12.10_

  - [x] 17.2 Create `app/api/conversations/[id]/ai-suggest/route.ts`
    - `POST`: verify session; read AI config from env; return 404 if no endpoint configured; call `ConversationSvc.getThread`; call `AIAdapter.suggest`; return suggestion as JSON
    - _Requirements: 12.1, 12.4, 12.5, 12.7, 12.9_

  - [x] 17.3 Add "Suggest reply" button to `ComposeArea`
    - Only shown when `AI_ENDPOINT_URL` env var is set (passed from Server Component as a prop); calls `/api/conversations/[id]/ai-suggest`; inserts suggestion as editable draft text; shows inline error on failure without blocking compose area
    - _Requirements: 12.4, 12.5, 12.7, 12.9_

  - [x]* 17.4 Write integration tests for AI suggestion
    - Mock AI endpoint returning a suggestion; assert redaction was applied and compose draft populated
    - Mock endpoint timeout; assert inline error shown and compose area remains accessible
    - Mock missing endpoint config; assert button is hidden
    - _Requirements: 12.4–12.9_

- [x] 18. Checkpoint — Verify reply and AI suggestion flows
  - Confirm a full reply round-trip (compose → send → SSE update) and AI suggestion (request → redacted prompt → draft inserted) both work end-to-end with synthetic fixtures.
  - Ensure all tests pass, ask the user if questions arise.

- [x] 19. Implement conversation assignment service and routes
  - [x] 19.1 Create `lib/services/assignment.ts`
    - `assign(conversationId, agentId, assignedBy, session)`: update `conversations.assignedAgentId`; write `conversationHistory`; create notification for new assignee; emit SSE `conversation.assigned` event
    - `configureAutoAssign(strategy, manualAgentId?, updatedBy)`: upsert `assignmentRules`
    - `autoAssign(conversationId)`: read active rule; if `round_robin`, read and advance `roundRobinState`; if `manual`, use the configured agent; call `assign`
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 4.6, 4.7_

  - [x] 19.2 Create `app/api/conversations/[id]/assign/route.ts`
    - `POST`: parse `{ agentId }`; supervisors can assign any conversation; agents can self-assign unassigned conversations; call `AssignmentSvc.assign`
    - _Requirements: 4.1, 4.4, 9.4_

  - [x]* 19.3 Write property test — Property 5: assigned conversation reflects assigned agent
    - **Property 5: Assigned conversation reflects assigned agent**
    - **Validates: Requirements 4.1, 4.4**
    - For any open conversation and any active agent, after executing `assign`, assert `assignedAgentId` equals the agent's ID
    - _Requirements: 4.1, 4.4_

  - [x]* 19.4 Write property test — Property 6: assignment produces notification for assignee
    - **Property 6: Assignment produces a notification for the assignee**
    - **Validates: Requirements 4.2**
    - After every `assign` call where the new assignee differs from the previous one, assert a notification row exists with `userId = newAssigneeId` and `type = 'assigned'`
    - _Requirements: 4.2_

  - [x]* 19.5 Write property test — Property 7: unassigned conversations appear in queue
    - **Property 7: Unassigned conversations appear in queue**
    - **Validates: Requirements 4.5**
    - For any conversation with `assignedAgentId = null` and `status = 'open'`, assert the queue query includes it
    - _Requirements: 4.5_

  - [x]* 19.6 Write property test — Property 8: round-robin distributes conversations evenly
    - **Property 8: Round-robin assignment distributes conversations evenly**
    - **Validates: Requirements 4.6**
    - Generate N agents (1–20) and M calls (1–100); assert no agent receives more than ⌈M/N⌉ assignments
    - _Requirements: 4.6_

- [x] 20. Build notifications API route
  - [x] 20.1 Create `app/api/notifications/route.ts`
    - `GET`: return unread notifications for the authenticated user
    - `PATCH`: mark one or all notifications as read (`{ ids: string[] | 'all' }`)
    - _Requirements: 4.2_

  - [x] 20.2 Add notification badge to the app layout
    - Client Component; polls `GET /api/notifications` on mount and on SSE `notification.created` event; shows unread count badge
    - _Requirements: 4.2_

- [x] 21. Implement canned responses
  - [x] 21.1 Create `lib/services/canned-response.ts`
    - `searchByPrefix(prefix)`: return responses whose `shortcode` starts with `prefix` (case-insensitive)
    - `substitutePlaceholder(body, customerName)`: replace all occurrences of `{{customer_name}}` with the display name
    - CRUD functions: `create`, `update`, `delete`, `list` — all require supervisor role
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 21.2 Create canned response API routes under `app/api/canned-responses/`
    - `GET /api/canned-responses` — list; `POST` — create (supervisor)
    - `PUT /api/canned-responses/[id]` — update (supervisor); `DELETE` — delete (supervisor)
    - _Requirements: 6.2_

  - [x] 21.3 Add canned response picker to `ComposeArea`
    - Detect `/` prefix in the compose text; call `GET /api/canned-responses?prefix=…`; render dropdown; on selection insert substituted body text, replacing `{{customer_name}}` with current conversation's customer name
    - _Requirements: 6.3, 6.4, 6.5_

  - [x]* 21.4 Write unit tests for canned response service
    - `searchByPrefix`: prefix match, case-insensitive match, no match, empty prefix
    - `substitutePlaceholder`: single occurrence, multiple occurrences, no token present (body unchanged)
    - _Requirements: 6.3, 6.5_

  - [x]* 21.5 Write property test — Property 10: canned response shortcode filter returns exact prefix matches
    - **Property 10: Canned response shortcode filter returns exact prefix matches**
    - **Validates: Requirements 6.3**
    - Generate arbitrary shortcode prefixes and canned response libraries; assert the filtered result contains exactly those responses whose shortcode starts with the prefix (case-insensitive) and no others
    - _Requirements: 6.3_

  - [x]* 21.6 Write property test — Property 11: canned response placeholder substitution removes the token
    - **Property 11: Canned response placeholder substitution removes the token**
    - **Validates: Requirements 6.5**
    - Generate arbitrary body strings containing `{{customer_name}}` and arbitrary customer names; assert no literal `{{customer_name}}` remains after substitution
    - _Requirements: 6.5_

- [x] 22. Implement supervisor reports
  - [x] 22.1 Create `lib/services/report.ts`
    - `getMetrics(from, to, filters)`: aggregate queries over `conversations` and `conversationHistory`
    - Compute: total received (conversations created in range), total resolved (status = `resolved`), average first-response time (first agent message after first inbound), average resolution time (creation to resolved timestamp), counts of open / queue / snoozed
    - Support breakdown by `agentId`, `channel`, `platform`; show low-volume indicator when `resolvedCount < 10`
    - Use UTC+8 (Malaysia time) for ISO-week date boundaries
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 22.2 Create `app/api/reports/route.ts`
    - `GET`: verify `role === 'supervisor'`; return 403 otherwise; parse `from`, `to`, `agentId`, `channel`, `platform` query params; delegate to `ReportSvc.getMetrics`
    - _Requirements: 8.1, 8.2, 8.3, 9.4_

  - [x] 22.3 Create the reports page at `app/(app)/reports/page.tsx`
    - Server Component (supervisor-only; redirect to inbox if agent); render metric cards; date range picker and filter selects as Client Components; live summary (open/queue/snoozed counts) updates on SSE events
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x]* 22.4 Write property test — Property 15: report totals match underlying data
    - **Property 15: Report totals match the underlying data**
    - **Validates: Requirements 8.1**
    - Generate arbitrary conversation sets with various `createdAt` values and statuses; call `getMetrics`; assert reported totals equal the counts computed directly from the generated data
    - _Requirements: 8.1_

  - [x]* 22.5 Write unit tests for report aggregation edge cases
    - Date boundaries (start-of-day, end-of-day in UTC+8), empty range, single-conversation range, low-volume indicator threshold
    - _Requirements: 8.3, 8.5_

- [ ] 23. Implement AI and settings pages
  - [ ] 23.1 Create `app/api/settings/ai/route.ts`
    - `GET`/`PUT`: supervisor-only; read and write AI endpoint config to env-backed storage (write to a local `.env.local` file that is gitignored); return 403 for agents
    - _Requirements: 12.1, 12.2, 9.4_

  - [ ] 23.2 Create the settings page at `app/(app)/settings/page.tsx`
    - Server Component (supervisor-only); form for AI endpoint URL, model name, and API key; masked input for API key; save via Server Action; show saved state confirmation
    - _Requirements: 12.1, 12.2_

- [ ] 24. Enforce role-based access control at the API layer
  - [ ] 24.1 Add role guards to all supervisor-only routes
    - Routes: `/api/reports`, `/api/settings/ai`, `/api/canned-responses` (write operations), `/api/conversations/[id]/assign` (supervisor reassignment)
    - Each handler reads `x-auth-user` header; returns 403 if `role !== 'supervisor'` for guarded operations
    - _Requirements: 9.3, 9.4_

  - [ ]* 24.2 Write property test — Property 16: agent role cannot access supervisor-only endpoints
    - **Property 16: Agent role cannot access supervisor-only endpoints**
    - **Validates: Requirements 9.3, 9.4**
    - Generate valid agent sessions and supervisor-only route strings; assert all responses have HTTP status 403
    - _Requirements: 9.3, 9.4_

- [ ] 25. Final checkpoint — full end-to-end verification
  - Confirm all property and unit tests pass with `npx vitest --run`
  - Confirm migration applies cleanly, seed script runs, login/logout work, inbox lists conversations, reply send updates thread, AI suggestion inserts draft, assignment notifies agent, reports render correct totals, all 403 guards hold
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints validate the working path end-to-end before the next layer is built
- Property tests use **fast-check** v3+ with 100 iterations per property; tag each test with the design property number (e.g., `// Feature: cx-support-tool, Property 2: ...`)
- **Next.js 16 breaking change:** use `proxy.ts` (not `middleware.ts`) with the named export `proxy`; run `npx @next/codemod@canary middleware-to-proxy .` if migrating
- Raw chats, contacts, and the SQLite database file must remain off Git (`.gitignore` entries: `*.db`, `*.db-shm`, `*.db-wal`, `.env.local`)
- Never fetch platform attachment URLs server-side; pass them directly to `<img src>` in the browser

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2"] },
    { "id": 3, "tasks": ["2.3", "3.1", "3.2"] },
    { "id": 4, "tasks": ["2.4", "3.3"] },
    { "id": 5, "tasks": ["3.4", "4.1", "4.2", "4.3"] },
    { "id": 6, "tasks": ["4.4"] },
    { "id": 7, "tasks": ["5"] },
    { "id": 8, "tasks": ["6.1"] },
    { "id": 9, "tasks": ["6.2", "7.1"] },
    { "id": 10, "tasks": ["6.3", "7.2"] },
    { "id": 11, "tasks": ["8.1", "9.1"] },
    { "id": 12, "tasks": ["8.2", "9.2"] },
    { "id": 13, "tasks": ["8.3", "8.4", "8.5", "8.6", "8.7", "8.8", "8.9", "9.3"] },
    { "id": 14, "tasks": ["9.4", "10.1", "10.2"] },
    { "id": 15, "tasks": ["10.3", "10.4"] },
    { "id": 16, "tasks": ["11"] },
    { "id": 17, "tasks": ["12.1", "12.2", "12.3"] },
    { "id": 18, "tasks": ["12.4", "12.5", "13.1"] },
    { "id": 19, "tasks": ["13.2"] },
    { "id": 20, "tasks": ["14.1"] },
    { "id": 21, "tasks": ["14.2", "14.3"] },
    { "id": 22, "tasks": ["14.4", "15.1"] },
    { "id": 23, "tasks": ["15.2"] },
    { "id": 24, "tasks": ["16.1"] },
    { "id": 25, "tasks": ["16.2", "16.3"] },
    { "id": 26, "tasks": ["17.1"] },
    { "id": 27, "tasks": ["17.2"] },
    { "id": 28, "tasks": ["17.3"] },
    { "id": 29, "tasks": ["17.4", "18"] },
    { "id": 30, "tasks": ["19.1"] },
    { "id": 31, "tasks": ["19.2"] },
    { "id": 32, "tasks": ["19.3", "19.4", "19.5", "19.6"] },
    { "id": 33, "tasks": ["20.1"] },
    { "id": 34, "tasks": ["20.2"] },
    { "id": 35, "tasks": ["21.1"] },
    { "id": 36, "tasks": ["21.2"] },
    { "id": 37, "tasks": ["21.3"] },
    { "id": 38, "tasks": ["21.4", "21.5", "21.6"] },
    { "id": 39, "tasks": ["22.1"] },
    { "id": 40, "tasks": ["22.2"] },
    { "id": 41, "tasks": ["22.3"] },
    { "id": 42, "tasks": ["22.4", "22.5"] },
    { "id": 43, "tasks": ["23.1"] },
    { "id": 44, "tasks": ["23.2"] },
    { "id": 45, "tasks": ["24.1"] },
    { "id": 46, "tasks": ["24.2"] },
    { "id": 47, "tasks": ["25"] }
  ]
}
```
