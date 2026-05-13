# Phase 1.B — Deck Input + Card Resolver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Tasks share files and have ordering dependencies, so superpowers:subagent-driven-development is NOT appropriate here (see "Execution handoff" section at the end). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept a Commander deck (Moxfield URL/ID or pasted decklist), parse it into a normalized `ParsedDeck`, and resolve every name to a full `Card` — owned-library first, **Scryfall named lookup as fallback** — producing a `ResolvedDeck` ready for the Phase 1.C scorer.

**Architecture:** Three pure-ish services behind two new HTTP routes. `deck-parser` handles input normalization (manual text + Moxfield deck fetch). `card-resolver` does single-name resolution with a process-lifetime name cache and a **Scryfall → shared `Card` mapper**. `deck-resolver` orchestrates: load owned library once, resolve every name, build `ResolvedDeck`. Errors propagate as the existing `MoxfieldError`. The scorer never knows where Card data came from.

**Tech Stack:** Hono 4.7, TypeScript ESM (strict), Vitest 4.1.2, native `fetch`. No new dependencies.

---

## Codebase notes (read before Task 1)

This plan assumes you have **zero context** for the codebase. Read this section fully before starting.

### Project layout
- Repo root: `D:\node\moxfield-app` (or wherever the worktree is checked out — see Execution section).
- This is **NOT an npm workspaces repo.** `server/` and `client/` have separate `package.json`. All commands in this plan run from `server/`. Never use `--workspace` flags.
- TypeScript ESM. Imports of local files **MUST** use `.js` extensions (e.g. `import { x } from "../services/library.js";`) even though source is `.ts`. This is non-negotiable; the build will fail otherwise.
- Code style enforced by visual inspection of existing files: **double-quoted strings**, 2-space indent, semicolons, trailing commas where the surrounding code uses them.

### Existing types you will use (all in `server/src/types.ts`)
- `Card` — full card shape with `id, uniqueCardId, scryfall_id, set, set_name, name, cn, layout, cmc, type, type_line, oracle_text, mana_cost, power?, toughness?, colors, color_identity, rarity, prices`. NOTE: `colors` and `color_identity` are `string[]` not `MtgColor[]`.
- `CollectionItem` — `{ id, quantity, condition, finish?, card: Card }`. NO `isFoil/isAlter/isProxy` fields.
- `OwnedCard` — `{ name, printings: CollectionItem[], totalQty }`.
- `OwnedLibrary` — `Map<string, OwnedCard>` keyed by exact name.
- `MtgColor` — `"W" | "U" | "B" | "R" | "G"`.
- `MTG_COLORS` — `Record<MtgColor, string>` (NOT a string array).
- `CardPrices` — `{ usd?, usd_foil?, eur?, eur_foil?, tix?, ck?, ck_foil?, lastUpdatedAtUtc? }`.

You will **append** `ParsedDeck` and `ResolvedDeck` to `types.ts` in Task 1.

### Existing services you will reuse
- `server/src/services/library.ts` exports:
  - `getOwnedLibrary(opts: { token: string; ttlMs?: number; refresh?: boolean }): Promise<OwnedLibraryResult>` where `OwnedLibraryResult = { library: OwnedLibrary; totalResults: number }`.
  - `MoxfieldError extends Error` with `.status: 401 | 502` (will be widened to `400 | 401 | 502` in Task 3 — see that task for the change).
  - `clearLibraryCache()` — test-only helper.

### Current server boot behavior (important for route tasks)
- `server/src/index.ts` currently exits at startup if `MOXFIELD_TOKEN` is missing.
- Therefore, the route-level behavior in Tasks 7–8 that distinguishes manual vs. Moxfield token requirements is primarily a unit/integration contract of `routes/deck.ts`, not a promise that the whole server can currently boot token-free.
- Do **NOT** change `index.ts` boot semantics in Phase 1.B beyond mounting the new router in Task 9. If relaxing startup token requirements is desired later, that should be its own follow-up.

### Vitest gotcha (from Phase 1.A — do NOT repeat)
`fetchSpy.mockResolvedValue(new Response(...))` returns the SAME `Response` instance on every call. A `Response` body stream can be read **only once**, so the second call fails with "invalid JSON" or similar. Whenever a test causes `fetch` to be called more than once, use:

```ts
fetchSpy.mockImplementation(async () => new Response(JSON.stringify(payload), { status: 200 }));
```

Use `mockResolvedValueOnce` (chained) only when each call returns a distinct `Response` instance.

### Moxfield API conventions (from existing `library.ts`)
- Base host: `https://api2.moxfield.com`.
- Auth: `Authorization: Bearer <process.env.MOXFIELD_TOKEN>`.
- Headers: `Accept: application/json`, `User-Agent: lorevault/1.0`.
- `redirect: "follow"`.
- Status mapping: 401/403 → throw `MoxfieldError("Invalid or expired auth token", 401)`. Any other non-2xx → `MoxfieldError("Moxfield API error: <status> <statusText>", 502)`. Network/JSON failure → `MoxfieldError("Failed to reach Moxfield API: <msg>", 502)` or `MoxfieldError("Moxfield API returned invalid JSON", 502)`. Mirror this exactly in new fetchers.

### Open spec questions you MUST verify in this phase
The spec (`docs/superpowers/specs/2026-05-11-commander-deck-analyzer-design.md` lines 865–866) flags:
- **Q2.1** — **Scryfall-to-project `Card` mapping contract.** Verify the chosen Scryfall endpoint and define the exact field mapping/defaults required to produce the shared `Card` shape.
- **Q2.2** — Deck-by-id endpoint URL/shape. Spec says "must verify before Phase 1 implementation."

This plan provides assumed shapes (Task 3 and Task 5). The implementer MUST run a real probe against the live API before locking each mapper. See those tasks for exact verification instructions and what to do if the shape differs.

### Test/build commands (always from `server/`)
```bash
npm test                  # full vitest run
npm test -- <filter>      # vitest path/name substring filter (matches BOTH src and dist)
npm run build             # tsc, must pass with zero errors
```

Known issue: vitest also picks up stale `dist/**/*.test.js` artifacts, inflating counts by ~8. Ignore the `dist/` duplicates; verify your new tests via the `src/` lines in `--reporter=verbose` output.

### Git rules (from AGENTS.md — non-negotiable)
- **NEVER commit, NEVER `git add`, NEVER push.** Dele commits. At every checkpoint marked "Pause for Dele to commit" in this plan, you MUST stop, present the suggested commit message and the list of changed files, and wait for explicit "go" / "commit" / "proceed" from Dele before starting the next task. Multiple pauses are expected. Do not batch.
- If you are a subagent, your final message at each pause should clearly state: "Ready for commit — files: `<list>`, suggested message: `<msg>`. Waiting for Dele."
- Never `--no-verify`, `--no-gpg-sign`, or skip hooks.
- Never `git commit --amend`. If a fix is needed after a commit, propose a new commit; Dele runs it.
- Never `git rebase -i` or any interactive git command.
- Never modify git config.
- CRLF warnings on Windows are expected and harmless. Ignore them.

---

## File structure

**Create:**
- `server/src/services/deck-parser.ts` — manual decklist text parser + Moxfield deck-fetch adapter.
- `server/src/services/deck-parser.test.ts`
- `server/src/services/card-resolver.ts` — `resolveCard(name, library)` with per-name in-memory cache, Scryfall fallback lookup, and Scryfall → shared `Card` mapping.
- `server/src/services/card-resolver.test.ts`
- `server/src/services/deck-resolver.ts` — orchestrator: loads library once, resolves commander + mainboard, returns `ResolvedDeck`.
- `server/src/services/deck-resolver.test.ts`
- `server/src/routes/deck.ts` — `POST /api/deck/parse` and `POST /api/deck/resolve`.
- `server/src/routes/deck.test.ts`

**Modify:**
- `server/src/types.ts` — append `ParsedDeck` and `ResolvedDeck`.
- `server/src/index.ts` — mount the new `/api/deck` router.

---

## Build order

1. **Task 1** — Types: `ParsedDeck`, `ResolvedDeck`.
2. **Task 2** — Manual decklist parser (pure function, many edge cases).
3. **Task 3** — Moxfield deck-fetch adapter (live API verification REQUIRED).
4. **Task 4** — `parseDeck` service that combines both paths.
5. **Task 5** — `resolveCard` with owned-library hit and Scryfall named lookup miss (live API verification REQUIRED).
6. **Task 6** — `resolveDeck` orchestrator.
7. **Task 7** — `POST /api/deck/parse` route.
8. **Task 8** — `POST /api/deck/resolve` route.
9. **Task 9** — Mount the router in `index.ts`.
10. **Task 10** — Self-review and final test/build sweep.

Each task ends with passing tests, a passing build (where production code changed), and one git commit.

---

## Task 1 — Add `ParsedDeck` and `ResolvedDeck` types

**Files:**
- Modify: `server/src/types.ts`

- [ ] **Step 1: Append the new types**

Add these types to the end of `server/src/types.ts` (after the existing `OwnedLibrary` type alias):

