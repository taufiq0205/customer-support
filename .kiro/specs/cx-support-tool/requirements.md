# Requirements Document

## Introduction

The CX Support Tool is a web-based customer experience dashboard for the support team at Photobook Worldwide. It connects to messaging platforms — initially Zaapi and respond.io — and gives CX agents a single unified inbox to view, manage, and respond to customer conversations across all channels (WhatsApp, Facebook, Instagram, LINE, Shopee, Lazada, TikTok, and website widget). Agents can send replies on every one of these channels from day one. The tool provides conversation routing, agent assignment, canned responses, basic automation, and reporting so the team can resolve more tickets faster.

This is a team-facing operational tool, not an analytics-only tool. It is built on the existing Next.js app and runs locally on the owner's Mac (`127.0.0.1`). Multiple agents access it over the local network while the Mac is running. It covers live conversations only — no backfill of historical exports.

## Glossary

- **CX_Tool**: The CX Support Tool being specified here.
- **Agent**: A member of the customer experience support team who handles conversations.
- **Supervisor**: A senior team member who manages queues, assigns conversations, and views reports.
- **Conversation**: A single customer support thread on any connected messaging channel.
- **Channel**: A messaging source or platform (e.g. WhatsApp, Facebook Messenger, Instagram, LINE, Shopee, TikTok, website widget).
- **Platform**: An aggregator service that connects one or more Channels — either Zaapi or respond.io in the MVP.
- **Inbox**: The unified view of all assigned or unassigned conversations across all Channels.
- **Queue**: A pool of unassigned conversations waiting to be claimed or auto-assigned.
- **Assignment**: The act of routing a conversation to a specific Agent.
- **Canned_Response**: A pre-written reply that an Agent can insert into a conversation with one action.
- **Webhook**: An HTTP callback that a Platform sends to the CX_Tool when a new message arrives.
- **API_Adapter**: The integration layer that translates Platform-specific API calls and payloads into the CX_Tool's internal format.
- **Redaction**: Replacing personal data tokens (names, emails, phone numbers, order numbers) with placeholder labels before storing or displaying them in non-primary contexts.

---

## Requirements

### Requirement 1: Unified Inbox

**User Story:** As a CX Agent, I want to see all incoming customer conversations from every connected platform in one place, so that I do not need to switch between Zaapi and respond.io tabs to handle tickets.

#### Acceptance Criteria

1. THE CX_Tool SHALL display a unified Inbox that lists conversations from all connected Platforms and Channels.
2. WHEN a new message arrives via a Platform Webhook, THE CX_Tool SHALL add the conversation to the Inbox within 5 seconds of receipt.
3. WHILE a conversation is unread, THE CX_Tool SHALL display an unread indicator on that conversation in the Inbox.
4. THE CX_Tool SHALL show, for each conversation in the Inbox: the customer's display name or identifier, the Channel, the Platform, the timestamp of the most recent message, and a preview of that message.
5. THE CX_Tool SHALL allow the Agent to filter the Inbox by Platform, Channel, assignment status (assigned to me, unassigned, all), and conversation status (open, resolved, snoozed).
6. THE CX_Tool SHALL allow the Agent to search the Inbox by customer name, channel identifier, or keyword in the most recent message.
7. WHEN the Agent opens a conversation, THE CX_Tool SHALL display the full message thread in chronological order.

---

### Requirement 2: Platform Integration — Zaapi

**User Story:** As a CX Agent, I want the tool to pull in and reply to conversations from Zaapi, so that all Zaapi tickets appear in my unified Inbox.

#### Acceptance Criteria

