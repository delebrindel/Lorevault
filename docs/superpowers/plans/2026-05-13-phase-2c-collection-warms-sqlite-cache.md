# Collection Warms SQLite Card Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `POST /api/collection` persist collection-derived exact-name card rows into the dev-local SQLite cache so later deck resolution can reuse those cards before falling back to cached/live Scryfall.

**Architecture:** Extend the existing SQLite cache service with a second table for collection-derived exact-name rows. Keep the resolver order explicit: owned library in memory first, then collection exact-name cache, then Scryfall fallback cache, then live Scryfall. Collection listing will upsert one representative row per exact card name while preserving the route’s existing response shape.

**Tech Stack:** TypeScript, existing Hono server, existing `better-sqlite3` SQLite cache, Vitest, dev-local DB at `server/.cache/scryfall-cache.db`.

---

## Implementation notes

- This plan assumes the current worktree already contains the Phase 2.B SQLite Scryfall cache service and the bounded-concurrency resolver changes.
- No new dependency is required for this slice; it extends the existing `better-sqlite3` usage.
- Keep collection-derived rows and Scryfall-derived rows logically separate in SQLite.
- Exact-name only for collection rows means **no normalized fallback** for collection-derived hits in this slice.
- The active git rules still prohibit creating commits unless the user explicitly asks, so this plan intentionally omits commit steps.
- The collection route must keep the same response shape and status behavior; warming SQLite is a side effect only.

## File map

### Existing files to modify
- `server/src/services/scryfall-cache.ts` — add collection cache table, lookup, and upsert APIs.
- `server/src/services/scryfall-cache.test.ts` — add collection-table schema and exact-name behavior tests.
- `server/src/services/card-resolver.ts` — add exact-name collection cache lookup between owned library and Scryfall fallback cache.
- `server/src/services/card-resolver.test.ts` — add resolver tests proving collection cache hits skip Scryfall and non-exact names do not.
- `server/src/routes/collection.ts` — upsert collection-derived rows during normal collection fetch flow.
- `server/src/routes/collection.test.ts` — verify collection route still returns the same shape while warming the cache.
- `server/scripts/clear-scryfall-cache.mjs` — ensure clearing the cache clears both tables cleanly.

### Existing files to verify but not redesign
- `server/src/services/library.ts`
- `server/src/services/deck-resolver.ts`
- `.gitignore`
- `server/package.json`

---

### Task 1: Extend the SQLite cache service with collection exact-name storage

**Files:**
- Modify: `server/src/services/scryfall-cache.ts`
- Modify: `server/src/services/scryfall-cache.test.ts`

- [ ] **Step 1: Add the failing collection-cache tests first**

Extend `server/src/services/scryfall-cache.test.ts` with tests for the new collection table behavior:

```ts
it("stores and returns a collection row by exact card name", () => {
  const cache = createScryfallCache({ dbPath, missTtlMs: 7 * 24 * 60 * 60 * 1000 });

  cache.upsertCollectionCard({
    cardNameExact: "Sol Ring",
    card: makeCard("Sol Ring"),
    quantityTotal: 3,
    finish: "Foil",
    sourceSetCode: "cmd",
    sourceCollectorNumber: "217",
    nowIso: "2026-05-13T12:00:00.000Z",
  });

  expect(cache.lookupCollectionCard("Sol Ring")).toEqual({
    kind: "collection-hit",
    card: expect.objectContaining({ name: "Sol Ring" }),
    quantityTotal: 3,
    finish: "Foil",
    sourceSetCode: "cmd",
    sourceCollectorNumber: "217",
  });
});

it("updates an existing collection row for the same exact card name", () => {
  const cache = createScryfallCache({ dbPath, missTtlMs: 7 * 24 * 60 * 60 * 1000 });

  cache.upsertCollectionCard({
    cardNameExact: "Sol Ring",
    card: makeCard("Sol Ring"),
    quantityTotal: 1,
    finish: "Normal",
    sourceSetCode: "old",
    sourceCollectorNumber: "1",
    nowIso: "2026-05-13T12:00:00.000Z",
  });

  cache.upsertCollectionCard({
    cardNameExact: "Sol Ring",
    card: makeCard("Sol Ring"),
    quantityTotal: 4,
    finish: "Foil",
    sourceSetCode: "new",
    sourceCollectorNumber: "99",
    nowIso: "2026-05-14T12:00:00.000Z",
  });

  expect(cache.lookupCollectionCard("Sol Ring")).toEqual({
    kind: "collection-hit",
    card: expect.objectContaining({ name: "Sol Ring" }),
    quantityTotal: 4,
    finish: "Foil",
    sourceSetCode: "new",
    sourceCollectorNumber: "99",
  });
});

it("does not return a collection row for a non-exact name", () => {
  const cache = createScryfallCache({ dbPath, missTtlMs: 7 * 24 * 60 * 60 * 1000 });

  cache.upsertCollectionCard({
    cardNameExact: "Sol Ring",
    card: makeCard("Sol Ring"),
    quantityTotal: 1,
    finish: "Normal",
    sourceSetCode: "cmd",
    sourceCollectorNumber: "217",
    nowIso: "2026-05-13T12:00:00.000Z",
  });

  expect(cache.lookupCollectionCard("sol ring")).toBeNull();
  expect(cache.lookupCollectionCard("  Sol Ring  ")).toBeNull();
});
```

