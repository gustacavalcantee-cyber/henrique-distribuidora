# Telegram Bot Design

## Goal

A standalone Telegram bot that lets the owner query reports and generate price list images directly from Telegram, running as a background process on his Mac.

## Architecture

A `bot/` folder inside the existing project. The bot is an independent Node.js process that:
- Receives commands via Telegram polling (no web server needed)
- Queries Supabase directly (all data is already synced there)
- Generates the Lista de Preços image with puppeteer (renders the same HTML template as the Electron app)
- Runs in the background via pm2, which auto-restarts on crash and can be configured to start on Mac login

Security: only the owner's Telegram chat ID can use the bot. All other senders receive an "access denied" message.

## Commands

| Command | Description |
|---|---|
| `/ajuda` | Lists all available commands |
| `/resumo` | Financial summary for current month: total sales, cost, margin, top stores |
| `/quinzena 1` or `/quinzena 2` | Quinzena report for current month. Optional: `/quinzena 1 04 2026` |
| `/pedidos` | Today's orders across all stores |
| `/pedidos Mundi` | Last 7 days of orders for stores matching "Mundi" (partial, case-insensitive) |
| `/pedidos Mundi 10/04/2026` | Orders for a specific store on a specific date |
| `/precos` | Generates and sends the Lista de Preços image to the chat |

For `/pedidos [loja]`: if multiple stores match the search term, the bot lists the options for the user to refine the query.

## File Structure

```
bot/
  src/
    index.ts              ← entry point: bot setup, auth middleware
    supabase.ts           ← Supabase client (reads env vars)
    commands/
      resumo.ts           ← /resumo handler
      quinzena.ts         ← /quinzena handler
      pedidos.ts          ← /pedidos handler
      precos.ts           ← /precos handler
    services/
      reports.ts          ← Supabase queries for all report data
      lista-precos.ts     ← HTML template + puppeteer screenshot
  .env                    ← SUPABASE_URL, SUPABASE_ANON_KEY, TELEGRAM_TOKEN, ALLOWED_CHAT_ID
  ecosystem.config.cjs    ← pm2 config (auto-start on Mac login)
  package.json
  tsconfig.json
```

## Tech Stack

- **grammy** — Telegram bot framework (TypeScript-first)
- **@supabase/supabase-js** — Supabase client for data queries
- **puppeteer** — headless Chrome for rendering price list image
- **tsx** — runs TypeScript directly (no build step needed for pm2)
- **pm2** — process manager, keeps bot running in background

## Setup Steps (one-time)

1. Create bot with @BotFather on Telegram → get token
2. Get your chat ID with @userinfobot
3. Fill in `.env`
4. `npm install` inside `bot/`
5. `pm2 start ecosystem.config.cjs && pm2 save && pm2 startup`

## Portability

The bot is pure Node.js with environment variables for all credentials. Migrating to Railway, Render, or any VPS requires only copying the `bot/` folder and setting the same env vars — no code changes.
