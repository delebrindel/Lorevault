# Phase 1.A — Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract a cached `getOwnedLibrary()` server-side service that returns the entire Moxfield collection grouped by card name, and refactor `POST /api/collection` to consume it without changing its response shape.

**Architecture:** Pure-function service in `server/src/services/library.ts` owns paginated Moxfield fetching + an in-memory TTL cache. The existing route in `server/src/routes/collection.ts` becomes a thin consumer: call service → flatten library → apply existing color filter → map response. No client breakage; existing route tests stay green.

**Tech Stack:** TypeScript (ESM), Hono, Vitest, native `fetch`. No new dependencies.

**Spec section covered:** §1 (Data Layer) of `docs/superpowers/specs/2026-05-11-commander-deck-analyzer-design.md`.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `server/src/types.ts` | Modify | Add `OwnedCard` and `OwnedLibrary` types. Existing types unchanged. |
| `server/src/services/library.ts` | Create | Owns paginated Moxfield fetch, grouping-by-name, and TTL cache. Exports `getOwnedLibrary(opts)`, `clearLibraryCache()` (test helper). |
| `server/src/services/library.test.ts` | Create | Unit tests with mocked `fetch`: pagination, grouping, cache hit, cache TTL expiry, refresh bust, error propagation. |
| `server/src/routes/collection.ts` | Modify | Remove inline `fetchPage`. Route handler now calls `getOwnedLibrary`, flattens to `CollectionItem[]`, then runs existing `filterByColorIdentity` + `mapCardResponse`. Accepts `?refresh=true` query param. |
| `server/src/routes/collection.test.ts` | Modify | Existing pure-function tests unchanged. Add one route-level integration test (mocked library service) verifying `?refresh=true` is wired through. |

---

## Build order

Tasks are sequential. Each ends with a passing test + a commit. TDD throughout.

1. Add types
2. Create library service skeleton + first failing test (single-page fetch)
3. Make pagination work
4. Add name-based grouping
5. Add TTL cache
6. Add refresh bust + `clearLibraryCache` test helper
7. Refactor collection route to consume the service
8. Verify all existing tests still pass; add route-level wiring test

---

## Task 1 — Add types