- [ ] **Step 2: Run the cache-service tests to verify the new collection behavior fails first**

Run:

```bash
cd server && npm test -- src/services/scryfall-cache.test.ts
```

Expected:
- FAIL because `upsertCollectionCard()` / `lookupCollectionCard()` do not exist yet

- [ ] **Step 3: Add collection cache schema and API to `scryfall-cache.ts`**

Extend `server/src/services/scryfall-cache.ts` with a second table and exact-name lookup API.

Add a second table to the bootstrap SQL:

```ts
CREATE TABLE IF NOT EXISTS collection_card_cache (
  card_name_exact TEXT PRIMARY KEY,
  card_json TEXT NOT NULL,
  quantity_total INTEGER NOT NULL,
  finish TEXT,
  source_set_code TEXT,
  source_collector_number TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Add a lookup result type:

```ts
export type CollectionLookupResult = {
  kind: "collection-hit";
  card: Card;
  quantityTotal: number;
  finish: string | null;
  sourceSetCode: string | null;
  sourceCollectorNumber: string | null;
} | null;
```

Add prepared statements and methods:

```ts
lookupCollectionCard(cardNameExact: string): CollectionLookupResult
upsertCollectionCard(args: {
  cardNameExact: string;
  card: Card;
  quantityTotal: number;
  finish: string | null;
  sourceSetCode: string | null;
  sourceCollectorNumber: string | null;
  nowIso: string;
}): void
```

Implementation rules:
- exact-name only
- no normalization for collection rows
- upsert must replace existing row for the same exact name
- keep `created_at` for first insert, `updated_at` for subsequent updates if practical; if not, using a full replace with the new timestamps is acceptable for this first slice

Also extend the cache clearer to wipe both tables:

```ts
export function clearScryfallCacheRows(dbPath = DEFAULT_DB_PATH): void {
  const database = getDb(dbPath);
  database.prepare("DELETE FROM scryfall_name_cache").run();
  database.prepare("DELETE FROM collection_card_cache").run();
}
```

- [ ] **Step 4: Re-run the cache-service tests and verify they pass**

Run:

```bash
cd server && npm test -- src/services/scryfall-cache.test.ts
```

Expected:
- PASS

---

### Task 2: Add collection-cache lookup into the resolver order

**Files:**
- Modify: `server/src/services/card-resolver.ts`
- Modify: `server/src/services/card-resolver.test.ts`

- [ ] **Step 1: Add failing resolver tests for collection-cache exact-name hits**

Extend `server/src/services/card-resolver.test.ts` with tests like:

```ts
it("returns a collection-cache hit without calling Scryfall", async () => {
  const cache = createScryfallCache({ missTtlMs: 7 * 24 * 60 * 60 * 1000 });
  cache.upsertCollectionCard({
    cardNameExact: "Collection Cached Card",
    card: makeCard({ name: "Collection Cached Card" }),
    quantityTotal: 2,
    finish: "Normal",
    sourceSetCode: "set",
    sourceCollectorNumber: "1",
    nowIso: "2026-05-13T12:00:00.000Z",
  });

  const result = await resolveCard("Collection Cached Card", { library: new Map(), token: TOKEN });

  expect(result?.name).toBe("Collection Cached Card");
  expect(fetchSpy).not.toHaveBeenCalled();
});