1. THE CX_Tool SHALL connect to the Zaapi API using an API key stored in an environment variable, never in committed code.
2. WHEN Zaapi sends a Webhook event for a new or updated message, THE CX_Tool SHALL ingest the event and update the relevant conversation in the Inbox.
3. WHEN an Agent sends a reply to a Zaapi conversation, THE CX_Tool SHALL deliver the reply to Zaapi via the Zaapi API and SHALL display the sent message in the conversation thread.
4. IF the Zaapi API returns an error on a send attempt, THEN THE CX_Tool SHALL display the error to the Agent and SHALL mark the message as failed without discarding it.
5. THE CX_Tool SHALL record the originating Platform as `zaapi` on every conversation and message ingested through the Zaapi API_Adapter.
6. THE CX_Tool SHALL keep the Zaapi API_Adapter in a module separate from storage and from the respond.io API_Adapter, so either adapter can be replaced independently.

---

### Requirement 3: Platform Integration — respond.io

**User Story:** As a CX Agent, I want the tool to pull in and reply to conversations from respond.io, so that all respond.io tickets also appear in my unified Inbox.

#### Acceptance Criteria

1. THE CX_Tool SHALL connect to the respond.io API using an API key stored in an environment variable, never in committed code.
2. WHEN respond.io sends a Webhook event for a new or updated message, THE CX_Tool SHALL ingest the event and update the relevant conversation in the Inbox.
3. WHEN an Agent sends a reply to a respond.io conversation, THE CX_Tool SHALL deliver the reply to respond.io via the respond.io API and SHALL display the sent message in the conversation thread.
4. IF the respond.io API returns an error on a send attempt, THEN THE CX_Tool SHALL display the error to the Agent and SHALL mark the message as failed without discarding it.
5. THE CX_Tool SHALL record the originating Platform as `respond_io` on every conversation and message ingested through the respond.io API_Adapter.
6. THE CX_Tool SHALL keep the respond.io API_Adapter in a module separate from storage and from the Zaapi API_Adapter, so either adapter can be replaced independently.

---

### Requirement 4: Conversation Assignment and Routing

**User Story:** As a Supervisor, I want to assign conversations to specific agents and see who owns what, so that every ticket has a clear owner and nothing falls through the cracks.

#### Acceptance Criteria

1. THE CX_Tool SHALL allow a Supervisor or Agent to assign any open conversation to any active Agent.
2. WHEN a conversation is assigned to an Agent, THE CX_Tool SHALL notify that Agent with an in-app notification.
3. THE CX_Tool SHALL display the assigned Agent's name on each conversation in the Inbox.
4. THE CX_Tool SHALL allow a Supervisor to reassign a conversation from one Agent to another.
5. WHILE a conversation is unassigned, THE CX_Tool SHALL place it in the Queue.
6. THE CX_Tool SHALL allow a Supervisor to configure auto-assignment rules that distribute new conversations in the Queue to available Agents using either a round-robin strategy or a manual strategy; both strategies SHALL be available from the first release.
7. WHEN an Agent marks a conversation as resolved, THE CX_Tool SHALL remove it from the active Queue and record the resolution timestamp.

---

### Requirement 5: Reply and Compose

**User Story:** As a CX Agent, I want to type and send replies to customers directly within the tool, so that I never need to leave the CX_Tool to respond.

#### Acceptance Criteria

1. WHEN an Agent opens a conversation, THE CX_Tool SHALL present a compose area where the Agent can type a text reply.
2. WHEN the Agent submits a reply, THE CX_Tool SHALL send it to the customer via the conversation's Platform API_Adapter.
3. THE CX_Tool SHALL display sent replies in the conversation thread immediately, with a pending indicator until the Platform API confirms delivery.
4. IF the Platform API does not confirm delivery within 30 seconds, THEN THE CX_Tool SHALL mark the message as unconfirmed and SHALL allow the Agent to retry.
5. THE CX_Tool SHALL allow the Agent to insert a Canned_Response into the compose area by typing a trigger shortcode or selecting from a list.
6. THE CX_Tool SHALL enforce that replies respect channel-specific constraints (for example, WhatsApp message template requirements outside a 24-hour service window) and SHALL surface a clear error when a constraint is violated.

---

### Requirement 6: Canned Responses

**User Story:** As a CX Agent, I want pre-written replies I can insert with one action, so that I answer common questions consistently and quickly.

