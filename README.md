# CX Support Tool

A portfolio project: a multi-user customer support inbox that runs locally.
It receives messages from a Telegram test bot. Agents reply, assign, snooze,
and resolve conversations, and AI can draft a reply. Supervisors also get the
Supervisor Desk reports, the AI Agent workspace, and settings for the AI
provider, canned responses, and auto-assignment. Updates stream live over SSE.

## Run locally

Requires Node.js 20.9 or newer and npm.

```bash
npm ci
cp .env.example .env.local   # then set SESSION_SECRET: openssl rand -base64 32
npm run seed:users -- --username lead --password 'change-me' --role supervisor
npm run dev
```

Open <http://127.0.0.1:3000> and log in. The app binds to `127.0.0.1` only.

Run the seed step before first start: it is the only step that creates the
database tables. Roles are `agent` or `supervisor`; `--display-name` is
optional.

## Environment variables

Set these in `.env.local`. See `.env.example` for descriptions.

| Variable | Required | Without it |
|---|---|---|
| `SESSION_SECRET` | Yes | Every page and API call returns 500 |
| `DATABASE_URL` | No | Defaults to `./cx_tool.db` |
| `ZAAPI_API_KEY` | To send Zaapi replies | Replies fail |
| `RESPOND_IO_API_KEY` | To send respond.io replies | Replies fail |
| `TELEGRAM_BOT_TOKEN` | For the Telegram test channel | Telegram webhooks return 401; replies fail |
| `AI_ENDPOINT_URL`, `AI_MODEL_NAME`, `AI_API_KEY` | No | AI suggestions are off |

## Other commands

| Command | Does |
|---|---|
| `npm run build && npm start` | Production build, also on `127.0.0.1:3000` |
| `npm test` | Vitest, in-memory database |
| `npm run test:watch` | Vitest in watch mode |
| `npm run telegram:poll` | Forwards Telegram bot messages to the local app |

## Testing without live platforms

Telegram is the only inbound channel. Its local endpoint, `/api/webhooks/telegram`,
uses the bot-derived secret. Zaapi and respond.io ingestion fixtures exercise
the shared intake service directly in `tests/webhooks/ingestion.test.ts`.

## Live testing with Telegram

Telegram is a real test channel. Message the bot as a customer and reply from
the inbox.

1. Put the bot token from @BotFather in `TELEGRAM_BOT_TOKEN` in `.env.local`.
2. Run `npm run dev`.
3. In a second terminal, run `npm run telegram:poll`.
4. Send the bot a private message. It appears in the inbox. Replies sent from
   the thread go back to the Telegram chat.

The poller uses `getUpdates` long polling, so the app stays on `127.0.0.1` with
no tunnel. It removes any webhook set on the bot, because Telegram allows only
one delivery mode. Only private chats are ingested.

If the dev server starts reloading the page in a loop, stop it, close the tab,
run `rm -rf .next`, then start `npm run dev` again.

## Data handling

Database files, sidecars, and `.env.local` are ignored by Git. Use only
synthetic fixture data while developing.
