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

function searchResponse(cards: Card[]): Response {
  return new Response(JSON.stringify({ hasMore: false, totalCards: cards.length, data: cards, ownedCards: [] }), {
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

  it("falls back to Moxfield card-search on library miss", async () => {
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
