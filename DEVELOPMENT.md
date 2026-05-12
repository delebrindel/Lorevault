# Lorevault Development

This document covers local setup, scripts, architecture, and the current implementation status for Lorevault.

## Overview

Lorevault is a split frontend/backend application:

- `client/` — Vue 3 + Vite UI
- `server/` — Hono + TypeScript API server

Current focus:
- collection filtering
- deck parsing and resolution
- analyzer groundwork for future Commander insights

## Prerequisites

- Node.js 20+ recommended
- npm
- A valid `MOXFIELD_TOKEN`

## Repository structure

```text
.
├─ client/              # Vue app
├─ server/              # Hono API server
├─ docs/                # specs and implementation plans
├─ scripts/             # root development helpers
├─ .env.example         # env variable reference
├─ README.md
└─ DEVELOPMENT.md
```

## Environment setup

### Local development

The server reads env vars from:
- `server/.env` in development
- repo-root `.env` in production

For local development, create:

```text
server/.env
```

With at least:

```env
MOXFIELD_TOKEN=your_moxfield_jwt_token_here
```

Reference values in:

```text
.env.example
```

## Install

From the repo root:

```bash
npm run install:all
```

That installs dependencies for both:
- `server/`
- `client/`

## Run

### Full app

From repo root:

```bash
npm run dev
```

What this does:
- starts the server first
- waits for `http://localhost:3001/api/health`
- then starts the Vite client

Expected local URLs:
- client: `http://localhost:5173`
- server: `http://localhost:3001`

### Run pieces separately

Server only:

```bash
npm run dev:server
```

Client only:

```bash
npm run dev:client
```

## Build

### Full build

From repo root:

```bash
npm run build
```

### Server build only

```bash
cd server && npm run build
```

### Client build only

```bash
cd client && npm run build
```

## Test

Current automated tests live in the server.

Run all server tests:

```bash
cd server && npm test
```

### API smoke testing

You can exercise the current Lorevault endpoints with the cross-platform Node-based smoke runner:

- `npm run smoke`

The smoke runner always writes the full output to `logs/test-api.log`.

Run it with:

```bash
npm run smoke
```

To inspect the end of the logfile:

```bash
npm run smoke:tail
npm run smoke:tail -- 200
```

Optional smoke runner environment variables:

- `BASE_URL` - override the default API base URL (`http://localhost:3001`)
- `DECK_URL` - override the default Moxfield deck used by the smoke test

This covers:
- `/api/health`
- `/api/collection`
- `/api/deck/parse`
- `/api/deck/resolve`

## Current architecture

### Data-source policy

Lorevault uses this project-wide source-of-truth split:

- **Moxfield**
  - owned collection data
  - deck import by URL/ID
  - user/account-backed data

- **Scryfall**
  - generic card lookup
  - canonical public card metadata
  - fallback card resolution when a card is not in the owned library

### Current server flow

#### Collection
- `POST /api/collection`
- backed by a cached owned-library service
- filters collection cards by color identity

#### Deck parsing
- `POST /api/deck/parse`
- accepts:
  - `source: "manual"`
  - `source: "moxfield"`
- parses manual lists or imports Moxfield deck structure

#### Deck resolution
- `POST /api/deck/resolve`
- loads the owned library once
- resolves cards using:
  1. owned library
  2. Scryfall exact lookup
  3. Scryfall fuzzy fallback
- returns resolved commander/mainboard entries plus an ownership map

## Current implementation status

### Implemented
- cached Moxfield owned-library service
- collection filtering route
- manual decklist parser
- Moxfield deck import adapter
- Scryfall-backed card resolver
- deck resolver orchestrator
- `/api/deck/parse`
- `/api/deck/resolve`
- route mounting in the server entrypoint

### In progress / next
- analyzer UI
- CRISPI scoring engine
- card tagging/archetype detection
- collection-aware recommendations

## Useful files

### Root
- `package.json`
- `.env.example`
- `scripts/dev.mjs`

### Server
- `server/src/index.ts`
- `server/src/routes/collection.ts`
- `server/src/routes/deck.ts`
- `server/src/services/library.ts`
- `server/src/services/deck-parser.ts`
- `server/src/services/card-resolver.ts`
- `server/src/services/deck-resolver.ts`
- `server/src/types.ts`

### Planning docs
- `docs/superpowers/specs/2026-05-11-commander-deck-analyzer-design.md`
- `docs/superpowers/plans/2026-05-11-phase-1a-data-layer.md`
- `docs/superpowers/plans/2026-05-11-phase-1b-deck-resolver.md`

## Notes

- In local development, the Vite client proxies `/api` to the server on port `3001`.
- The server currently requires `MOXFIELD_TOKEN` at startup.