- [ ] **Edit** `server/src/types.ts`. Append (at end of file, after existing exports):

  ```ts
  /**
   * A single owned card, identified by name, with all printings/finishes the user owns.
   * `totalQty` = sum of `quantity` across all `printings`.
   */
  export interface OwnedCard {
    name: string;
    printings: CollectionItem[];
    totalQty: number;
  }

  /**
   * The entire owned collection grouped by card name (case-sensitive, exact match).
   * Key = `OwnedCard.name`. DFC `//` and Alchemy `A-` prefixes are treated as distinct.
   */
  export type OwnedLibrary = Map<string, OwnedCard>;
  ```

- [ ] **Verify** types compile:

  ```bash
  npm run build --workspace server
  ```

  Expected: build succeeds, no new errors.

- [ ] **Commit:**

  ```bash
  git add server/src/types.ts
  git commit -m "feat(types): add OwnedCard and OwnedLibrary"
  ```

---

## Codebase notes (read before Task 2)

Verified by reading the actual files:

- **`CollectionItem` shape:** `{ id, quantity, condition, finish?, card }`. No `isFoil`, `isAlter`, or `isProxy` fields. The `card` is the full `Card` interface with required `id, uniqueCardId, scryfall_id, set, set_name, name, cn, layout, cmc, type, type_line, oracle_text, mana_cost, colors, color_identity, rarity, prices` plus optional `power, toughness`.
- **`MTG_COLORS`** is `Record<MtgColor, string>`, NOT a string array. Membership check: `Object.keys(MTG_COLORS).includes(c)` or `c in MTG_COLORS`.
- **Existing `fetchPage` in `server/src/routes/collection.ts`** uses `GET` (not POST) with a `URLSearchParams` query string carrying many fixed fields (`q, setId, deckId, rarity, condition, game, cardLanguageId, finish, isAlter, isProxy, tradeBinderId="none", playStyle="paperDollars", pricingProvider="cardkingdom", priceMinimum, priceMaximum, pageNumber, pageSize, sortType="cardName", sortDirection="ascending"`). Headers: `Authorization: Bearer ...`, `Accept: application/json`, `User-Agent: moxfield-app/1.0`. The service must replicate this request exactly.
- **Existing `fetchPage`** returns a discriminated union (`{ data } | { error, status }`) and maps 401/403 → 401, others → 502, network errors → 502, invalid JSON → 502. Our service throws a typed `MoxfieldError` (with `.status`) instead; the route catches and maps.
- **Existing route signature must be preserved:**
  - Method/path: `POST /api/collection`
  - Request body: `{ colors?: string[], colorless?: boolean }`
  - Per-color validation returns `400` with the existing error message format
  - Response on success: `{ totalResults, filteredCount, cards }`
  - `filterByColorIdentity(items, allowedColors, includeColorless)` — 3 args, do not change signature
  - `mapCardResponse(item)` — returns the exact existing shape (`set_code`, `collector_number`, `finish: String(item.finish ?? "Normal")`, etc.). Do not change.
- **Existing `collection.test.ts`** has a `makeItem(overrides, quantity?, finish?)` factory. Reuse the same pattern in `library.test.ts` so both files share the same shape conventions.
- **`getOwnedLibrary` returns** `{ library: OwnedLibrary; totalResults: number }` so the route can preserve its existing `totalResults` field. `totalResults` is the API-reported value from the most recent page fetched (matches existing route behavior).

---

## Task 2 — Library service skeleton + first failing test

Drives the API shape via TDD. First test covers a single-page fetch returning a populated `OwnedLibrary` with totalResults preserved.

- [ ] **Create** `server/src/services/library.test.ts`:

  ```ts
  import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
  import type { Card, CollectionItem } from "../types.js";
  import { clearLibraryCache, getOwnedLibrary, MoxfieldError } from "./library.js";

  const TOKEN = "test-token";

  /** Build a CollectionItem matching the project Card shape. */
  function makeItem(
    overrides: Partial<Card> & { name: string },
    quantity = 1,
    id = `item-${overrides.name}`,
    finish?: string,
  ): CollectionItem {
    return {
      id,
      quantity,
      condition: "NearMint",
      finish,
      card: {
        id: `card-${overrides.name}`,
        uniqueCardId: `uid-${overrides.name}`,
        scryfall_id: overrides.scryfall_id ?? `sf-${overrides.name}`,
        set: overrides.set ?? "set",
        set_name: overrides.set_name ?? "Test Set",
        name: overrides.name,
        cn: overrides.cn ?? "1",
        layout: overrides.layout ?? "normal",
        cmc: overrides.cmc ?? 1,
        type: overrides.type ?? "Creature",
        type_line: overrides.type_line ?? "Creature — Human",
        oracle_text: overrides.oracle_text ?? "",
        mana_cost: overrides.mana_cost ?? "{1}",
        power: overrides.power,
        toughness: overrides.toughness,
        colors: overrides.colors ?? [],
        color_identity: overrides.color_identity ?? [],
        rarity: overrides.rarity ?? "common",
        prices: overrides.prices ?? {},
      },
    };
  }

  function pageResponse(items: CollectionItem[], totalPages = 1, totalResults = items.length) {
    return new Response(
      JSON.stringify({
        pageNumber: 1,
        pageSize: 5000,
        totalResults,
        totalPages,
        data: items,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  describe("getOwnedLibrary", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      clearLibraryCache();
      fetchSpy = vi.spyOn(globalThis, "fetch");
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it("fetches a single page and returns an OwnedLibrary keyed by name", async () => {
      fetchSpy.mockResolvedValue(pageResponse([makeItem({ name: "Sol Ring" })]));

      const { library, totalResults } = await getOwnedLibrary({ token: TOKEN, ttlMs: 0 });

      expect(library.size).toBe(1);
      const sol = library.get("Sol Ring");
      expect(sol).toBeDefined();
      expect(sol!.totalQty).toBe(1);
      expect(sol!.printings).toHaveLength(1);
      expect(totalResults).toBe(1);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Verify the request shape matches the existing Moxfield contract.
      const [url, init] = fetchSpy.mock.calls[0]!;
      expect(String(url)).toContain("https://api2.moxfield.com/v1/collections/search");
      expect(String(url)).toContain("pageNumber=1");
      expect(String(url)).toContain("pageSize=5000");
      expect((init as RequestInit).method).toBe("GET");
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
      expect(headers["User-Agent"]).toBe("lorevault/1.0");
    });
  });
  ```

- [ ] **Create** `server/src/services/library.ts` with the minimal impl needed for the first test (pagination, cache, refresh come in later tasks):

  ```ts
  import type { CollectionItem, CollectionResponse, OwnedCard, OwnedLibrary } from "../types.js";

  const MOXFIELD_API = "https://api2.moxfield.com/v1/collections/search";
  const PAGE_SIZE = 5000;

  /** Thrown when Moxfield returns a non-OK response or invalid payload. */
  export class MoxfieldError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
      this.name = "MoxfieldError";
    }
  }

  export interface GetOwnedLibraryOptions {
    token: string;
    /** Cache TTL in ms. `0` disables caching. Default 600_000 (10 min). */
    ttlMs?: number;
    /** When true, bypass cache and force a fresh fetch. */
    refresh?: boolean;
  }

  export interface OwnedLibraryResult {
    library: OwnedLibrary;
    /** Last-page-reported total from the Moxfield API. */
    totalResults: number;
  }

  /** Test helper. Cleared by tests; no-op until Task 5 introduces caching. */
  export function clearLibraryCache(): void {
    /* implemented in Task 5 */
  }

  function buildPageUrl(page: number): string {
    const params = new URLSearchParams({
      q: "",
      setId: "",
      deckId: "",
      rarity: "",
      condition: "",
      game: "",
      cardLanguageId: "",
      finish: "",
      isAlter: "",
      isProxy: "",
      tradeBinderId: "none",
      playStyle: "paperDollars",
      pricingProvider: "cardkingdom",
      priceMinimum: "",
      priceMaximum: "",
      pageNumber: String(page),
      pageSize: String(PAGE_SIZE),
      sortType: "cardName",
      sortDirection: "ascending",
    });
    return `${MOXFIELD_API}?${params}`;
  }

  async function fetchPage(token: string, page: number): Promise<CollectionResponse> {
    let response: Response;
    try {
      response = await fetch(buildPageUrl(page), {
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

    let data: CollectionResponse;
    try {
      data = (await response.json()) as CollectionResponse;
    } catch {
      throw new MoxfieldError("Moxfield API returned invalid JSON", 502);
    }

    if (!Array.isArray(data?.data)) {
      throw new MoxfieldError("Unexpected response structure from Moxfield API", 502);
    }
    return data;
  }

  function groupByName(items: CollectionItem[]): OwnedLibrary {
    const lib: OwnedLibrary = new Map();
    for (const item of items) {
      const existing = lib.get(item.card.name);
      if (existing) {
        existing.printings.push(item);
        existing.totalQty += item.quantity;
      } else {
        const owned: OwnedCard = {
          name: item.card.name,
          printings: [item],
          totalQty: item.quantity,
        };
        lib.set(item.card.name, owned);
      }
    }
    return lib;
  }

  export async function getOwnedLibrary(opts: GetOwnedLibraryOptions): Promise<OwnedLibraryResult> {
    const first = await fetchPage(opts.token, 1);
    return { library: groupByName(first.data), totalResults: first.totalResults };
  }
  ```

- [ ] **Run** the test:

  ```bash
  cd server && npm test -- library
  ```

  Expected: 1 passing test in `library.test.ts`. Existing `collection.test.ts` tests (8) continue to pass.

- [ ] **Commit:**

  ```bash
  git add server/src/services/
  git commit -m "feat(library): add getOwnedLibrary service skeleton (single-page)"
  ```

---

## Task 3 — Pagination

Walk pages until either `totalPages` is reached or `MAX_PAGES` (50k cap) hits. Aggregate `totalResults` from the last page seen.

- [ ] **Edit** `server/src/services/library.ts`. Add constant after `PAGE_SIZE`:

  ```ts
  const MAX_PAGES = 10;
  ```

- [ ] **Add** these tests inside the `describe("getOwnedLibrary", ...)` block in `server/src/services/library.test.ts`:

  ```ts
  it("walks all pages until totalPages is reached", async () => {
    fetchSpy
      .mockResolvedValueOnce(pageResponse([makeItem({ name: "Card A" })], 3, 3))
      .mockResolvedValueOnce(pageResponse([makeItem({ name: "Card B" }, 2)], 3, 3))
      .mockResolvedValueOnce(pageResponse([makeItem({ name: "Card C" })], 3, 3));

    const { library, totalResults } = await getOwnedLibrary({ token: TOKEN, ttlMs: 0 });

    expect(library.size).toBe(3);
    expect(library.get("Card A")!.totalQty).toBe(1);
    expect(library.get("Card B")!.totalQty).toBe(2);
    expect(library.get("Card C")!.totalQty).toBe(1);
    expect(totalResults).toBe(3);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("stops at MAX_PAGES even if totalPages is higher", async () => {
    fetchSpy.mockImplementation(async () => {
      const idx = fetchSpy.mock.calls.length;
      return pageResponse([makeItem({ name: `Card ${idx}` })], 999, 999);
    });

    const { library } = await getOwnedLibrary({ token: TOKEN, ttlMs: 0 });

    expect(fetchSpy).toHaveBeenCalledTimes(10);
    expect(library.size).toBe(10);
  });
  ```

- [ ] **Replace** the `getOwnedLibrary` implementation in `server/src/services/library.ts` with the paginated version:

  ```ts
  export async function getOwnedLibrary(opts: GetOwnedLibraryOptions): Promise<OwnedLibraryResult> {
    const all: CollectionItem[] = [];
    const first = await fetchPage(opts.token, 1);
    all.push(...first.data);
    let totalResults = first.totalResults;

    const lastPage = Math.min(first.totalPages, MAX_PAGES);
    for (let page = 2; page <= lastPage; page++) {
      const next = await fetchPage(opts.token, page);
      all.push(...next.data);
      totalResults = next.totalResults;
    }

    return { library: groupByName(all), totalResults };
  }
  ```

- [ ] **Run** tests:

  ```bash
  cd server && npm test -- library
  ```

  Expected: 3 passing tests.

- [ ] **Commit:**

  ```bash
  git add server/src/services/
  git commit -m "feat(library): paginate Moxfield collection up to MAX_PAGES"
  ```

---

## Task 4 — Name-based grouping (multi-printing + DFC/Alchemy)

The single-printing path is exercised by Task 2. Lock the grouping invariants explicitly: multi-printing summing, DFC `//` distinctness, Alchemy `A-` distinctness.

- [ ] **Add** these tests inside the `describe("getOwnedLibrary", ...)` block:

  ```ts
  it("groups multiple printings of the same name into one OwnedCard", async () => {
    fetchSpy.mockResolvedValue(
      pageResponse([
        makeItem({ name: "Sol Ring" }, 1, "sol-cmd"),
        makeItem({ name: "Sol Ring" }, 2, "sol-2xm"),
        makeItem({ name: "Lightning Bolt" }, 4, "bolt-m11"),
      ]),
    );

    const { library } = await getOwnedLibrary({ token: TOKEN, ttlMs: 0 });

    expect(library.size).toBe(2);
    const sol = library.get("Sol Ring")!;
    expect(sol.printings).toHaveLength(2);
    expect(sol.totalQty).toBe(3);
    expect(library.get("Lightning Bolt")!.totalQty).toBe(4);
  });

  it("treats DFC // and Alchemy A- names as distinct keys", async () => {
    fetchSpy.mockResolvedValue(
      pageResponse([
        makeItem({ name: "Delver of Secrets // Insectile Aberration" }),
        makeItem({ name: "A-Lightning Bolt" }),
        makeItem({ name: "Lightning Bolt" }),
      ]),
    );

    const { library } = await getOwnedLibrary({ token: TOKEN, ttlMs: 0 });

    expect(library.size).toBe(3);
    expect(library.has("Delver of Secrets // Insectile Aberration")).toBe(true);
    expect(library.has("A-Lightning Bolt")).toBe(true);
    expect(library.has("Lightning Bolt")).toBe(true);
  });
  ```

- [ ] **Run** tests:

  ```bash
  cd server && npm test -- library
  ```

  Expected: 5 passing tests. No production code changes needed — `groupByName` already satisfies the spec.

- [ ] **Commit:**

  ```bash
  git add server/src/services/library.test.ts
  git commit -m "test(library): lock grouping behavior for printings + DFC/Alchemy"
  ```

---

## Task 5 — TTL cache

Per-token in-memory cache. Default TTL 10 min (600_000 ms). `ttlMs: 0` disables caching (already used by earlier tests).

- [ ] **Add** these tests inside the `describe("getOwnedLibrary", ...)` block:

  ```ts
  it("serves the second call from cache within TTL", async () => {
    fetchSpy.mockResolvedValue(pageResponse([makeItem({ name: "Sol Ring" })]));

    const r1 = await getOwnedLibrary({ token: TOKEN, ttlMs: 60_000 });
    const r2 = await getOwnedLibrary({ token: TOKEN, ttlMs: 60_000 });

    expect(r1).toBe(r2);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("refetches after TTL expires", async () => {
    vi.useFakeTimers();
    try {
      fetchSpy.mockResolvedValue(pageResponse([makeItem({ name: "Sol Ring" })]));

      await getOwnedLibrary({ token: TOKEN, ttlMs: 1000 });
      vi.advanceTimersByTime(1500);
      await getOwnedLibrary({ token: TOKEN, ttlMs: 1000 });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("caches per token (different tokens do not share cache)", async () => {
    fetchSpy.mockResolvedValue(pageResponse([makeItem({ name: "Sol Ring" })]));

    await getOwnedLibrary({ token: "token-a", ttlMs: 60_000 });
    await getOwnedLibrary({ token: "token-b", ttlMs: 60_000 });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
  ```

- [ ] **Edit** `server/src/services/library.ts`. Add the cache constants and storage near the top (after `MAX_PAGES`):

  ```ts
  const DEFAULT_TTL_MS = 10 * 60 * 1000;

  interface CacheEntry {
    result: OwnedLibraryResult;
    expiresAt: number;
  }

  const cache = new Map<string, CacheEntry>();
  ```

- [ ] **Replace** the `clearLibraryCache` placeholder with the real implementation:

  ```ts
  /** Test helper. Clears the in-memory cache. */
  export function clearLibraryCache(): void {
    cache.clear();
  }
  ```

- [ ] **Refactor** `getOwnedLibrary` to use the cache. The fetch logic moves into a private helper:

  ```ts
  async function fetchAllPages(token: string): Promise<OwnedLibraryResult> {
    const all: CollectionItem[] = [];
    const first = await fetchPage(token, 1);
    all.push(...first.data);
    let totalResults = first.totalResults;

    const lastPage = Math.min(first.totalPages, MAX_PAGES);
    for (let page = 2; page <= lastPage; page++) {
      const next = await fetchPage(token, page);
      all.push(...next.data);
      totalResults = next.totalResults;
    }
    return { library: groupByName(all), totalResults };
  }

  export async function getOwnedLibrary(opts: GetOwnedLibraryOptions): Promise<OwnedLibraryResult> {
    const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
    const now = Date.now();

    if (!opts.refresh && ttlMs > 0) {
      const hit = cache.get(opts.token);
      if (hit && hit.expiresAt > now) {
        return hit.result;
      }
    }

    const result = await fetchAllPages(opts.token);

    if (ttlMs > 0) {
      cache.set(opts.token, { result, expiresAt: now + ttlMs });
    }

    return result;
  }
  ```

- [ ] **Run** tests:

  ```bash
  cd server && npm test -- library
  ```

  Expected: 8 passing tests.

- [ ] **Commit:**

  ```bash
  git add server/src/services/
  git commit -m "feat(library): add per-token TTL cache (default 10 min)"
  ```

---

## Task 6 — Refresh bust + error propagation

`refresh: true` bypasses the cache and overwrites the entry. Errors propagate as `MoxfieldError` with the right status.

- [ ] **Add** these tests inside the `describe("getOwnedLibrary", ...)` block:

  ```ts
  it("refresh: true bypasses cache and refetches", async () => {
    fetchSpy.mockResolvedValue(pageResponse([makeItem({ name: "Sol Ring" })]));

    await getOwnedLibrary({ token: TOKEN, ttlMs: 60_000 });
    await getOwnedLibrary({ token: TOKEN, ttlMs: 60_000, refresh: true });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("refresh: true updates the cached entry for subsequent calls", async () => {
    fetchSpy
      .mockResolvedValueOnce(pageResponse([makeItem({ name: "Sol Ring" })]))
      .mockResolvedValueOnce(pageResponse([makeItem({ name: "Mana Crypt" })]));

    await getOwnedLibrary({ token: TOKEN, ttlMs: 60_000 });
    const refreshed = await getOwnedLibrary({ token: TOKEN, ttlMs: 60_000, refresh: true });
    const cached = await getOwnedLibrary({ token: TOKEN, ttlMs: 60_000 });

    expect(refreshed.library.has("Mana Crypt")).toBe(true);
    expect(cached).toBe(refreshed);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("throws MoxfieldError(401) on auth failure", async () => {
    fetchSpy.mockResolvedValue(new Response("nope", { status: 401, statusText: "Unauthorized" }));

    await expect(getOwnedLibrary({ token: TOKEN, ttlMs: 0 })).rejects.toMatchObject({
      name: "MoxfieldError",
      status: 401,
    });
  });

  it("throws MoxfieldError(502) on server error", async () => {
    fetchSpy.mockResolvedValue(new Response("nope", { status: 500, statusText: "Server Error" }));

    await expect(getOwnedLibrary({ token: TOKEN, ttlMs: 0 })).rejects.toMatchObject({
      name: "MoxfieldError",
      status: 502,
    });
  });
  ```

- [ ] **Run** tests:

  ```bash
  cd server && npm test -- library
  ```

  Expected: 12 passing tests. No production code changes — Task 5 already implemented `refresh`, and `fetchPage` already throws `MoxfieldError`.

- [ ] **Commit:**

  ```bash
  git add server/src/services/library.test.ts
  git commit -m "test(library): lock refresh-bust and MoxfieldError propagation"
  ```

---

## Task 7 — Refactor `collection` route to consume the service

Make the route a thin consumer. **Preserve every external aspect** of the current route (request body, color validation, response shape, `filterByColorIdentity` and `mapCardResponse` exports). Replace only the page-fetching internals with `getOwnedLibrary`. Add `?refresh=true` query param.

- [ ] **Edit** `server/src/routes/collection.ts`:
  - Remove the inline `fetchPage` helper, `MOXFIELD_API`, `PAGE_SIZE`, `MAX_PAGES` constants, and the per-page loop in the handler.
  - Keep `DEFAULT_FINISH`, `VALID_COLORS`, `filterByColorIdentity`, `mapCardResponse` exactly as they are.
  - Add `import { getOwnedLibrary, MoxfieldError } from "../services/library.js";`
  - Inside the POST handler, after color validation, replace the page-fetch loop with:

    ```ts
    const refresh = c.req.query("refresh") === "true";

    let totalResults: number;
    let allItems: CollectionItem[];
    try {
      const { library, totalResults: t } = await getOwnedLibrary({ token, refresh });
      totalResults = t;
      allItems = [];
      for (const owned of library.values()) {
        allItems.push(...owned.printings);
      }
    } catch (err) {
      if (err instanceof MoxfieldError) {
        return c.json({ error: err.message }, err.status as 401 | 502);
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      return c.json({ error: message }, 502);
    }

    const filtered = filterByColorIdentity(allItems, colors, includeColorless);

    return c.json({
      totalResults,
      filteredCount: filtered.length,
      cards: filtered.map(mapCardResponse),
    });
    ```

  - The final `collection.ts` should compile with no unused imports. `CollectionResponse` import is no longer needed; remove it.

- [ ] **Run** the full server test suite:

  ```bash
  cd server && npm test
  ```

  Expected: all `collection.test.ts` pure-function tests still pass (8); all `library.test.ts` tests still pass (12).

- [ ] **Run** the build to catch any type regressions:

  ```bash
  cd server && npm run build
  ```

- [ ] **Commit:**

  ```bash
  git add server/src/routes/collection.ts
  git commit -m "refactor(collection): consume getOwnedLibrary; wire ?refresh=true"
  ```

---

## Task 8 — Route-level wiring test

One integration-style test that mocks `getOwnedLibrary` and asserts: (a) `?refresh=true` is forwarded, (b) `MoxfieldError` from the service maps to the right HTTP status.

- [ ] **Edit** `server/src/routes/collection.test.ts`. Keep all existing tests untouched. At the top of the file, add (next to the existing imports):

  ```ts
  import { vi } from "vitest";
  vi.mock("../services/library.js", () => ({
    getOwnedLibrary: vi.fn(),
    MoxfieldError: class MoxfieldError extends Error {
      constructor(message: string, public status: number) {
        super(message);
        this.name = "MoxfieldError";
      }
    },
  }));

  import { collection } from "./collection.js";
  import { getOwnedLibrary, MoxfieldError } from "../services/library.js";
  ```

  Append a new `describe` block (and add `beforeEach` to the existing vitest import line if not present):

  ```ts
  describe("POST /api/collection (route wiring)", () => {
    const mockGet = getOwnedLibrary as unknown as ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockGet.mockReset();
      process.env.MOXFIELD_TOKEN = "test-token";
      mockGet.mockResolvedValue({ library: new Map(), totalResults: 0 });
    });

    it("forwards refresh=true to getOwnedLibrary", async () => {
      const res = await collection.request("/?refresh=true", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ colors: [], colorless: true }),
      });

      expect(res.status).toBe(200);
      expect(mockGet).toHaveBeenCalledWith(
        expect.objectContaining({ token: "test-token", refresh: true }),
      );
    });

    it("does not set refresh when query param is absent", async () => {
      await collection.request("/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ colors: [], colorless: true }),
      });

      expect(mockGet).toHaveBeenCalledWith(
        expect.objectContaining({ token: "test-token", refresh: false }),
      );
    });

    it("maps MoxfieldError(401) from the service to a 401 response", async () => {
      mockGet.mockRejectedValueOnce(new MoxfieldError("Invalid or expired auth token", 401));

      const res = await collection.request("/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ colors: [], colorless: true }),
      });

      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("Invalid or expired auth token");
    });
  });
  ```

- [ ] **Run** the full server test suite:

  ```bash
  cd server && npm test
  ```

  Expected: all tests pass (existing pure-function tests + library tests + 3 new wiring tests).

- [ ] **Run** the build:

  ```bash
  cd server && npm run build
  ```

- [ ] **Commit:**

  ```bash
  git add server/src/routes/collection.test.ts
  git commit -m "test(collection): add route-wiring tests for refresh and error mapping"
  ```

---
## Self-review checklist (run before handing off)

- [ ] Every task ends with a passing test command and an exact commit
- [ ] No placeholder code (`TODO`, `...`, `// implement here`)
- [ ] All file paths are absolute or workspace-relative and exist (or are explicitly created)
- [ ] Types added in Task 1 are referenced consistently in later tasks
- [ ] Existing `collection.test.ts` pure-function tests are not modified, only extended
- [ ] Spec §1 (Data Layer) requirements all covered: pagination ✓, name grouping ✓, TTL cache ✓, refresh bust ✓, route consumes service ✓
- [ ] No new dependencies introduced
- [ ] No changes to client code, public API response shape, or env-var contract

---

## Execution

Recommended: hand this plan to **superpowers:subagent-driven-development** so each task runs in an isolated context with a clean review checkpoint between tasks. Inline execution via **superpowers:executing-plans** also works if Dele prefers to drive interactively.

