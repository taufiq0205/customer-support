# Requirements for the CX Support frontend redesign

Apply the Photobook Care Studio design in the local `photobook-care-studio/` folder to the existing CX Support Tool. Wire screens to existing capabilities first. Then add the screens that need future backend work as clearly labeled placeholders. Backend work for those placeholders belongs to later specs.

The [current CX Support requirements](../cx-support-tool/requirements.md) and [design](../cx-support-tool/design.md) establish the application contracts. The implementation in the checkout determines which capabilities are available for this phase. Record any differences before changing the affected UI.

## Requirement 1 — Feature mapping and application shell

**User story.** As the owner, I want a feature map before implementation so the new frontend preserves the capabilities we already have.

1.1. Before UI changes begin, the implementer SHALL verify every row of the [feature map](design.md#feature-map) against the checkout and record the source and verification path for each existing capability or placeholder.

1.2. WHEN an agent or supervisor logs in, THE SYSTEM SHALL display the redesigned shell with their authenticated role, role-appropriate destinations, notifications, and logout. Direct requests SHALL enforce the same access boundaries as navigation.

1.3. THE SYSTEM SHALL build and test the Next.js application independently of the downloaded Vite reference and the separate X-Ray project.

## Requirement 2 — Inbox and conversation

**User story.** As a support agent, I want to scan the queue and open the right conversation quickly.

2.1. THE SYSTEM SHALL render a prominent case identifier, customer label, short message preview, and a labeled color tag for the actual channel. Show status, owner, or unread state where useful and keep the default view free of unsupported urgency signals.

2.2. THE SYSTEM SHALL preserve search, channel, platform, assignment and status filters, server ordering, and authorized direct conversation links. WHEN the filter changes, THE SYSTEM SHALL reset pagination and make the result state clear. WHEN the list has another page, THE SYSTEM SHALL provide access to it through the existing cursor.

2.3. THE SYSTEM SHALL use a queue and thread layout on desktop and separate full-width queue and thread views on mobile. WHEN a user returns to the queue, THE SYSTEM SHALL preserve filters. WHEN a thread opens, THE SYSTEM SHALL make the latest conversation and composer reachable and keep Case Context collapsed by default.

2.4. WHEN an authorized conversation or message event arrives, THE SYSTEM SHALL refresh the relevant view through the existing SSE subscription. The thread SHALL preserve message order, attachment indicators, and delivery states.

## Requirement 3 — Replies and case actions

**User story.** As a support agent, I want to reply and manage the conversation without losing work or sending to the wrong customer.

3.1. WHEN a reply is sent, THE SYSTEM SHALL use the selected conversation's channel and existing send path. Preserve pending, sent, delivered, failed, and unconfirmed states and existing retry and duplicate-resend protection.

3.2. WHEN the user switches conversations or a server refresh arrives, THE SYSTEM SHALL keep unsent text scoped to that conversation and authenticated user. A late AI, send, or canned-response result SHALL only update the originating conversation as applicable. An AI suggestion SHALL remain editable and require a human send action.

3.3. THE SYSTEM SHALL preserve canned-response lookup, keyboard selection, and current token substitution. WHEN suggestions are disabled or fail, THE SYSTEM SHALL keep manual composing and sending available.

3.4. WHEN the user claims, assigns, snoozes, resolves, or reopens a case, THE SYSTEM SHALL use the existing permitted actions and transitions. Resolved conversations SHALL remain out of the active queue, and assignment of a resolved conversation SHALL retain the existing conflict behavior. An inbound message SHALL reopen a resolved or snoozed conversation through the existing lifecycle.

## Requirement 4 — Existing supervisor tools

**User story.** As a supervisor, I want to keep team reporting, routing, canned responses, and AI suggestion configuration available in the new shell.

4.1. THE SYSTEM SHALL render existing report totals, live queue summary, date and dimension filters, breakdowns, and low-volume states through the current report contract.

4.2. THE SYSTEM SHALL provide supervisor controls for existing canned-response create, edit, and delete operations and existing round-robin or manual auto-assignment configuration. Validate errors and permissions through the existing operations.

4.3. THE SYSTEM SHALL retain the supervisor-only suggestion provider configuration, including endpoint, model, and write-only key handling. The UI SHALL describe when those settings take effect using the existing save behavior.

## Requirement 5 — Frontend placeholders

**User story.** As the owner, I want to see the future workflows in the frontend so I can implement the features around them later.

5.1. THE SYSTEM SHALL show labeled placeholders for unavailable order and production details, attachment previews, cross-channel case linking, SLA and urgency, customer history and sentiment, and policy actions in the relevant inbox and case context. Show actual fields where available.

5.2. THE SYSTEM SHALL show the future escalation queue, approvals, and operations signals within the supervisor experience. Unavailable actions SHALL have a visible explanation and no real side effect.

5.3. THE SYSTEM SHALL provide supervisor-only AI Agent views for Overview, Agent Config, Knowledge Base, categorized Knowledge Gaps, Customer Sentiment, and Drift Detection. Each view SHALL identify unavailable data and actions. Config SHALL depict instructions, enabled channels, knowledge sources, handoff rules, and pause and publish states as future controls.

5.4. THE SYSTEM SHALL show placeholders for delivered AI messages, full AI resolution, partial AI resolution, unable-to-answer handoffs, policy-required transfers, and pending handoffs. Undefined values SHALL appear as unavailable. Existing team reports and human-sent AI drafts SHALL retain their distinct meanings.

5.5. THE SYSTEM SHALL use real data on connected screens and explicit unavailable states on placeholders. Any examples used for tests SHALL be synthetic. A placeholder SHALL issue no network mutation, write no business data, and display no live-success confirmation.

## Requirement 6 — Verification and handoff

**User story.** As the next implementer, I want the redesigned frontend to have reproducible checks and a clear list of backend gaps.

6.1. THE SYSTEM SHALL support keyboard navigation, visible focus, accessible names and feedback, and an operable composer at desktop and phone widths. Channel and status meaning SHALL be readable without color.

6.2. The implementer SHALL verify existing journeys with local synthetic data and record separate evidence for browser behavior, backend contract tests, and any live test-channel delivery. Use the same fixture to compare the inbox, thread, and report totals where relevant.

6.3. The implementer SHALL leave each future feature linked to its frontend entry point, missing input or action, and the next contract decision. Persisted data, the schema, webhook and adapter contracts, and the authorization model remain governed by the current spec.