```ts
/**
 * A deck after input parsing but before card-name resolution.
 * `commander` holds 1 name, or 2 if partner / background / friends-forever.
 * `unresolved` is parser-level: lines the parser could not tokenize at all.
 * Card-resolution failures live on `ResolvedDeck.unresolved`, not here.
 */
export interface ParsedDeck {
  source: "moxfield" | "manual";
  commander: string[];
  mainboard: { name: string; qty: number }[];
  unresolved: string[];
}

/**
 * A deck after every name has been mapped to a `Card`.
 * `commander` and `mainboard` contain only successful resolutions.
 * `unresolved` lists names neither the owned library nor Moxfield could resolve.
 * `ownedMap` reports owned quantity per `scryfall_id` for quick "do I own this?" lookups.
 */
export interface ResolvedDeck {
  commander: Card[];
  mainboard: { card: Card; qty: number }[];
  unresolved: string[];
  ownedMap: Map<string, number>;
}
```

- [ ] **Step 2: Verify the build**

```bash
cd server && npm run build
```

Expected: zero errors.

- [ ] **Step 3: Verify the existing tests still pass**

```bash
cd server && npm test
```

Expected: same test count as the baseline before this task, all passing.

- [ ] **Step 4: Pause for Dele to commit**

Do NOT run `git add` or `git commit` yourself. Stop and present this to Dele:

- Files changed: `server/src/types.ts`
- Suggested message: `feat(types): add ParsedDeck and ResolvedDeck`

Wait for explicit "commit" / "go" before starting Task 2.

---

## Task 2 — Manual decklist parser

A pure function that takes a multi-line string of pasted decklist text and returns `Omit<ParsedDeck, "source">`. No I/O. Deterministic. Heavily unit-tested for edge cases.

**Parser rules:**
- One card per line.
- Accepted line forms (case-sensitive on card name, case-insensitive on the qty marker `x`):
  - `1 Sol Ring`
  - `1x Sol Ring`
  - `Sol Ring` (qty defaults to 1)
  - `2 Forest`
  - `4x Forest`
- Blank lines: ignored.
- Lines starting with `//`: section markers. Recognize these (case-insensitive after the `//`):
  - `// Commander` or `// Commanders` → following lines (until next section marker or EOF) are commanders, not mainboard.
  - `// Sideboard`, `// Maybeboard`, `// Considering`, `// Acquireboard` → following lines are IGNORED (skip until next recognized section marker or EOF).
  - Any other `//` line: treat as a comment, ignore the line, do NOT change current section.
- Lines starting with `SB:` (Magic Online style sideboard prefix) are IGNORED.
- Trim whitespace on every line before parsing.
- Strip a trailing set/collector annotation in square brackets: `1 Sol Ring [CMM]` and `1 Sol Ring [CMM] 280` both parse as `Sol Ring`. Regex: replace `\s*\[[^\]]*\][^\n]*$` with empty.
- Strip a trailing `*F*`, `*E*`, `*P*` foil/etched/promo marker (Moxfield/Archidekt convention): `1 Sol Ring *F*` → `Sol Ring`. Regex on the trimmed line: replace `\s*\*[A-Za-z]+\*\s*$` with empty.
- After stripping annotations, a card line is considered valid only if the card-name portion contains MTG-like characters: letters, numbers, spaces, comma, apostrophe, period, colon, ampersand, slash, and hyphen. A line that does not satisfy that rule goes into `unresolved`.
- Default section is `mainboard` if the first non-blank, non-comment line is not preceded by a section marker.
- Aggregate duplicates: if the same name appears twice in mainboard, sum the qty (e.g. `1 Forest` + `3 Forest` → `{ name: "Forest", qty: 4 }`).
- Commander section duplicates: dedupe by exact name; quantity is ignored for commander entries because `ParsedDeck.commander` is `string[]`, not a counted list. The resulting commander list must contain at most 2 distinct names. If more than 2 distinct commanders are parsed, push the extras into `unresolved` with a `"too many commanders: <name>"` message.

**Files:**
- Create: `server/src/services/deck-parser.ts`
- Create: `server/src/services/deck-parser.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `server/src/services/deck-parser.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseManualDecklist } from "./deck-parser.js";