it("does not use collection cache for non-exact names", async () => {
  const cache = createScryfallCache({ missTtlMs: 7 * 24 * 60 * 60 * 1000 });
  cache.upsertCollectionCard({
    cardNameExact: "Sol Ring",
    card: makeCard({ name: "Sol Ring" }),
    quantityTotal: 1,
    finish: "Normal",
    sourceSetCode: "set",
    sourceCollectorNumber: "1",
    nowIso: "2026-05-13T12:00:00.000Z",
  });

  fetchSpy.mockResolvedValueOnce(scryfallCardResponse({ name: "sol ring" }));

  const result = await resolveCard("sol ring", { library: new Map(), token: TOKEN });

  expect(result?.name).toBe("sol ring");
  expect(fetchSpy).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the resolver tests to verify they fail first**

Run:

```bash
cd server && npm test -- src/services/card-resolver.test.ts
```

Expected:
- FAIL because `resolveCard()` does not yet consult the collection cache table

- [ ] **Step 3: Update `card-resolver.ts` to check collection cache before Scryfall cache/live fallback**

Modify the resolver order inside `resolveCard()` to:

```ts
const owned = opts.library.get(name);
if (owned && owned.printings[0]) return owned.printings[0].card;

const collectionCached = scryfallCache.lookupCollectionCard(name);
if (collectionCached) {
  console.log(`[collection-cache] hit ${name}`);
  cardCache.set(name, collectionCached.card);
  return collectionCached.card;
}

// existing process cache / sqlite scryfall cache / live scryfall path continues
```

Keep these constraints:
- exact-name only for collection rows
- do not change the Scryfall cache ordering after the collection lookup
- do not remove or redesign the in-memory process cache in this slice

Recommended final order in `resolveCard()`:
1. owned library
2. collection exact-name SQLite cache
3. in-memory process cache
4. SQLite Scryfall fallback cache
5. live Scryfall

This is acceptable even though the process cache moves after collection lookup, because collection-derived rows are intended to be authoritative for exact-name warming in this slice.

- [ ] **Step 4: Re-run resolver tests and verify they pass**

Run:

```bash
cd server && npm test -- src/services/card-resolver.test.ts
```

Expected:
- PASS

---

### Task 3: Make `/api/collection` upsert collection-derived exact-name rows without changing the response shape

**Files:**
- Modify: `server/src/routes/collection.ts`
- Modify: `server/src/routes/collection.test.ts`
- Use: `server/src/services/scryfall-cache.ts`

- [ ] **Step 1: Add failing collection-route tests for cache warming side effects**

Extend `server/src/routes/collection.test.ts` with a route-side effect test.

Pattern:
- mock `getOwnedLibrary()` to return a library containing a known card
- hit `POST /api/collection`
- assert response status/body stays the same
- assert SQLite collection lookup now returns the upserted exact-name row

Example test shape:

```ts
it("warms the collection cache while preserving the response shape", async () => {
  const item = makeItem({ color_identity: [], name: "Sol Ring" }, 2, "Foil");
  const library = new Map([
    ["Sol Ring", { name: "Sol Ring", printings: [item], totalQty: 2 }],
  ]);

  mockGet.mockResolvedValueOnce({ library, totalResults: 1 });

  const res = await collection.request("/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ colors: [], colorless: true }),
  });

  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.filteredCount).toBe(1);
  expect(body.cards[0].name).toBe("Sol Ring");

  const cache = createScryfallCache({ missTtlMs: 7 * 24 * 60 * 60 * 1000 });
  expect(cache.lookupCollectionCard("Sol Ring")).toEqual(
    expect.objectContaining({
      kind: "collection-hit",
      quantityTotal: 2,
      finish: "Foil",
    }),
  );
});
```

Also add a test proving duplicate exact-name rows upsert to the latest aggregate quantity rather than producing conflicting state.

- [ ] **Step 2: Run the collection-route tests to verify they fail first**

Run:

```bash
cd server && npm test -- src/routes/collection.test.ts
```

Expected:
- FAIL because the route does not yet write into the collection cache table

- [ ] **Step 3: Add collection-cache upserts to `collection.ts`**

Import the cache service:

```ts
import { createScryfallCache } from "../services/scryfall-cache.js";
```

Create one shared cache instance near the top of the file:

```ts
const scryfallCache = createScryfallCache({ missTtlMs: 7 * 24 * 60 * 60 * 1000 });
```

After `allItems` is built from the owned library values, upsert one representative row per exact card name:

```ts
const nowIso = new Date().toISOString();
const seenNames = new Set<string>();
for (const item of allItems) {
  const exactName = item.card.name;
  if (seenNames.has(exactName)) continue;
  seenNames.add(exactName);

  const owned = library.get(exactName);
  scryfallCache.upsertCollectionCard({
    cardNameExact: exactName,
    card: item.card,
    quantityTotal: owned?.totalQty ?? item.quantity,
    finish: item.finish != null ? String(item.finish) : null,
    sourceSetCode: item.card.set,
    sourceCollectorNumber: item.card.cn,
    nowIso,
  });
}
console.log(`[collection-cache] upsert batch ${seenNames.size}`);
```

Rules for this step:
- preserve the existing response body shape exactly
- do not change color filtering behavior
- do not add API response fields
- store one row per exact name only

- [ ] **Step 4: Re-run collection-route tests and verify they pass**

Run:

```bash
cd server && npm test -- src/routes/collection.test.ts
```

Expected:
- PASS

---

### Task 4: Make cache clearing and verification cover both Scryfall and collection-warmed rows

**Files:**
- Modify: `server/scripts/clear-scryfall-cache.mjs`
- Verify: `server/src/services/scryfall-cache.ts`

- [ ] **Step 1: Add a failing test or verification expectation for clearing both tables**

If you keep this slice test-light here, at minimum verify through `scryfall-cache.test.ts` or a small integration case that `clearScryfallCacheRows()` removes both:
- `scryfall_name_cache`
- `collection_card_cache`

- [ ] **Step 2: Ensure the clear script removes or clears both cache tables**

If the DB file can be removed, the script already clears everything. If the file is locked and the script falls back to row deletion, update it so it deletes rows from both tables:

```js
db.prepare("DELETE FROM scryfall_name_cache").run();
db.prepare("DELETE FROM collection_card_cache").run();
```

- [ ] **Step 3: Verify the clear script succeeds while the dev server is running**

Run:

```bash
cd server && npm run cache:clear:scryfall
```

Expected:
- PASS
- either removes the DB file or clears rows in both tables when Windows holds a lock

---

### Task 5: Full verification and manual performance check

**Files:**
- Verify only: all modified server files plus existing client Analyzer files

- [ ] **Step 1: Run the full server test suite**

Run:

```bash
cd server && npm test
```

Expected:
- PASS

- [ ] **Step 2: Run the full repo build**

Run:

```bash
cd .. && npm run build
```

Expected:
- PASS for both server and client builds

- [ ] **Step 3: Start the worktree app on the normal ports**

Run:

```bash
cd D:/node/lorevault/.worktrees/phase-2a-analyzer-ui-mvp && npm run dev
```

Expected:
- backend at `http://localhost:3001`
- frontend at `http://localhost:5173`

- [ ] **Step 4: Clear the cache and warm it through the collection route**

Run:

```bash
cd D:/node/lorevault/.worktrees/phase-2a-analyzer-ui-mvp/server && npm run cache:clear:scryfall
```

Then hit collection once, either through the browser or a direct request:

```bash
curl -X POST http://localhost:3001/api/collection \
  -H "Content-Type: application/json" \
  -d '{"colors":[],"colorless":true}'
```

Expected:
- request succeeds
- collection response shape is unchanged
- server logs show collection-cache upsert activity

- [ ] **Step 5: Verify later resolve requests reuse collection-warmed exact-name cards**

Use a manual resolve payload with exact card names you know exist in the collection.

Example:

```json
{
  "source": "manual",
  "commander": [],
  "mainboard": [
    { "name": "Sol Ring", "qty": 1 },
    { "name": "Arcane Signet", "qty": 1 }
  ],
  "unresolved": []
}
```

Expected:
- resolve succeeds
- server logs show `[collection-cache] hit ...` for exact-name cards already warmed via `/api/collection`
- fewer/no Scryfall lookups occur for those names

- [ ] **Step 6: Verify non-exact names still fall through**

Try a payload using a non-exact variant such as lowercase or spacing differences when practical.

Expected:
- collection exact-name cache is not used
- resolver falls through to existing Scryfall cache/live behavior as designed

- [ ] **Step 7: Capture completion evidence in the final report**

Before claiming success, report:
- exact commands run
- actual PASS/FAIL results
- scope verified
- any remaining unverified areas

This is required before saying the slice is complete.

---

## Spec coverage self-review

- **same SQLite DB, separate source/table:** Task 1 extends the current DB with `collection_card_cache` instead of folding into Scryfall rows.
- **upsert every collection row on listing:** Task 3 explicitly upserts collection-derived rows during normal `/api/collection` fetches.
- **exact-name only for collection rows:** Task 1 and Task 2 enforce exact-name lookup with a non-exact miss test.
- **resolver order `owned -> collection cache -> scryfall cache -> live scryfall`:** Task 2 makes this explicit.
- **store canonical card JSON + metadata:** Task 1 stores resolver-facing `Card` JSON plus quantity/finish/source metadata.
- **response shape unchanged:** Task 3 adds route-side warming without contract changes and verifies that behavior.
- **clear both tables:** Task 4 ensures the dev clear script covers both cache tables.
- **no placeholders:** all tasks include exact files, commands, and expected outcomes.

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-13-phase-2c-collection-warms-sqlite-cache.md` in the active worktree.

Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?