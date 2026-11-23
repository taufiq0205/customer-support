# CX Support Tool

Multi-user support inbox for Photobook. It receives Zaapi and respond.io
webhooks and messages from a Telegram test bot. Agents and supervisors reply,
assign, and resolve conversations. Updates stream live over SSE, and AI can
suggest replies.

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
| `ZAAPI_WEBHOOK_SECRET`, `ZAAPI_API_KEY` | For Zaapi | Webhooks return 401, or 503 on message events; replies fail |
| `RESPOND_IO_WEBHOOK_SECRET` | For respond.io | Webhooks return 401 |
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

- Only `/api/webhooks/*` is public. Every other route, including
  `/api/health`, needs a login session.
- respond.io webhooks make no outbound calls, so they work offline. Send the
  base64 HMAC-SHA256 of the raw body in `x-webhook-signature`.
- Zaapi message events call the Zaapi API, so they fail offline. Use
  `tests/webhooks/ingestion.test.ts`, which stubs `fetch`.
- `tests/webhooks/helpers.ts` has signers and sample payloads for both
  platforms.

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
