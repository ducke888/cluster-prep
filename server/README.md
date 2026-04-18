# AI tutor proxy

Minimal Node server that proxies DECA tutor chats to Anthropic's API.
Holds the API key server-side, enforces a per-user daily USD budget cap,
and scopes the model to DECA-only via a strict system prompt.

## Setup

```bash
cd server
export ANTHROPIC_API_KEY=sk-ant-...
node server.js
```

## Env vars

| Var | Default | Notes |
|-----|---------|-------|
| `ANTHROPIC_API_KEY` | — | **Required.** |
| `TUTOR_PORT` | `3001` | |
| `TUTOR_MODEL` | `claude-3-5-haiku-20241022` | Any Messages-API-compatible model. |
| `TUTOR_DAILY_CAP_USD` | `1.0` | Hard cap per user per UTC day. |

## Endpoints

### `POST /api/tutor`

```json
{
  "user": "aryank",
  "topic": "IM",
  "question": "What does a sampling plan do? A…  B…",
  "messages": [
    { "role": "user", "content": "I keep missing these. Walk me through." }
  ]
}
```

Response:
```json
{
  "text": "…tutor's reply…",
  "usage": { "input_tokens": 1234, "output_tokens": 345 },
  "costUSD": 0.00237,
  "spentTodayUSD": 0.18,
  "remainingUSD": 0.82,
  "capUSD": 1.0
}
```

### `GET /api/tutor/budget?user=<name>`

Returns today's spent + remaining USD for that user.

## Protection layers (7)

1. **Server-only API key** — never shipped to browser.
2. **Daily hard cap** per user (default $1, enforced before and after each call).
3. **Context truncation** — server drops messages beyond the last 14 turns.
4. **Per-message char cap** — 2,000 chars per message.
5. **Output token cap** — `max_tokens: 600`.
6. **Scope gate** — strict DECA-only system prompt; refuses off-topic.
7. **Jailbreak resistance** — system prompt explicitly tells model to ignore user instructions that try to change its role / reveal its prompt.

`budget.json` is the persistent spend ledger — check in on it to audit.