describe("parseManualDecklist", () => {
  it("parses a minimal mainboard-only decklist", () => {
    const result = parseManualDecklist("1 Sol Ring\n1 Forest\n");
    expect(result.commander).toEqual([]);
    expect(result.mainboard).toEqual([
      { name: "Sol Ring", qty: 1 },
      { name: "Forest", qty: 1 },
    ]);
    expect(result.unresolved).toEqual([]);
  });

  it("accepts qty-less, '1x', and '1 ' forms equivalently", () => {
    const result = parseManualDecklist("Sol Ring\n1x Mana Crypt\n1 Mox Diamond\n");
    expect(result.mainboard).toEqual([
      { name: "Sol Ring", qty: 1 },
      { name: "Mana Crypt", qty: 1 },
      { name: "Mox Diamond", qty: 1 },
    ]);
  });

  it("aggregates duplicate mainboard entries", () => {
    const result = parseManualDecklist("1 Forest\n3 Forest\n2x Forest\n");
    expect(result.mainboard).toEqual([{ name: "Forest", qty: 6 }]);
  });

  it("recognises a // Commander section", () => {
    const input = "// Commander\n1 Atraxa, Praetors' Voice\n// Mainboard\n1 Sol Ring\n";
    const result = parseManualDecklist(input);
    expect(result.commander).toEqual(["Atraxa, Praetors' Voice"]);
    expect(result.mainboard).toEqual([{ name: "Sol Ring", qty: 1 }]);
  });

  it("supports two commanders (partner)", () => {
    const input = "// Commanders\n1 Bruse Tarl, Boorish Herder\n1 Tymna the Weaver\n1 Sol Ring\n";
    const result = parseManualDecklist(input);
    expect(result.commander).toEqual([
      "Bruse Tarl, Boorish Herder",
      "Tymna the Weaver",
    ]);
    expect(result.mainboard).toEqual([{ name: "Sol Ring", qty: 1 }]);
  });

  it("flags more than 2 commanders as unresolved extras", () => {
    const input = "// Commander\n1 A\n1 B\n1 C\n";
    const result = parseManualDecklist(input);
    expect(result.commander).toEqual(["A", "B"]);
    expect(result.unresolved).toEqual(["too many commanders: C"]);
  });

  it("ignores Sideboard / Maybeboard / Considering sections", () => {
    const input = [
      "1 Sol Ring",
      "// Sideboard",
      "1 Force of Will",
      "// Maybeboard",
      "1 Mana Drain",
      "// Considering",
      "1 Demonic Tutor",
      "// Mainboard",
      "1 Forest",
    ].join("\n");
    const result = parseManualDecklist(input);
    expect(result.mainboard).toEqual([
      { name: "Sol Ring", qty: 1 },
      { name: "Forest", qty: 1 },
    ]);
  });

  it("ignores SB: prefixed lines", () => {
    const result = parseManualDecklist("1 Sol Ring\nSB: 1 Force of Will\n");
    expect(result.mainboard).toEqual([{ name: "Sol Ring", qty: 1 }]);
  });

  it("strips trailing [SET] and *F* annotations", () => {
    const input = "1 Sol Ring [CMM] 280\n1 Mana Crypt *F*\n2x Forest [LEA] 999 *E*\n";
    const result = parseManualDecklist(input);
    expect(result.mainboard).toEqual([
      { name: "Sol Ring", qty: 1 },
      { name: "Mana Crypt", qty: 1 },
      { name: "Forest", qty: 2 },
    ]);
  });

  it("ignores blank lines and unrecognised // comments", () => {
    const input = "\n// random comment\n1 Sol Ring\n\n// another comment\n1 Forest\n";
    const result = parseManualDecklist(input);
    expect(result.mainboard).toEqual([
      { name: "Sol Ring", qty: 1 },
      { name: "Forest", qty: 1 },
    ]);
  });

  it("collects unparseable lines into unresolved", () => {
    const input = "1 Sol Ring\nthis is not a card line @#$\n1 Forest\n";
    const result = parseManualDecklist(input);
    expect(result.mainboard).toEqual([
      { name: "Sol Ring", qty: 1 },
      { name: "Forest", qty: 1 },
    ]);
    expect(result.unresolved).toEqual(["this is not a card line @#$"]);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd server && npm test -- deck-parser
```

Expected: all tests fail with module-not-found or `parseManualDecklist is not a function`.

- [ ] **Step 3: Implement the parser**

Create `server/src/services/deck-parser.ts`:

```ts
import type { ParsedDeck } from "../types.js";

type ParseResult = Omit<ParsedDeck, "source">;

const LINE_RE = /^(?:(\d+)\s*x?\s+)?(.+?)$/i;
const CARD_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 ,.'&:/\-]*$/;
const ANNOTATION_BRACKET = /\s*\[[^\]]*\][^\n]*$/;
const ANNOTATION_FOIL = /\s*\*[A-Za-z]+\*\s*$/;

const COMMANDER_HEADERS = new Set(["commander", "commanders"]);
const IGNORE_HEADERS = new Set([
  "sideboard",
  "maybeboard",
  "considering",
  "acquireboard",
]);

type Section = "mainboard" | "commander" | "ignore";

/**
 * Parse a pasted decklist into a `ParsedDeck` minus its `source` discriminator.
 * Pure function. Deterministic. No I/O.
 */
export function parseManualDecklist(input: string): ParseResult {
  const commanderCounts = new Map<string, number>();
  const mainboardCounts = new Map<string, number>();
  const unresolved: string[] = [];

  let section: Section = "mainboard";

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "") continue;
    if (line.startsWith("SB:")) continue;

    if (line.startsWith("//")) {
      const header = line.slice(2).trim().toLowerCase();
      if (COMMANDER_HEADERS.has(header)) {
        section = "commander";
      } else if (IGNORE_HEADERS.has(header)) {
        section = "ignore";
      } else if (header === "mainboard" || header === "deck") {
        section = "mainboard";
      }
      // any other // line: leave section unchanged
      continue;
    }

    if (section === "ignore") continue;

    // Strip trailing set/collector and foil annotations before matching.
    const stripped = line.replace(ANNOTATION_BRACKET, "").replace(ANNOTATION_FOIL, "").trim();

    const match = LINE_RE.exec(stripped);
    if (!match || !match[2]) {
      unresolved.push(line);
      continue;
    }

    const qty = match[1] ? parseInt(match[1], 10) : 1;
    const name = match[2].trim();
    if (name === "" || qty <= 0 || !CARD_NAME_RE.test(name)) {
      unresolved.push(line);
      continue;
    }

    if (section === "commander") {
      commanderCounts.set(name, 1);
    } else {
      mainboardCounts.set(name, (mainboardCounts.get(name) ?? 0) + qty);
    }
  }

  const commanderNames = [...commanderCounts.keys()];
  const commander = commanderNames.slice(0, 2);
  for (const extra of commanderNames.slice(2)) {
    unresolved.push(`too many commanders: ${extra}`);
  }

  const mainboard = [...mainboardCounts.entries()].map(([name, qty]) => ({ name, qty }));

  return { commander, mainboard, unresolved };
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
cd server && npm test -- deck-parser
```

Expected: 11 tests passing in `deck-parser.test.ts`.

- [ ] **Step 5: Run the full suite**

```bash
cd server && npm test && npm run build
```

Expected: all tests pass, build clean.

- [ ] **Step 6: Pause for Dele to commit**

Do NOT run `git add` or `git commit` yourself. Stop and present this to Dele:

- Files changed: `server/src/services/deck-parser.ts`, `server/src/services/deck-parser.test.ts`
- Suggested message: `feat(deck-parser): manual decklist parser with section + annotation handling`

Wait for explicit "commit" / "go" before starting Task 3.

---

## Task 3 — Moxfield deck-fetch adapter (LIVE API VERIFICATION REQUIRED)

Add a function that takes a Moxfield deck URL or raw deck ID and returns `Omit<ParsedDeck, "source">`. Calls Moxfield's deck endpoint with the same Bearer auth as the library service.

### ⚠️ Verification step before writing code

The spec (Q2.2) flags this endpoint as unverified. **Before writing any production code in this task, do the following:**

1. Confirm `MOXFIELD_TOKEN` is set in your environment (it's the same token used by Phase 1.A).
2. Pick a known public Commander deck from `https://www.moxfield.com/` and grab its ID (the path segment after `/decks/`, e.g. `abc123XYZ`).
3. Run a probe (PowerShell or curl) to confirm the deck endpoint URL and response shape. The assumed URL is:

   ```
   https://api2.moxfield.com/v3/decks/all/<deckId>
   ```

   Probe (PowerShell):
   ```powershell
   $token = $env:MOXFIELD_TOKEN
   curl -H "Authorization: Bearer $token" -H "Accept: application/json" -H "User-Agent: lorevault/1.0" "https://api2.moxfield.com/v3/decks/all/<deckId>" | ConvertFrom-Json | ConvertTo-Json -Depth 4 | Select-String -Pattern "commander|mainboard|board" -Context 0,2
   ```

4. From the JSON, identify:
   - The exact path to commander entries. Likely `boards.commanders.cards` (a map keyed by some ID, where each value has `card.name` and `quantity`).
   - The exact path to mainboard entries. Likely `boards.mainboard.cards` with the same shape.
   - The card name field. Almost certainly `card.name`.
   - The quantity field. Almost certainly `quantity`.
   - Whether other boards (`maybeboard`, `sideboard`, `companions`, `signatureSpells`, etc.) exist and should be ignored. Per spec, `ParsedDeck.commander` is for the actual commander(s) only; do **not** merge companion or signature-spell style boards into `commander[]` in Phase 1.B.

5. **Document what you found** in a comment block at the top of `deck-parser.ts` (added in this task), AND adjust the implementation below if the assumed shape was wrong.

6. **If the endpoint returns 404 with the assumed URL,** try `https://api2.moxfield.com/v2/decks/all/<deckId>` and `https://api2.moxfield.com/v3/decks/<deckId>` as fallbacks. If none work, STOP and report — do not guess further; ask Dele.

7. **If you cannot run the probe** (no token, no internet, no public deck), STOP and ask Dele. Do not write speculative code.

### After verification, implement

**Files:**
- Modify: `server/src/services/deck-parser.ts`
- Modify: `server/src/services/deck-parser.test.ts`

- [ ] **Step 1: Add the URL/ID extractor (write tests first)**

Append to `server/src/services/deck-parser.test.ts`:

```ts
import { extractMoxfieldDeckId } from "./deck-parser.js";

describe("extractMoxfieldDeckId", () => {
  it("returns a bare ID unchanged", () => {
    expect(extractMoxfieldDeckId("abc123XYZ")).toBe("abc123XYZ");
  });

  it("extracts the ID from a full Moxfield URL", () => {
    expect(extractMoxfieldDeckId("https://www.moxfield.com/decks/abc123XYZ")).toBe("abc123XYZ");
  });

  it("extracts the ID from a URL with trailing slash and query", () => {
    expect(extractMoxfieldDeckId("https://moxfield.com/decks/abc123XYZ/?foo=bar")).toBe("abc123XYZ");
  });

  it("returns null for non-Moxfield URLs", () => {
    expect(extractMoxfieldDeckId("https://example.com/decks/abc")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(extractMoxfieldDeckId("")).toBeNull();
    expect(extractMoxfieldDeckId("   ")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd server && npm test -- deck-parser
```

- [ ] **Step 3: Implement `extractMoxfieldDeckId` in `deck-parser.ts`**

Add to `server/src/services/deck-parser.ts`:

```ts
const MOXFIELD_HOST_RE = /^(?:https?:\/\/)?(?:www\.)?moxfield\.com\/decks\/([A-Za-z0-9_-]+)/i;
const BARE_ID_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Accept either a Moxfield deck URL (any common form) or a bare deck ID.
 * Returns the ID, or `null` if the input is neither.
 */
export function extractMoxfieldDeckId(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const urlMatch = MOXFIELD_HOST_RE.exec(trimmed);
  if (urlMatch) return urlMatch[1];
  if (BARE_ID_RE.test(trimmed)) return trimmed;
  return null;
}
```

- [ ] **Step 4: Run, confirm passing, then write fetcher tests**

```bash
cd server && npm test -- deck-parser
```

Expected: 16 tests passing (11 from Task 2 + 5 new).

- [ ] **Step 5: Write tests for `fetchMoxfieldDeck`**

Append to `server/src/services/deck-parser.test.ts`:

```ts
import { vi, beforeEach, afterEach } from "vitest";
import { fetchMoxfieldDeck } from "./deck-parser.js";

describe("fetchMoxfieldDeck", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // Build a minimal Moxfield-shaped deck response.
  // ⚠️ ADJUST THIS HELPER if your live API verification revealed a different shape.
  function moxfieldDeckResponse(opts: {
    commanders?: Array<{ name: string; qty?: number }>;
    mainboard?: Array<{ name: string; qty?: number }>;
    companions?: Array<{ name: string; qty?: number }>;
  }): Response {
    const toCardsMap = (entries: Array<{ name: string; qty?: number }> = []) =>
      Object.fromEntries(
        entries.map((e, i) => [
          `id-${i}`,
          { quantity: e.qty ?? 1, card: { name: e.name } },
        ]),
      );

    const body = {
      boards: {
        commanders: { cards: toCardsMap(opts.commanders) },
        mainboard: { cards: toCardsMap(opts.mainboard) },
        companions: { cards: toCardsMap(opts.companions) },
      },
    };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  it("fetches a deck by ID and parses commander + mainboard", async () => {
    fetchSpy.mockImplementation(async () =>
      moxfieldDeckResponse({
        commanders: [{ name: "Atraxa, Praetors' Voice" }],
        mainboard: [
          { name: "Sol Ring", qty: 1 },
          { name: "Forest", qty: 5 },
        ],
      }),
    );

    const result = await fetchMoxfieldDeck({ idOrUrl: "abc123", token: "tok" });
    expect(result.commander).toEqual(["Atraxa, Praetors' Voice"]);
    expect(result.mainboard).toEqual([
      { name: "Sol Ring", qty: 1 },
      { name: "Forest", qty: 5 },
    ]);
    expect(result.unresolved).toEqual([]);
  });

  it("ignores companion boards rather than merging them into commander[]", async () => {
    fetchSpy.mockImplementation(async () =>
      moxfieldDeckResponse({
        commanders: [{ name: "Kaalia of the Vast" }],
        companions: [{ name: "Lutri, the Spellchaser" }],
        mainboard: [{ name: "Sol Ring" }],
      }),
    );

    const result = await fetchMoxfieldDeck({ idOrUrl: "abc123", token: "tok" });
    expect(result.commander).toEqual(["Kaalia of the Vast"]);
  });

  it("accepts a full Moxfield URL", async () => {
    fetchSpy.mockImplementation(async () =>
      moxfieldDeckResponse({ commanders: [{ name: "Edric" }], mainboard: [] }),
    );

    await fetchMoxfieldDeck({
      idOrUrl: "https://www.moxfield.com/decks/abc123",
      token: "tok",
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("/decks/all/abc123");
  });

  it("sends Bearer auth and the correct headers", async () => {
    fetchSpy.mockImplementation(async () =>
      moxfieldDeckResponse({ commanders: [{ name: "X" }], mainboard: [] }),
    );

    await fetchMoxfieldDeck({ idOrUrl: "abc123", token: "secret-token" });
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-token");
    expect(headers.Accept).toBe("application/json");
    expect(headers["User-Agent"]).toBe("lorevault/1.0");
  });

  it("throws MoxfieldError(401) on auth failure", async () => {
    fetchSpy.mockResolvedValue(new Response("nope", { status: 401, statusText: "Unauthorized" }));
    await expect(fetchMoxfieldDeck({ idOrUrl: "abc123", token: "tok" })).rejects.toMatchObject({
      name: "MoxfieldError",
      status: 401,
    });
  });

  it("throws MoxfieldError(502) on server error", async () => {
    fetchSpy.mockResolvedValue(new Response("nope", { status: 500, statusText: "Server Error" }));
    await expect(fetchMoxfieldDeck({ idOrUrl: "abc123", token: "tok" })).rejects.toMatchObject({
      name: "MoxfieldError",
      status: 502,
    });
  });

  it("throws MoxfieldError(400) for an unrecognised input", async () => {
    await expect(
      fetchMoxfieldDeck({ idOrUrl: "https://example.com/foo", token: "tok" }),
    ).rejects.toMatchObject({ name: "MoxfieldError", status: 400 });
  });
});
```

- [ ] **Step 6: Run to confirm failure**

```bash
cd server && npm test -- deck-parser
```

- [ ] **Step 7: Implement `fetchMoxfieldDeck`**

Append to `server/src/services/deck-parser.ts`:

```ts
import { MoxfieldError } from "./library.js";

const MOXFIELD_DECK_API = "https://api2.moxfield.com/v3/decks/all";
// ⚠️ Adjust the URL above if your live verification revealed a different path.

interface MoxfieldDeckCardEntry {
  quantity: number;
  card: { name: string };
}

interface MoxfieldDeckBoard {
  cards: Record<string, MoxfieldDeckCardEntry>;
}

interface MoxfieldDeckResponse {
  boards: {
    commanders?: MoxfieldDeckBoard;
    mainboard?: MoxfieldDeckBoard;
    companions?: MoxfieldDeckBoard;
    signatureSpells?: MoxfieldDeckBoard;
  };
}

function flattenBoard(board: MoxfieldDeckBoard | undefined): { name: string; qty: number }[] {
  if (!board || !board.cards) return [];
  const out: { name: string; qty: number }[] = [];
  for (const entry of Object.values(board.cards)) {
    if (!entry?.card?.name || typeof entry.quantity !== "number") continue;
    out.push({ name: entry.card.name, qty: entry.quantity });
  }
  return out;
}

/**
 * Fetch a Moxfield deck by URL or ID, returning a `Omit<ParsedDeck, "source">`.
 * Throws `MoxfieldError` on input/auth/server failure.
 *
 * NOTE: response shape is asserted at runtime only via `flattenBoard`'s field guards.
 * Before finalizing this implementation, replace the assumed board paths below with the exact structure observed in the required live API probe if they differ.
 */
export async function fetchMoxfieldDeck(opts: {
  idOrUrl: string;
  token: string;
}): Promise<ParseResult> {
  const id = extractMoxfieldDeckId(opts.idOrUrl);
  if (!id) {
    throw new MoxfieldError(`Not a recognised Moxfield deck URL or ID: ${opts.idOrUrl}`, 400);
  }

  let response: Response;
  try {
    response = await fetch(`${MOXFIELD_DECK_API}/${encodeURIComponent(id)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${opts.token}`,
        Accept: "application/json",
        "User-Agent": "lorevault/1.0",
      },
      redirect: "follow",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown network error";
    throw new MoxfieldError(`Failed to reach Moxfield API: ${message}`, 502);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new MoxfieldError("Invalid or expired auth token", 401);
    }
    throw new MoxfieldError(
      `Moxfield API error: ${response.status} ${response.statusText}`,
      502,
    );
  }

  let data: MoxfieldDeckResponse;
  try {
    data = (await response.json()) as MoxfieldDeckResponse;
  } catch {
    throw new MoxfieldError("Moxfield API returned invalid JSON", 502);
  }

  if (!data?.boards) {
    throw new MoxfieldError("Unexpected response structure from Moxfield deck API", 502);
  }

  const commanders = flattenBoard(data.boards.commanders);
  const companions = flattenBoard(data.boards.companions);
  const signatureSpells = flattenBoard(data.boards.signatureSpells);
  const mainboard = flattenBoard(data.boards.mainboard);

  // Phase 1.B keeps ParsedDeck.commander limited to the actual commander(s).
  // Ignore companion/signature-spell style boards even if the API exposes them.
  void companions;
  void signatureSpells;

  const commanderNames: string[] = [];
  for (const e of commanders) {
    if (!commanderNames.includes(e.name)) commanderNames.push(e.name);
  }

  return {
    commander: commanderNames,
    mainboard,
    unresolved: [],
  };
}
```

You will also need to widen the `MoxfieldError` status type. Open `server/src/services/library.ts` and change the constructor signature so `status` accepts `400 | 401 | 502`:

```ts
// In server/src/services/library.ts, change MoxfieldError to:
export class MoxfieldError extends Error {
  status: 400 | 401 | 502;
  constructor(message: string, status: 400 | 401 | 502) {
    super(message);
    this.name = "MoxfieldError";
    this.status = status;
  }
}
```

Then update `server/src/routes/collection.ts` line that casts `err.status as 401 | 502` to `err.status as 400 | 401 | 502`.

- [ ] **Step 8: Run all tests, confirm pass, build clean**

```bash
cd server && npm test && npm run build
```

Expected: all tests pass (deck-parser file now ~24 tests), build clean.

- [ ] **Step 9: Pause for Dele to commit**

Do NOT run `git add` or `git commit` yourself. Stop and present this to Dele:

- Files changed: `server/src/services/deck-parser.ts`, `server/src/services/deck-parser.test.ts`, `server/src/services/library.ts`, `server/src/routes/collection.ts`
- Suggested message: `feat(deck-parser): Moxfield deck-fetch adapter; widen MoxfieldError to 400`

Wait for explicit "commit" / "go" before starting Task 4.

---

## Task 4 — `parseDeck` service entry point

A thin wrapper that routes to the manual parser or Moxfield fetcher and tags the `source` discriminator.

**Files:**
- Modify: `server/src/services/deck-parser.ts`
- Modify: `server/src/services/deck-parser.test.ts`

- [ ] **Step 1: Write the tests**

Append to `server/src/services/deck-parser.test.ts`:

```ts
import { parseDeck } from "./deck-parser.js";

describe("parseDeck", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("dispatches manual source to the text parser and tags source", async () => {
    const result = await parseDeck({ source: "manual", payload: "1 Sol Ring\n", token: "tok" });
    expect(result.source).toBe("manual");
    expect(result.mainboard).toEqual([{ name: "Sol Ring", qty: 1 }]);
  });

  it("does not call fetch for manual source", async () => {
    await parseDeck({ source: "manual", payload: "1 Sol Ring\n", token: "tok" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("dispatches moxfield source to the deck fetcher and tags source", async () => {
    fetchSpy.mockImplementation(async () =>
      new Response(
        JSON.stringify({
          boards: {
            commanders: { cards: { a: { quantity: 1, card: { name: "Atraxa, Praetors' Voice" } } } },
            mainboard: { cards: { b: { quantity: 1, card: { name: "Sol Ring" } } } },
          },
        }),
        { status: 200 },
      ),
    );

    const result = await parseDeck({ source: "moxfield", payload: "abc123", token: "tok" });
    expect(result.source).toBe("moxfield");
    expect(result.commander).toEqual(["Atraxa, Praetors' Voice"]);
    expect(result.mainboard).toEqual([{ name: "Sol Ring", qty: 1 }]);
  });
});
```

- [ ] **Step 2: Confirm failure**

```bash
cd server && npm test -- deck-parser
```

- [ ] **Step 3: Implement**

Append to `server/src/services/deck-parser.ts`:

```ts
/**
 * Top-level entry point. Returns a fully-tagged `ParsedDeck`.
 * `token` is required for `source: "moxfield"` and ignored for `source: "manual"`.
 */
export async function parseDeck(opts: {
  source: "moxfield" | "manual";
  payload: string;
  token: string;
}): Promise<ParsedDeck> {
  if (opts.source === "manual") {
    const r = parseManualDecklist(opts.payload);
    return { source: "manual", ...r };
  }
  const r = await fetchMoxfieldDeck({ idOrUrl: opts.payload, token: opts.token });
  return { source: "moxfield", ...r };
}
```

- [ ] **Step 4: Run, build**

```bash
cd server && npm test && npm run build
```

Expected: all tests pass (deck-parser file ~27 tests), build clean.

- [ ] **Step 5: Pause for Dele to commit**

Do NOT run `git add` or `git commit` yourself. Stop and present this to Dele:

- Files changed: `server/src/services/deck-parser.ts`, `server/src/services/deck-parser.test.ts`
- Suggested message: `feat(deck-parser): unify manual + moxfield paths behind parseDeck`

Wait for explicit "commit" / "go" before starting Task 5.

---

## Task 5 — `resolveCard` with library hit + Scryfall fallback (LIVE API VERIFICATION REQUIRED)

`resolveCard(name, library)` returns a `Card` or `null`. Lookup order:

1. Owned-library hit — `library.get(name)?.printings[0]?.card`. Free, in-memory.
2. Per-process name cache — `Map<name, Card | null>`. Indefinite TTL (Oracle text is stable).
3. Scryfall named lookup — fall back to live API, map the result into the shared `Card` shape, populate the cache, return.
4. Optional Scryfall fuzzy fallback — only if the exact/named lookup misses and the spec-approved implementation chooses to support it.

A `null` cache entry is a NEGATIVE cache (we tried, the API said no). Subsequent calls for the same name skip the network.

### ⚠️ Verification step before writing code

The spec (Q2.1) flags this mapping as unverified. **Before writing any production code in this task:**

1. Choose the Scryfall endpoint strategy for fallback lookup. Recommended: exact/named lookup first, fuzzy fallback second only when necessary.
2. Probe with a known card (PowerShell or curl) and capture a representative response.
3. Identify in the JSON:
   - which Scryfall endpoint will be used for exact lookup;
   - whether a second fuzzy endpoint is needed at all;
   - how each required field maps into the project's shared `Card` type (`id, uniqueCardId, scryfall_id, set, set_name, name, cn, layout, cmc, type, type_line, oracle_text, mana_cost, power?, toughness?, colors, color_identity, rarity, prices`);
   - what defaults or transformations are needed where Scryfall does not match the existing shape exactly.
4. **Document what you found** in a comment at the top of `card-resolver.ts`. Adjust the implementation below to match the verified Scryfall shape.
5. **If you cannot verify**, STOP and ask Dele.

### After verification, implement

**Files:**
- Create: `server/src/services/card-resolver.ts`
- Create: `server/src/services/card-resolver.test.ts`

- [ ] **Step 1: Write the tests first**

Create `server/src/services/card-resolver.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { resolveCard, clearCardCache } from "./card-resolver.js";
import type { Card, CollectionItem, OwnedLibrary, OwnedCard } from "../types.js";

const TOKEN = "test-token";

function makeCard(overrides: Partial<Card> & { name: string }): Card {
  return {
    id: "card-id",
    uniqueCardId: "uniq",
    scryfall_id: "scry",
    set: "set",
    set_name: "Set Name",
    name: overrides.name,
    cn: "1",
    layout: "normal",
    cmc: 0,
    type: "Artifact",
    type_line: "Artifact",
    oracle_text: "",
    mana_cost: "",
    colors: [],
    color_identity: [],
    rarity: "common",
    prices: {},
    ...overrides,
  };
}

function makeItem(card: Card): CollectionItem {
  return { id: "item", quantity: 1, condition: "NearMint", card };
}

function libraryWith(...cards: Card[]): OwnedLibrary {
  const lib: OwnedLibrary = new Map();
  for (const c of cards) {
    const owned: OwnedCard = { name: c.name, printings: [makeItem(c)], totalQty: 1 };
    lib.set(c.name, owned);
  }
  return lib;
}

function searchResponse(cards: Card[]): Response {
  return new Response(JSON.stringify({ object: "list", has_more: false, data: cards }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("resolveCard", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearCardCache();
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("returns the card from the owned library without calling fetch", async () => {
    const sol = makeCard({ name: "Sol Ring" });
    const lib = libraryWith(sol);

    const result = await resolveCard("Sol Ring", { library: lib, token: TOKEN });
    expect(result).toBe(sol);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls back to Scryfall lookup on library miss", async () => {
    const sol = makeCard({ name: "Sol Ring" });
    fetchSpy.mockImplementation(async () => searchResponse([sol]));

    const result = await resolveCard("Sol Ring", { library: new Map(), token: TOKEN });
    expect(result?.name).toBe("Sol Ring");
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("prefers an exact name match when the API returns multiple results", async () => {
    const exact = makeCard({ name: "Lightning Bolt", scryfall_id: "exact" });
    const fuzzy = makeCard({ name: "Lightning Helix", scryfall_id: "fuzzy" });
    fetchSpy.mockImplementation(async () => searchResponse([fuzzy, exact]));

    const result = await resolveCard("Lightning Bolt", { library: new Map(), token: TOKEN });
    expect(result?.scryfall_id).toBe("exact");
  });

  it("falls back to the first result when no exact match", async () => {
    const a = makeCard({ name: "Alpha", scryfall_id: "first" });
    fetchSpy.mockImplementation(async () => searchResponse([a]));

    const result = await resolveCard("Different Name", { library: new Map(), token: TOKEN });
    expect(result?.scryfall_id).toBe("first");
  });

  it("returns null when the API returns an empty result set", async () => {
    fetchSpy.mockImplementation(async () => searchResponse([]));
    const result = await resolveCard("Made Up Card", { library: new Map(), token: TOKEN });
    expect(result).toBeNull();
  });

  it("caches positive results across calls (no second fetch)", async () => {
    const sol = makeCard({ name: "Sol Ring" });
    fetchSpy.mockImplementation(async () => searchResponse([sol]));

    await resolveCard("Sol Ring", { library: new Map(), token: TOKEN });
    await resolveCard("Sol Ring", { library: new Map(), token: TOKEN });
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("caches negative results across calls (no second fetch)", async () => {
    fetchSpy.mockImplementation(async () => searchResponse([]));
    await resolveCard("Made Up", { library: new Map(), token: TOKEN });
    await resolveCard("Made Up", { library: new Map(), token: TOKEN });
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("propagates MoxfieldError(401) on auth failure", async () => {
    fetchSpy.mockResolvedValue(new Response("nope", { status: 401, statusText: "Unauthorized" }));
    await expect(
      resolveCard("Sol Ring", { library: new Map(), token: TOKEN }),
    ).rejects.toMatchObject({ name: "MoxfieldError", status: 401 });
  });

  it("propagates MoxfieldError(502) on server error", async () => {
    fetchSpy.mockResolvedValue(new Response("nope", { status: 500, statusText: "Server Error" }));
    await expect(
      resolveCard("Sol Ring", { library: new Map(), token: TOKEN }),
    ).rejects.toMatchObject({ name: "MoxfieldError", status: 502 });
  });

  it("does NOT cache failed fetches", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("err", { status: 500, statusText: "S" }));
    await expect(
      resolveCard("Sol Ring", { library: new Map(), token: TOKEN }),
    ).rejects.toBeDefined();

    const sol = makeCard({ name: "Sol Ring" });
    fetchSpy.mockImplementation(async () => searchResponse([sol]));
    const result = await resolveCard("Sol Ring", { library: new Map(), token: TOKEN });
    expect(result?.name).toBe("Sol Ring");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Confirm failure**

```bash
cd server && npm test -- card-resolver
```

- [ ] **Step 3: Implement `card-resolver.ts`**

Create `server/src/services/card-resolver.ts`:

```ts
import type { Card, OwnedLibrary } from "../types.js";
import { MoxfieldError } from "./library.js";

const SCRYFALL_NAMED_API = "https://api.scryfall.com/cards/named";
// ⚠️ Adjust the endpoint strategy above if your live verification revealed a better exact/fuzzy split.

// Process-lifetime cache. Indefinite TTL — Oracle text is stable.
// Key = exact card name (case-sensitive). Value = Card or null (negative cache).
const cardCache = new Map<string, Card | null>();

/** Test-only: drop the entire card cache. */
export function clearCardCache(): void {
  cardCache.clear();
}

interface ScryfallCardLike {
  id: string;
  oracle_id?: string;
  name: string;
  set: string;
  set_name: string;
  collector_number: string;
  layout: string;
  cmc: number;
  type_line: string;
  oracle_text?: string;
  mana_cost?: string;
  power?: string;
  toughness?: string;
  colors?: string[];
  color_identity?: string[];
  rarity: string;
  prices?: {
    usd?: string | null;
    usd_foil?: string | null;
    eur?: string | null;
    eur_foil?: string | null;
    tix?: string | null;
  };
}

function toNumber(value?: string | null): number | undefined {
  if (value == null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function mapScryfallCard(card: ScryfallCardLike): Card {
  return {
    id: card.id,
    uniqueCardId: card.oracle_id ?? card.id,
    scryfall_id: card.id,
    set: card.set,
    set_name: card.set_name,
    name: card.name,
    cn: card.collector_number,
    layout: card.layout,
    cmc: card.cmc,
    type: card.type_line,
    type_line: card.type_line,
    oracle_text: card.oracle_text ?? "",
    mana_cost: card.mana_cost ?? "",
    power: card.power,
    toughness: card.toughness,
    colors: card.colors ?? [],
    color_identity: card.color_identity ?? [],
    rarity: card.rarity,
    prices: {
      usd: toNumber(card.prices?.usd),
      usd_foil: toNumber(card.prices?.usd_foil),
      eur: toNumber(card.prices?.eur),
      eur_foil: toNumber(card.prices?.eur_foil),
      tix: toNumber(card.prices?.tix),
    },
  };
}

async function searchScryfall(name: string): Promise<Card | null> {
  const url = `${SCRYFALL_NAMED_API}?exact=${encodeURIComponent(name)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": "lorevault/1.0",
      },
      redirect: "follow",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown network error";
    throw new MoxfieldError(`Failed to reach Moxfield API: ${message}`, 502);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new MoxfieldError("Invalid or expired auth token", 401);
    }
    throw new MoxfieldError(
      `Moxfield API error: ${response.status} ${response.statusText}`,
      502,
    );
  }

  let data: MoxfieldSearchResponse;
  try {
    data = (await response.json()) as MoxfieldSearchResponse;
  } catch {
    throw new MoxfieldError("Moxfield API returned invalid JSON", 502);
  }

  const results = Array.isArray(data?.data) ? data.data : [];
  if (results.length === 0) return null;

  const exact = results.find((c) => c?.name === name);
  return exact ?? results[0] ?? null;
}

/**
 * Resolve a card name to a `Card`, or `null` if unresolvable.
 * Lookup order: owned library → process cache → Scryfall lookup.
 */
export async function resolveCard(
  name: string,
  opts: { library: OwnedLibrary; token: string },
): Promise<Card | null> {
  const owned = opts.library.get(name);
  if (owned && owned.printings[0]) {
    return owned.printings[0].card;
  }

  if (cardCache.has(name)) {
    return cardCache.get(name) ?? null;
  }

  const found = await searchScryfall(name);
  cardCache.set(name, found);
  return found;
}
```

- [ ] **Step 4: Run, build**

```bash
cd server && npm test && npm run build
```

Expected: 10 tests in `card-resolver.test.ts`, all passing. Build clean.

- [ ] **Step 5: Pause for Dele to commit**

Do NOT run `git add` or `git commit` yourself. Stop and present this to Dele:

- Files changed: `server/src/services/card-resolver.ts`, `server/src/services/card-resolver.test.ts`
- Suggested message: `feat(card-resolver): library-first resolution with positive+negative cache`

Wait for explicit "commit" / "go" before starting Task 6.

---

## Task 6 — `resolveDeck` orchestrator

Takes a `ParsedDeck` + token, loads the owned library once, resolves every name via `resolveCard`, builds `ResolvedDeck`. Sequential resolution (concurrency optimization deferred to a follow-up — keeps this simple).

**Files:**
- Create: `server/src/services/deck-resolver.ts`
- Create: `server/src/services/deck-resolver.test.ts`

- [ ] **Step 1: Write the tests**

Create `server/src/services/deck-resolver.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { resolveDeck } from "./deck-resolver.js";
import { clearCardCache } from "./card-resolver.js";
import { clearLibraryCache } from "./library.js";
import type { Card, ParsedDeck } from "../types.js";

const TOKEN = "test-token";

function makeCard(name: string, scryfall_id = name.toLowerCase()): Card {
  return {
    id: name,
    uniqueCardId: name,
    scryfall_id,
    set: "set",
    set_name: "Set Name",
    name,
    cn: "1",
    layout: "normal",
    cmc: 0,
    type: "Artifact",
    type_line: "Artifact",
    oracle_text: "",
    mana_cost: "",
    colors: [],
    color_identity: [],
    rarity: "common",
    prices: {},
  };
}

// Build a Moxfield collection-search page response (matches the shape that
// library.ts's fetchAllPages consumes — see existing tests in library.test.ts).
function libraryPageResponse(items: { name: string; quantity?: number }[]): Response {
  return new Response(
    JSON.stringify({
      pageNumber: 1,
      pageSize: 5000,
      totalResults: items.length,
      totalPages: 1,
      data: items.map((it, i) => ({
        id: `lib-${i}`,
        quantity: it.quantity ?? 1,
        condition: "NearMint",
        finish: "Normal",
        card: makeCard(it.name),
      })),
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function searchResponse(cards: Card[]): Response {
  return new Response(JSON.stringify({ object: "list", has_more: false, data: cards }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("resolveDeck", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearCardCache();
    clearLibraryCache();
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("resolves commander and mainboard from owned library only", async () => {
    fetchSpy.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/collections/search")) {
        return libraryPageResponse([
          { name: "Atraxa, Praetors' Voice" },
          { name: "Sol Ring" },
          { name: "Forest", quantity: 5 },
        ]);
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const parsed: ParsedDeck = {
      source: "manual",
      commander: ["Atraxa, Praetors' Voice"],
      mainboard: [
        { name: "Sol Ring", qty: 1 },
        { name: "Forest", qty: 5 },
      ],
      unresolved: [],
    };

    const result = await resolveDeck(parsed, { token: TOKEN });

    expect(result.commander.map((c) => c.name)).toEqual(["Atraxa, Praetors' Voice"]);
    expect(result.mainboard).toHaveLength(2);
    expect(result.mainboard[0]!.card.name).toBe("Sol Ring");
    expect(result.mainboard[0]!.qty).toBe(1);
    expect(result.unresolved).toEqual([]);
  });

  it("falls back to Scryfall card lookup when library misses", async () => {
    fetchSpy.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/collections/search")) {
        return libraryPageResponse([{ name: "Sol Ring" }]); // library does not have Mana Crypt
      }
      if (url.includes("api.scryfall.com")) {
        return searchResponse([makeCard("Mana Crypt")]);
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const parsed: ParsedDeck = {
      source: "manual",
      commander: [],
      mainboard: [
        { name: "Sol Ring", qty: 1 },
        { name: "Mana Crypt", qty: 1 },
      ],
      unresolved: [],
    };

    const result = await resolveDeck(parsed, { token: TOKEN });
    expect(result.mainboard.map((m) => m.card.name).sort()).toEqual(["Mana Crypt", "Sol Ring"]);
  });

  it("collects names that resolve nowhere into unresolved[]", async () => {
    fetchSpy.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/collections/search")) return libraryPageResponse([]);
      if (url.includes("api.scryfall.com")) return searchResponse([]);
      throw new Error(`Unexpected URL: ${url}`);
    });

    const parsed: ParsedDeck = {
      source: "manual",
      commander: ["Made Up Commander"],
      mainboard: [{ name: "Also Fake", qty: 1 }],
      unresolved: [],
    };

    const result = await resolveDeck(parsed, { token: TOKEN });
    expect(result.commander).toEqual([]);
    expect(result.mainboard).toEqual([]);
    expect(result.unresolved.sort()).toEqual(["Also Fake", "Made Up Commander"]);
  });

  it("preserves parser-level unresolved entries from ParsedDeck", async () => {
    fetchSpy.mockImplementation(async () => libraryPageResponse([{ name: "Sol Ring" }]));

    const parsed: ParsedDeck = {
      source: "manual",
      commander: [],
      mainboard: [{ name: "Sol Ring", qty: 1 }],
      unresolved: ["garbage line"],
    };

    const result = await resolveDeck(parsed, { token: TOKEN });
    expect(result.unresolved).toEqual(["garbage line"]);
  });

  it("builds ownedMap with quantities from the owned library", async () => {
    fetchSpy.mockImplementation(async () =>
      libraryPageResponse([
        { name: "Sol Ring", quantity: 2 },
        { name: "Forest", quantity: 10 },
      ]),
    );

    const parsed: ParsedDeck = {
      source: "manual",
      commander: [],
      mainboard: [
        { name: "Sol Ring", qty: 1 },
        { name: "Forest", qty: 5 },
      ],
      unresolved: [],
    };

    const result = await resolveDeck(parsed, { token: TOKEN });
    expect(result.ownedMap.size).toBe(2);
    // ownedMap is keyed by scryfall_id; values are owned quantities (not deck qty).
    const solCard = result.mainboard.find((m) => m.card.name === "Sol Ring")!.card;
    expect(result.ownedMap.get(solCard.scryfall_id)).toBe(2);
  });

  it("does not include unowned cards in ownedMap", async () => {
    fetchSpy.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/collections/search")) return libraryPageResponse([{ name: "Sol Ring", quantity: 3 }]);
      if (url.includes("api.scryfall.com")) return searchResponse([makeCard("Mana Crypt")]);
      throw new Error(`Unexpected URL: ${url}`);
    });

    const parsed: ParsedDeck = {
      source: "manual",
      commander: [],
      mainboard: [
        { name: "Sol Ring", qty: 1 },
        { name: "Mana Crypt", qty: 1 },
      ],
      unresolved: [],
    };

    const result = await resolveDeck(parsed, { token: TOKEN });
    expect(result.ownedMap.size).toBe(1);
    const sol = result.mainboard.find((m) => m.card.name === "Sol Ring")!.card;
    expect(result.ownedMap.get(sol.scryfall_id)).toBe(3);
  });
});
```

- [ ] **Step 2: Confirm failure**

```bash
cd server && npm test -- deck-resolver
```

- [ ] **Step 3: Implement `deck-resolver.ts`**

Create `server/src/services/deck-resolver.ts`:

```ts
import type { ParsedDeck, ResolvedDeck, Card } from "../types.js";
import { getOwnedLibrary } from "./library.js";
import { resolveCard } from "./card-resolver.js";

/**
 * Orchestrate full deck resolution. Loads the owned library once, then
 * resolves every commander/mainboard name. Unresolved names accumulate.
 */
export async function resolveDeck(
  parsed: ParsedDeck,
  opts: { token: string },
): Promise<ResolvedDeck> {
  const { library } = await getOwnedLibrary({ token: opts.token });

  const commander: Card[] = [];
  const mainboard: { card: Card; qty: number }[] = [];
  const unresolved: string[] = [...parsed.unresolved];

  // Sequential resolution. Acceptable for v1 (~100 names @ network speed).
  // Concurrency cap is a deliberate Phase 1.B follow-up if it becomes a problem.
  for (const name of parsed.commander) {
    const card = await resolveCard(name, { library, token: opts.token });
    if (card) commander.push(card);
    else unresolved.push(name);
  }

  for (const { name, qty } of parsed.mainboard) {
    const card = await resolveCard(name, { library, token: opts.token });
    if (card) mainboard.push({ card, qty });
    else unresolved.push(name);
  }

  // Build ownedMap keyed by scryfall_id with owned (not deck) quantity.
  const ownedMap = new Map<string, number>();
  const allResolved: Card[] = [...commander, ...mainboard.map((m) => m.card)];
  for (const card of allResolved) {
    const owned = library.get(card.name);
    if (owned && owned.totalQty > 0) {
      ownedMap.set(card.scryfall_id, owned.totalQty);
    }
  }

  return { commander, mainboard, unresolved, ownedMap };
}
```

- [ ] **Step 4: Run, build**

```bash
cd server && npm test && npm run build
```

Expected: 6 new tests in `deck-resolver.test.ts`, all passing. Build clean.

- [ ] **Step 5: Pause for Dele to commit**

Do NOT run `git add` or `git commit` yourself. Stop and present this to Dele:

- Files changed: `server/src/services/deck-resolver.ts`, `server/src/services/deck-resolver.test.ts`
- Suggested message: `feat(deck-resolver): orchestrate library + card-resolver into ResolvedDeck`

Wait for explicit "commit" / "go" before starting Task 7.

---

## Task 7 — `POST /api/deck/parse` route

Thin route over `parseDeck`. Validates body shape, reads `MOXFIELD_TOKEN` (only required for `source: "moxfield"` inside this route contract), maps `MoxfieldError` to HTTP status, returns `ParsedDeck` JSON. Reminder: `server/src/index.ts` still requires `MOXFIELD_TOKEN` at process startup; do not change that behavior in this phase.

**Files:**
- Create: `server/src/routes/deck.ts`
- Create: `server/src/routes/deck.test.ts`

- [ ] **Step 1: Write the tests**

Create `server/src/routes/deck.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../services/deck-parser.js", () => ({
  parseDeck: vi.fn(),
}));

vi.mock("../services/deck-resolver.js", () => ({
  resolveDeck: vi.fn(),
}));

import { deck } from "./deck.js";
import { parseDeck } from "../services/deck-parser.js";
import { resolveDeck } from "../services/deck-resolver.js";
import { MoxfieldError } from "../services/library.js";

const mockParse = parseDeck as unknown as ReturnType<typeof vi.fn>;
const mockResolve = resolveDeck as unknown as ReturnType<typeof vi.fn>;

describe("POST /api/deck/parse", () => {
  beforeEach(() => {
    mockParse.mockReset();
    process.env.MOXFIELD_TOKEN = "test-token";
  });

  it("rejects invalid JSON body with 400", async () => {
    const res = await deck.request("/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("rejects missing source with 400", async () => {
    const res = await deck.request("/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: "1 Sol Ring" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects unknown source value with 400", async () => {
    const res = await deck.request("/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "tappedout", payload: "x" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects non-string payload with 400", async () => {
    const res = await deck.request("/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "manual", payload: 123 }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 500 when token is missing for moxfield source", async () => {
    delete process.env.MOXFIELD_TOKEN;
    const res = await deck.request("/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "moxfield", payload: "abc123" }),
    });
    expect(res.status).toBe(500);
  });

  it("does NOT require token for manual source", async () => {
    delete process.env.MOXFIELD_TOKEN;
    mockParse.mockResolvedValue({
      source: "manual",
      commander: [],
      mainboard: [],
      unresolved: [],
    });
    const res = await deck.request("/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "manual", payload: "1 Sol Ring" }),
    });
    expect(res.status).toBe(200);
  });

  it("forwards manual payload to parseDeck and returns the result", async () => {
    mockParse.mockResolvedValue({
      source: "manual",
      commander: [],
      mainboard: [{ name: "Sol Ring", qty: 1 }],
      unresolved: [],
    });
    const res = await deck.request("/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "manual", payload: "1 Sol Ring" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mainboard).toEqual([{ name: "Sol Ring", qty: 1 }]);
    expect(mockParse).toHaveBeenCalledWith({
      source: "manual",
      payload: "1 Sol Ring",
      token: "test-token",
    });
  });

  it("maps MoxfieldError(401) to a 401 response", async () => {
    mockParse.mockRejectedValueOnce(new MoxfieldError("Invalid or expired auth token", 401));
    const res = await deck.request("/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "moxfield", payload: "abc123" }),
    });
    expect(res.status).toBe(401);
  });

  it("maps MoxfieldError(400) to a 400 response", async () => {
    mockParse.mockRejectedValueOnce(new MoxfieldError("Bad input", 400));
    const res = await deck.request("/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "moxfield", payload: "garbage" }),
    });
    expect(res.status).toBe(400);
  });

  it("maps MoxfieldError(502) to a 502 response", async () => {
    mockParse.mockRejectedValueOnce(new MoxfieldError("upstream", 502));
    const res = await deck.request("/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "moxfield", payload: "abc123" }),
    });
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 2: Confirm failure**

```bash
cd server && npm test -- deck
```

- [ ] **Step 3: Implement `routes/deck.ts`**

Create `server/src/routes/deck.ts`:

```ts
import { Hono } from "hono";
import { parseDeck } from "../services/deck-parser.js";
import { MoxfieldError } from "../services/library.js";

const deck = new Hono();

interface ParseBody {
  source?: unknown;
  payload?: unknown;
}

deck.post("/parse", async (c) => {
  let body: ParseBody;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (body.source !== "manual" && body.source !== "moxfield") {
    return c.json({ error: 'source must be "manual" or "moxfield"' }, 400);
  }
  if (typeof body.payload !== "string") {
    return c.json({ error: "payload must be a string" }, 400);
  }

  const token = process.env.MOXFIELD_TOKEN ?? "";
  if (body.source === "moxfield" && token === "") {
    return c.json({ error: "Server missing MOXFIELD_TOKEN" }, 500);
  }

  try {
    const result = await parseDeck({
      source: body.source,
      payload: body.payload,
      token,
    });
    return c.json(result);
  } catch (err) {
    if (err instanceof MoxfieldError) {
      return c.json({ error: err.message }, err.status as 400 | 401 | 502);
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 502);
  }
});

export { deck };
```

- [ ] **Step 4: Run, build**

```bash
cd server && npm test && npm run build
```

Expected: 10 tests in `deck.test.ts`, all passing. Build clean.

- [ ] **Step 5: Pause for Dele to commit**

Do NOT run `git add` or `git commit` yourself. Stop and present this to Dele:

- Files changed: `server/src/routes/deck.ts`, `server/src/routes/deck.test.ts`
- Suggested message: `feat(routes): POST /api/deck/parse with input validation and error mapping`

Wait for explicit "commit" / "go" before starting Task 8.

---

## Task 8 — `POST /api/deck/resolve` route

Thin route over `resolveDeck`. Validates body shape (must look like a `ParsedDeck`), reads `MOXFIELD_TOKEN` (always required — `resolveDeck` always loads the owned library), maps `MoxfieldError`. The response includes `ownedMap` serialized as a plain object `{ scryfall_id: qty }` (a `Map` doesn't survive JSON.stringify). Reuse the two top-of-file `vi.mock(...)` declarations from Task 7; do not append new mocks below the imports.

**Files:**
- Modify: `server/src/routes/deck.ts`
- Modify: `server/src/routes/deck.test.ts`

- [ ] **Step 1: Write the tests**

Append to `server/src/routes/deck.test.ts`:

```ts
function makeCard(name: string, scryfall_id = name.toLowerCase()) {
  return {
    id: name,
    uniqueCardId: name,
    scryfall_id,
    set: "set",
    set_name: "Set Name",
    name,
    cn: "1",
    layout: "normal",
    cmc: 0,
    type: "Artifact",
    type_line: "Artifact",
    oracle_text: "",
    mana_cost: "",
    colors: [],
    color_identity: [],
    rarity: "common",
    prices: {},
  };
}

describe("POST /api/deck/resolve", () => {
  beforeEach(() => {
    mockResolve.mockReset();
    process.env.MOXFIELD_TOKEN = "test-token";
  });

  it("rejects invalid JSON body with 400", async () => {
    const res = await deck.request("/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("rejects body that is not a ParsedDeck shape", async () => {
    const res = await deck.request("/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "manual", commander: "not array" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 500 if token is missing", async () => {
    delete process.env.MOXFIELD_TOKEN;
    const res = await deck.request("/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "manual",
        commander: [],
        mainboard: [],
        unresolved: [],
      }),
    });
    expect(res.status).toBe(500);
  });

  it("forwards the ParsedDeck to resolveDeck and serializes ownedMap as object", async () => {
    const sol = makeCard("Sol Ring");
    const ownedMap = new Map<string, number>([["sol ring", 3]]);
    mockResolve.mockResolvedValue({
      commander: [],
      mainboard: [{ card: sol, qty: 1 }],
      unresolved: [],
      ownedMap,
    });

    const res = await deck.request("/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "manual",
        commander: [],
        mainboard: [{ name: "Sol Ring", qty: 1 }],
        unresolved: [],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mainboard[0].card.name).toBe("Sol Ring");
    expect(body.ownedMap).toEqual({ "sol ring": 3 });
    expect(mockResolve).toHaveBeenCalledOnce();
  });

  it("maps MoxfieldError(401) to a 401 response", async () => {
    mockResolve.mockRejectedValueOnce(new MoxfieldError("Invalid or expired auth token", 401));
    const res = await deck.request("/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "manual", commander: [], mainboard: [], unresolved: [] }),
    });
    expect(res.status).toBe(401);
  });

  it("maps MoxfieldError(502) to a 502 response", async () => {
    mockResolve.mockRejectedValueOnce(new MoxfieldError("upstream", 502));
    const res = await deck.request("/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "manual", commander: [], mainboard: [], unresolved: [] }),
    });
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 2: Confirm failure**

```bash
cd server && npm test -- deck
```

- [ ] **Step 3: Implement the `/resolve` handler**

Modify `server/src/routes/deck.ts` in two places:
1. Add these imports to the existing top-of-file import block:

```ts
import { resolveDeck } from "../services/deck-resolver.js";
import type { ParsedDeck } from "../types.js";
```

2. Append the helper + route handler below the existing `/parse` handler and before `export { deck };`:

```ts
function isParsedDeck(value: unknown): value is ParsedDeck {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.source !== "manual" && v.source !== "moxfield") return false;
  if (!Array.isArray(v.commander) || !v.commander.every((s) => typeof s === "string")) return false;
  if (!Array.isArray(v.mainboard)) return false;
  for (const entry of v.mainboard) {
    if (!entry || typeof entry !== "object") return false;
    const e = entry as Record<string, unknown>;
    if (typeof e.name !== "string" || typeof e.qty !== "number") return false;
  }
  if (!Array.isArray(v.unresolved) || !v.unresolved.every((s) => typeof s === "string")) return false;
  return true;
}

deck.post("/resolve", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!isParsedDeck(body)) {
    return c.json({ error: "Body must be a ParsedDeck" }, 400);
  }

  const token = process.env.MOXFIELD_TOKEN ?? "";
  if (token === "") {
    return c.json({ error: "Server missing MOXFIELD_TOKEN" }, 500);
  }

  try {
    const result = await resolveDeck(body, { token });
    // Map -> plain object for JSON serialization.
    const ownedMapObj: Record<string, number> = {};
    for (const [k, v] of result.ownedMap) ownedMapObj[k] = v;
    return c.json({
      commander: result.commander,
      mainboard: result.mainboard,
      unresolved: result.unresolved,
      ownedMap: ownedMapObj,
    });
  } catch (err) {
    if (err instanceof MoxfieldError) {
      return c.json({ error: err.message }, err.status as 400 | 401 | 502);
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 502);
  }
});
```

- [ ] **Step 4: Run, build**

```bash
cd server && npm test && npm run build
```

Expected: 6 new tests for `/resolve` (16 total in `deck.test.ts`), all passing. Build clean.

- [ ] **Step 5: Pause for Dele to commit**

Do NOT run `git add` or `git commit` yourself. Stop and present this to Dele:

- Files changed: `server/src/routes/deck.ts`, `server/src/routes/deck.test.ts`
- Suggested message: `feat(routes): POST /api/deck/resolve with ParsedDeck validation and ownedMap serialization`

Wait for explicit "commit" / "go" before starting Task 9.

---

## Task 9 — Mount the deck router

Wire `/api/deck` into the Hono app so the new endpoints are reachable.

**Files:**
- Modify: `server/src/index.ts`

- [ ] **Step 1: Add the import and route mount**

In `server/src/index.ts`, add an import next to the existing `collection` import:

```ts
import { deck } from "./routes/deck.js";
```

And mount it directly under the existing `app.route("/api/collection", collection);` line:

```ts
app.route("/api/collection", collection);
app.route("/api/deck", deck);
```

Do NOT change anything else in `index.ts` (env loading, CORS, static serving, server startup all stay as-is).

- [ ] **Step 2: Build & full test run**

```bash
cd server && npm run build && npm test
```

Expected:
- Build clean.
- All tests pass — including every prior Phase 1.A test (collection, library) AND every Phase 1.B test added in Tasks 1–8.
- The deck-parser, card-resolver, deck-resolver, and deck route test files all green.

If any pre-existing test breaks, STOP — Task 9 should be a pure additive change. Investigate before continuing.

- [ ] **Step 3: Manual smoke test (optional but recommended)**

With a valid `MOXFIELD_TOKEN` in `server/.env`, run:

```bash
cd server && npm run dev
```

In a separate shell:

```powershell
# Parse a tiny manual decklist
$body = @{ source = "manual"; payload = "1 Sol Ring`n1 Arcane Signet" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3001/api/deck/parse" -Method Post -ContentType "application/json" -Body $body
```

Expected: a JSON response with `source: "manual"`, `mainboard` containing the two entries, and `unresolved: []`.

Then chain the result into `/resolve`:

```powershell
$parsed = Invoke-RestMethod -Uri "http://localhost:3001/api/deck/parse" -Method Post -ContentType "application/json" -Body $body
Invoke-RestMethod -Uri "http://localhost:3001/api/deck/resolve" -Method Post -ContentType "application/json" -Body ($parsed | ConvertTo-Json -Depth 10)
```

Expected: a JSON response with `mainboard[].card` populated (full Scryfall-shaped objects), `unresolved` listing any names that didn't resolve, and `ownedMap` as a plain object.

If the smoke test fails but `npm test` passes, the most likely culprits are: (a) wrong route mount path, (b) `MOXFIELD_TOKEN` missing or expired for deck import, (c) the Scryfall endpoint or Scryfall-to-`Card` mapping differs from Q2.1's assumption (see Task 5).

- [ ] **Step 4: Pause for Dele to commit**

Do NOT run `git add` or `git commit` yourself. Stop and present this to Dele:

- Files changed: `server/src/index.ts`
- Suggested message: `feat(server): mount /api/deck router`

Wait for explicit "commit" / "go" before starting Task 10.

---

## Task 10 — Self-review & Phase 1.B handoff

No code changes. This task is a verification gate before declaring Phase 1.B complete.

- [ ] **Step 1: Spec coverage check**

Re-read `docs/superpowers/specs/2026-05-11-commander-deck-analyzer-design.md` §2 ("Deck Input Layer", lines ~75–122) and confirm every requirement is met:

- Manual decklist parsing (qty + name, sections, annotations) — Task 2
- Moxfield deck URL/ID ingestion — Task 3
- Unified `parseDeck` dispatcher — Task 4
- Card resolution against owned library + Scryfall fallback lookup — Task 5
- Full deck resolution with `ownedMap` keyed by `scryfall_id` — Task 6
- HTTP surface: `POST /api/deck/parse` and `POST /api/deck/resolve` — Tasks 7–9

If anything in the spec is unaddressed, STOP and report to Dele before continuing — do not silently extend the plan.

- [ ] **Step 2: Type & contract consistency**

```bash
cd server && npm run build
```

Confirm:
- No `any`, `as any`, or `// @ts-ignore` introduced.
- `ParsedDeck` and `ResolvedDeck` exported from `types.ts` and used consistently across services and routes.
- `MoxfieldError.status` is `400 | 401 | 502` everywhere it's referenced.

- [ ] **Step 3: Test suite green**

```bash
cd server && npm test
```

Confirm:
- All Phase 1.A tests still pass (no regressions in `library.ts`, `collection.ts`).
- New test counts (approximate): deck-parser ~26 (≈11 from Task 2 + 12 from Task 3 + 3 from Task 4), card-resolver ~10, deck-resolver ~6, deck routes ~16. Exact counts may differ slightly — what matters is zero failures.
- No skipped or `.only` tests left behind.

Stale `dist/**/*.test.js` artifacts may inflate the total by ~8 (pre-existing config quirk from Phase 1.A — ignore).

- [ ] **Step 4: Hard-rule audit**

Confirm the executor honored every hard rule:
- No commits made by the agent (every task ended with a Dele-controlled commit pause).
- No `--no-verify`, no `--amend`, no `rebase -i`, no `git config` changes.
- No secrets read, logged, or committed; `.env` untouched.
- No new dependencies added without explicit Dele approval.
- Lockfile unchanged (`server/package-lock.json` byte-identical to `main` at branch start).

- [ ] **Step 5: Phase 1.B summary for Dele**

Stop and present a summary to Dele containing:
- Total commits made on this branch (should be one per task pause that Dele approved — roughly 9).
- Test count delta vs. Phase 1.A baseline.
- Any spec questions that surfaced during execution (e.g. Q2.1 / Q2.2 actual API shape vs. assumption).
- Any deferred follow-ups discovered (analogous to the Phase 1.A code-review backlog).

Then ask Dele how to integrate the branch (merge, PR, etc.) — do NOT auto-merge. The `superpowers:finishing-a-development-branch` skill applies here.

---

## Execution handoff

This plan is designed to be executed in a fresh session (not the session that wrote it). Two execution modes are appropriate:

**Inline execution (recommended for this plan)** — A single agent works through Tasks 1 → 10 sequentially in one session, pausing at each "Pause for Dele to commit" step. This plan's tasks have ordering dependencies (Task 6 needs Task 5; Task 8 needs Task 7) and share files (`deck-parser.ts`, `routes/deck.ts`), so parallel execution would create merge conflicts.

**Subagent-driven execution** — Not recommended here. The `superpowers:subagent-driven-development` skill is best for plans with independent, non-shared-state tasks. Phase 1.B does not fit that shape.

Whichever mode is chosen, the executor MUST:
- Load `superpowers:test-driven-development` before starting any task that writes code.
- Load `superpowers:verification-before-completion` before claiming any task complete.
- Honor every "Pause for Dele to commit" step literally — never run `git add` or `git commit`.
- Stop and ask Dele if a hard rule conflicts with a step, or if a live-API verification step (Tasks 3 and 5) reveals the assumed Moxfield response shape is wrong.