#### Acceptance Criteria

1. THE CX_Tool SHALL maintain a library of Canned_Responses, each with a name, a shortcode, and body text.
2. THE CX_Tool SHALL allow a Supervisor to create, edit, and delete Canned_Responses.
3. WHEN an Agent types `/` followed by characters in the compose area, THE CX_Tool SHALL filter and display matching Canned_Responses by shortcode.
4. WHEN the Agent selects a Canned_Response, THE CX_Tool SHALL insert its body text into the compose area.
5. THE CX_Tool SHALL allow Canned_Responses to include a `{{customer_name}}` placeholder that the CX_Tool replaces with the customer's display name before inserting.

---

### Requirement 7: Conversation Status and Lifecycle

**User Story:** As a CX Agent, I want to mark conversations as resolved or snoozed, so that my Inbox only shows what needs attention right now.

#### Acceptance Criteria

1. THE CX_Tool SHALL support the following conversation statuses: `open`, `snoozed`, `resolved`.
2. WHEN an Agent sets a conversation to `snoozed` with a date and time, THE CX_Tool SHALL hide it from the active Inbox until that date and time, then return it to `open`.
3. WHEN a customer sends a new message in a `resolved` or `snoozed` conversation, THE CX_Tool SHALL automatically reopen it and place it in the Queue.
4. THE CX_Tool SHALL record the status transition history for each conversation.
5. WHEN an Agent resolves a conversation, THE CX_Tool SHALL record the resolving Agent's identity and the timestamp.

---

### Requirement 8: Supervisor Reports

**User Story:** As a Supervisor, I want summary reports on team performance and conversation volumes, so that I can spot bottlenecks and improve the team's response times.

#### Acceptance Criteria

1. THE CX_Tool SHALL display a reports view showing, for a selectable date range: total conversations received, total resolved, average first-response time, and average resolution time.
2. THE CX_Tool SHALL allow the Supervisor to break down each metric by Agent, Channel, and Platform.
3. THE CX_Tool SHALL display the report within 3 seconds of the Supervisor applying a filter.
4. THE CX_Tool SHALL show the number of conversations currently open, in queue, and snoozed in a live summary at the top of the reports view.
5. WHERE the date range covers fewer than 10 resolved conversations for a given filter combination, THE CX_Tool SHALL display a low-volume indicator alongside the metric.
6. WHERE a connected Platform exposes CSAT scores via its API, THE CX_Tool SHALL retrieve those scores and include the average CSAT score and score distribution in the reports view, broken down by the same filters available for other metrics.

---

### Requirement 9: Agent Accounts and Access Control

**User Story:** As a Supervisor, I want agents to log in with their own accounts and see only what they need, so that conversations are secure and each agent has a clear scope.

#### Acceptance Criteria

1. THE CX_Tool SHALL require every user to authenticate before accessing any conversation data.
2. THE CX_Tool SHALL support two roles: `agent` and `supervisor`.
3. WHILE a user holds the `agent` role, THE CX_Tool SHALL restrict access to: the unified Inbox (conversations assigned to that agent or unassigned), the compose area, and Canned_Responses.
4. WHILE a user holds the `supervisor` role, THE CX_Tool SHALL grant access to: all conversations, assignment controls, Canned_Response management, auto-assignment configuration, and reports.
5. THE CX_Tool SHALL store passwords using a one-way cryptographic hash and SHALL never store or log plaintext passwords.
6. WHEN a user's session is inactive for 8 hours, THE CX_Tool SHALL require re-authentication.
7. THE CX_Tool SHALL bind exclusively to `127.0.0.1`; agents on the same local network access it through the owner's Mac and SHALL NOT be able to reach it from outside that network.

---

### Requirement 10: Privacy and Data Security

**User Story:** As the tool owner, I want customer data to be handled securely, so that personal information is not exposed beyond what agents need to do their work.

#### Acceptance Criteria

