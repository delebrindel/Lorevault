import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { resolveCard, clearCardCache } from "./card-resolver.js";
import { clearScryfallCacheRows, createScryfallCache } from "./scryfall-cache.js";
import type { Card, CollectionItem, OwnedLibrary, OwnedCard } from "../types.js";

const TOKEN = "test-token";

function makeCard(overrides: Partial<Card> & { name: string }): Card {
  return {
    id: "card-id",
    uniqueCardId: "uniq",
    scryfall_id: "scry",
    set: "set",
    set_name: "Set Name",
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
    name: overrides.name,
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

function scryfallCardResponse(overrides: Record<string, unknown> & { name: string }): Response {
  return new Response(
    JSON.stringify({
      object: "card",
      id: "sf-id",
      oracle_id: "oracle-id",
      set: "set",
      set_name: "Set Name",
      collector_number: "1",
      layout: "normal",
      cmc: 1,
      type_line: "Artifact",
      oracle_text: "",
      mana_cost: "{1}",
      colors: [],
      color_identity: [],
      rarity: "common",
      prices: {
        usd: "1.23",
        usd_foil: null,
        eur: "2.34",
        eur_foil: null,
        tix: "0.05",
      },
      ...overrides,
      name: overrides.name,
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
}

function scryfallNotFound(name: string): Response {
  return new Response(
    JSON.stringify({
      object: "error",
      code: "not_found",
      status: 404,
      details: `No cards found matching “${name}”`,
    }),
    {
      status: 404,
      headers: { "content-type": "application/json" },
    },
  );
}

describe("resolveCard", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearCardCache();
    clearScryfallCacheRows();
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.useRealTimers();
  });

  it("returns the card from the owned library without calling fetch", async () => {
    const sol = makeCard({ name: "Sol Ring" });
    const lib = libraryWith(sol);

    const result = await resolveCard("Sol Ring", { library: lib, token: TOKEN });
    expect(result).toBe(sol);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls back to Scryfall exact lookup on library miss", async () => {
    fetchSpy.mockImplementation(async () => scryfallCardResponse({ name: "Sol Ring" }));

    const result = await resolveCard("Sol Ring", { library: new Map(), token: TOKEN });

    expect(result?.name).toBe("Sol Ring");
    expect(result?.uniqueCardId).toBe("oracle-id");
    expect(result?.scryfall_id).toBe("sf-id");
    expect(result?.prices.usd).toBe(1.23);
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(String(fetchSpy.mock.calls[0]![0])).toContain("https://api.scryfall.com/cards/named?exact=Sol%20Ring");
  });

  it("falls back to Scryfall fuzzy lookup when exact lookup 404s", async () => {
    fetchSpy
      .mockResolvedValueOnce(scryfallNotFound("Sol Ringg"))
      .mockResolvedValueOnce(scryfallCardResponse({ name: "Sol Ring" }));

    const result = await resolveCard("Sol Ringg", { library: new Map(), token: TOKEN });

    expect(result?.name).toBe("Sol Ring");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain("exact=Sol%20Ringg");
    expect(String(fetchSpy.mock.calls[1]![0])).toContain("fuzzy=Sol%20Ringg");
  });

  it("returns null when exact and fuzzy lookups both 404", async () => {
    fetchSpy
      .mockResolvedValueOnce(scryfallNotFound("Made Up Card"))
      .mockResolvedValueOnce(scryfallNotFound("Made Up Card"));

    const result = await resolveCard("Made Up Card", { library: new Map(), token: TOKEN });
    expect(result).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("caches positive results across calls (no second fetch)", async () => {
    fetchSpy.mockImplementation(async () => scryfallCardResponse({ name: "Sol Ring" }));

    await resolveCard("Sol Ring", { library: new Map(), token: TOKEN });
    await resolveCard("Sol Ring", { library: new Map(), token: TOKEN });
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("caches negative results across calls (no second fetch)", async () => {
    fetchSpy
      .mockResolvedValueOnce(scryfallNotFound("Made Up"))
      .mockResolvedValueOnce(scryfallNotFound("Made Up"));

    await resolveCard("Made Up", { library: new Map(), token: TOKEN });
    await resolveCard("Made Up", { library: new Map(), token: TOKEN });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("propagates MoxfieldError(502) on server error", async () => {
    fetchSpy.mockResolvedValue(new Response("nope", { status: 500, statusText: "Server Error" }));
    await expect(
      resolveCard("Sol Ring", { library: new Map(), token: TOKEN }),
    ).rejects.toMatchObject({ name: "MoxfieldError", status: 502 });
  });

  it("propagates MoxfieldError(502) on invalid JSON", async () => {
    fetchSpy.mockResolvedValue(new Response("not json", { status: 200, statusText: "OK" }));
    await expect(
      resolveCard("Sol Ring", { library: new Map(), token: TOKEN }),
    ).rejects.toMatchObject({ name: "MoxfieldError", status: 502 });
  });

  it("does NOT cache failed fetches", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("err", { status: 500, statusText: "S" }));
    await expect(
      resolveCard("Sol Ring", { library: new Map(), token: TOKEN }),
    ).rejects.toBeDefined();

    fetchSpy.mockImplementation(async () => scryfallCardResponse({ name: "Sol Ring" }));
    const result = await resolveCard("Sol Ring", { library: new Map(), token: TOKEN });
    expect(result?.name).toBe("Sol Ring");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("retries once after a 429 response using Retry-After", async () => {
    vi.useFakeTimers();
    fetchSpy
      .mockResolvedValueOnce(
        new Response("rate limited", {
          status: 429,
          statusText: "Too Many Requests",
          headers: { "Retry-After": "1" },
        }),
      )
      .mockResolvedValueOnce(scryfallCardResponse({ name: "Sol Ring" }));

    const promise = resolveCard("Sol Ring", { library: new Map(), token: TOKEN });

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    const result = await promise;

    expect(result?.name).toBe("Sol Ring");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("paces sequential Scryfall requests to avoid burst rate limits", async () => {
    vi.useFakeTimers();
    fetchSpy
      .mockResolvedValueOnce(scryfallCardResponse({ name: "First Card" }))
      .mockResolvedValueOnce(scryfallCardResponse({ name: "Second Card" }));

    const first = await resolveCard("First Card", { library: new Map(), token: TOKEN });
    expect(first?.name).toBe("First Card");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const secondPromise = resolveCard("Second Card", { library: new Map(), token: TOKEN });

    await vi.advanceTimersByTimeAsync(109);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    const second = await secondPromise;

    expect(second?.name).toBe("Second Card");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("returns a cached hit without calling Scryfall", async () => {
    const cache = createScryfallCache({ missTtlMs: 7 * 24 * 60 * 60 * 1000 });
    cache.storeHit({
      requestedName: "Cache Hit Test Card",
      resolutionMode: "exact",
      card: makeCard({ name: "Cache Hit Test Card" }),
      nowIso: "2026-05-13T12:00:00.000Z",
    });

    const result = await resolveCard("Cache Hit Test Card", { library: new Map(), token: TOKEN });

    expect(result?.name).toBe("Cache Hit Test Card");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns null for a fresh cached miss without calling Scryfall", async () => {
    const cache = createScryfallCache({ missTtlMs: 7 * 24 * 60 * 60 * 1000 });
    cache.storeMiss({
      requestedName: "Fresh Cached Miss Test Card",
      nowIso: new Date().toISOString(),
    });

    const result = await resolveCard("Fresh Cached Miss Test Card", { library: new Map(), token: TOKEN });

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refreshes a stale cached miss via live Scryfall", async () => {
    const cache = createScryfallCache({ missTtlMs: 1_000 });
    cache.storeMiss({
      requestedName: "Stale Cached Miss Test Card",
      nowIso: "2026-05-13T12:00:00.000Z",
    });

    fetchSpy.mockResolvedValueOnce(scryfallCardResponse({ name: "Stale Cached Miss Test Card" }));

    const result = await resolveCard("Stale Cached Miss Test Card", {
      library: new Map(),
      token: TOKEN,
    });

    expect(result?.name).toBe("Stale Cached Miss Test Card");
    expect(fetchSpy).toHaveBeenCalled();
  });

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
});
