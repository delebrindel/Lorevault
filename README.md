# Lorevault

**Your Commander archive for collection insight, deck resolution, and transparent analysis.**

Lorevault is a Commander-focused web app for exploring your collection today while laying the groundwork for transparent, collection-aware deck analysis.

It pairs a Vue client with a Hono + TypeScript server, using Moxfield for collection and deck import data, and Scryfall as the canonical source for public card lookup. The backend analyzer can now parse, resolve, and score Commander decks with live CRISPI output for the implemented axes.

## What Lorevault does today

- Filter your collection by color identity
- Browse collection cards through a lightweight web UI
- Import Commander decks from Moxfield deck URLs or IDs on the server
- Parse manual decklists into a normalized deck shape
- Resolve deck cards against your owned library first, then Scryfall fallback data
- Score resolved decks through `POST /api/deck/score`
- Return live CRISPI reports with implemented `Consistency` and `Resilience` axes

## Coming soon

- Remaining CRISPI axes: `Interaction` and `Speed`
- Richer analyzer heuristics, evidence, and archetype detection
- Analyzer UI built on top of the parse / resolve / score APIs
- Collection-aware upgrade suggestions

## Roadmap

- Finish the backend CRISPI engine by implementing `Interaction` and `Speed`
- Improve backend heuristics such as richer archetype detection and deeper card tagging
- Add analyzer score and evidence views in the client
- Build collection-aware recommendation features on top of resolved deck data
- See the full roadmap in [ROADMAP.md](./ROADMAP.md)

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

Current backend analyzer endpoints:
- `POST /api/deck/parse`
- `POST /api/deck/resolve`
- `POST /api/deck/score`

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

Examples by shell:

```bash
# bash / zsh
BASE_URL=http://localhost:4010 npm run smoke
DECK_URL=https://moxfield.com/decks/example npm run smoke
```

```powershell
# PowerShell
$env:BASE_URL = 'http://localhost:4010'; npm run smoke
$env:DECK_URL = 'https://moxfield.com/decks/example'; npm run smoke
```

```bat
:: cmd.exe
set BASE_URL=http://localhost:4010 && npm run smoke
set DECK_URL=https://moxfield.com/decks/example && npm run smoke
```

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

For setup details, architecture notes, and current implementation status, see [DEVELOPMENT.md](./DEVELOPMENT.md).

For milestone planning and upcoming backend/client work, see [ROADMAP.md](./ROADMAP.md).

## Repository

GitHub: <https://github.com/delebrindel/Lorevault>
