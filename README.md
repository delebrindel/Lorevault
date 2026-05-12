# Lorevault

**Your Commander archive for collection insight, deck resolution, and transparent analysis.**

Lorevault is a Commander-focused web app for exploring your collection today while laying the groundwork for transparent, collection-aware deck analysis.

It pairs a Vue client with a Hono + TypeScript server, using Moxfield for collection and deck import data, and Scryfall as the canonical source for public card lookup.

## What Lorevault does today

- Filter your collection by color identity
- Browse collection cards through a lightweight web UI
- Import Commander decks from Moxfield deck URLs or IDs on the server
- Parse manual decklists into a normalized deck shape
- Resolve deck cards against your owned library first, then Scryfall fallback data
- Prepare deck-resolution data for the upcoming analyzer pipeline

## Coming soon

- Transparent Commander deck analysis
- CRISPI scoring (Consistency, Resilience, Interaction, Speed)
- Per-card evidence and drill-downs
- Collection-aware upgrade suggestions
- Analyzer UI built on top of the new deck parsing and resolution APIs

## Roadmap

- Finish the first analyzer-facing deck workflow
- Add deck scoring and evidence views
- Expand the client beyond collection browsing into a full analyzer experience
- Build collection-aware recommendation features on top of resolved deck data

## Quick local start

### 1. Install dependencies

```bash
npm run install:all
```

### 2. Create your local server env file

Create `server/.env` and add your Moxfield token:

```env
MOXFIELD_TOKEN=your_moxfield_jwt_token_here
```

Optional values are documented in `.env.example`.

### 3. Start the app

```bash
npm run dev
```

This starts:
- the API server on `http://localhost:3001`
- the Vite client on `http://localhost:5173`

## Smoke testing

Run the built-in API smoke test:

```bash
npm run smoke
```

It always writes the full output to `logs/test-api.log`.

### Optional smoke test configuration

The smoke runner supports these environment variables:

- `BASE_URL` - override the default API base URL (`http://localhost:3001`)
- `DECK_URL` - override the default Moxfield deck used by the smoke test

Examples:

```bash
BASE_URL=http://localhost:4010 npm run smoke
DECK_URL=https://moxfield.com/decks/example npm run smoke
```

On shells that use different env-var syntax, set `BASE_URL` / `DECK_URL` using your shell's normal environment-variable command style before running `npm run smoke`.

### Inspect the smoke log

Print the last 80 lines:

```bash
npm run smoke:tail
```

Print a custom number of lines:

```bash
npm run smoke:tail -- 200
```

## Development

For setup details, architecture notes, scripts, and current implementation status, see [DEVELOPMENT.md](./DEVELOPMENT.md).

## Repository

GitHub: <https://github.com/delebrindel/Lorevault>
