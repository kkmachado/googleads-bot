# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Run the server locally
npm start          # or: node server.js

# Build and run via Docker
docker build -t googleads-bot .
docker run -p 3000:3000 -v $(pwd)/data:/app/data googleads-bot
```

There are no tests or linter configured.

## Architecture

A two-file Node.js service that scrapes the Google Ads billing summary page using Playwright and exposes the result via an HTTP API.

- **`server.js`** — Express HTTP server with two routes:
  - `GET /health` — liveness check
  - `POST /capture-billing-summary` — triggers a Playwright scrape and returns structured billing data

- **`capture.js`** — All scraping logic lives here in `captureBillingSummary()`. It:
  1. Launches a headless Chromium browser (locale `pt-BR`, timezone `America/Sao_Paulo`)
  2. Reuses a persisted browser session from `DATA_DIR/storageState.json` (written back after each successful run)
  3. Navigates to `https://ads.google.com/aw/billing/summary` and detects login redirects as errors
  4. Extracts a reference year from visible text, then walks all text nodes looking for Portuguese month names
  5. For each month, climbs up the DOM ancestry (up to 10 levels) to find a container with both "Custo líquido" and "Pagamentos" plus at least two BRL currency values
  6. Extracts the account credit balance from the `.total-balance` CSS selector
  7. Returns `{ referenceYear, creditBalanceText, creditBalanceValue, months[], capturedAt }` — each month entry includes parsed BRL values and a `monthDate` (`YYYY-MM-01`)

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `DATA_DIR` | `/app/data` | Directory for `storageState.json` (session persistence) and `screenshots/` (error captures) |
| `WEBHOOK_SESSION_EXPIRED_URL` | *(unset)* | If set, a POST is sent to this URL when a Google session expiry is detected |
| `PUBLIC_URL` | `http://localhost:3000` | Public base URL of the service, included in webhook notification instructions |
| `REAUTH_SECRET` | *(unset)* | If set, the `POST /reauth` endpoint requires the header `x-reauth-secret` with this value |
| `GOOGLE_ADS_CUSTOMER_ID` | *(unset)* | If set, used to select the correct account on the Google Ads account selector screen (e.g. `628-123-7076`) |

## Re-authentication Flow

When the session expires, the bot POSTs a webhook to `WEBHOOK_SESSION_EXPIRED_URL` with an `instructions` field ready to paste in an email. To reauth, run locally:

```bash
PUBLIC_URL=https://marketing-googleads-bot.qqbqnt.easypanel.host \
REAUTH_SECRET=<seu-secret> \
node reauth-local.js
```

The script opens a real browser, waits for you to log in, then POSTs the new `storageState.json` to `POST /reauth` on the server.

## Session Authentication

The bot does not log in automatically. An authenticated `storageState.json` must be placed in `DATA_DIR` before the first run. The file is updated after each successful capture to keep the session alive. On auth failure, a screenshot is saved to `DATA_DIR/screenshots/` for debugging.