1. THE CX_Tool SHALL store API keys and credentials exclusively in environment variables or a secrets manager, never in source code or committed configuration files.
2. THE CX_Tool SHALL transmit all data between the browser and the server over HTTPS.
3. THE CX_Tool SHALL NOT fetch or proxy image attachment URLs from Platform messages; image rendering relies on the Platform's own URLs displayed in the browser.
4. THE CX_Tool SHALL enforce access control at the API layer so that an authenticated `agent` user cannot read conversations assigned to other agents by crafting a direct API request.
5. IF a Webhook payload cannot be verified against its Platform's signature mechanism, THEN THE CX_Tool SHALL reject the request with HTTP 401 and SHALL log the rejection without storing the payload content.

---

### Requirement 11: Reliability and Performance

**User Story:** As a CX Agent, I want the tool to stay responsive under normal load, so that slow pages do not delay my replies to customers.

#### Acceptance Criteria

1. THE CX_Tool SHALL load the Inbox with up to 50 conversations in under 2 seconds under normal operating conditions (local Mac, up to 10 concurrent agents on the local network).
2. WHEN a new message arrives via Webhook, THE CX_Tool SHALL update the relevant conversation in the Inbox of all agents currently viewing that conversation within 5 seconds without requiring a page reload.
3. IF the CX_Tool loses the database connection, THEN THE CX_Tool SHALL display a clear error state to the Agent and SHALL NOT silently drop incoming Webhook events for up to 60 seconds while attempting reconnection.
4. THE CX_Tool SHALL log all inbound Webhook events with a timestamp and Platform name before attempting to process them, so that no event is silently lost.

---

### Requirement 12: AI Model Integration

**User Story:** As a CX Agent, I want AI-assisted reply suggestions in the compose area, so that I can respond to customers faster and more consistently; as a Supervisor, I want to configure the AI provider endpoint from within the tool, so that the team can use DeepSeek, a local Ollama instance, or any OpenAI-compatible model without code changes.

#### Acceptance Criteria

1. THE CX_Tool SHALL provide a settings UI, accessible only to users holding the `supervisor` role, where the Supervisor can set a custom AI endpoint URL, a model name, and an API key for the AI integration.
2. THE CX_Tool SHALL store the AI endpoint URL, model name, and API key exclusively in environment variables or the local secrets store; these values SHALL never appear in committed code or configuration files.
3. THE CX_Tool SHALL communicate with the configured AI endpoint using the OpenAI-compatible chat completions API contract (`POST /v1/chat/completions`), so that any provider implementing that contract — including DeepSeek, Ollama, and OpenAI — can be used interchangeably.
4. WHEN an Agent opens a conversation and focuses the compose area, THE CX_Tool SHALL offer an action to request an AI-generated reply suggestion based on the current conversation thread.
5. WHEN the Agent requests a reply suggestion, THE CX_Tool SHALL insert the returned suggestion into the compose area as editable draft text, leaving the Agent in full control before sending.
6. BEFORE sending any conversation content to the AI endpoint, THE CX_Tool SHALL redact all customer PII tokens — including names, email addresses, phone numbers, and order numbers — replacing each with a labelled placeholder (for example `[NAME]`, `[EMAIL]`, `[PHONE]`, `[ORDER]`).
7. IF the AI endpoint returns an error or does not respond within 10 seconds, THEN THE CX_Tool SHALL display a clear inline error to the Agent and SHALL NOT block the Agent from composing or sending a reply manually.
8. THE CX_Tool SHALL isolate the AI integration in a dedicated AI_Adapter module that is separate from the Platform API_Adapters and from the storage layer, so it can be replaced or disabled independently.
9. WHILE no AI endpoint URL is configured, THE CX_Tool SHALL hide AI assistance actions from the compose area and SHALL display a prompt directing the Supervisor to configure the AI settings.
10. THE CX_Tool SHALL log each AI request with a timestamp and the model name, and SHALL never include redacted or raw PII in those log entries.
