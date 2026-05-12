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

function scryfallCardResponse(card: Card): Response {
  return new Response(
    JSON.stringify({
      object: "card",
      id: card.scryfall_id,
      oracle_id: card.uniqueCardId,
      name: card.name,
      set: card.set,
      set_name: card.set_name,
      collector_number: card.cn,
      layout: card.layout,
      cmc: card.cmc,
      type_line: card.type_line,
      oracle_text: card.oracle_text,
      mana_cost: card.mana_cost,
      colors: card.colors,
      color_identity: card.color_identity,
      rarity: card.rarity,
      prices: {
        usd: card.prices.usd != null ? String(card.prices.usd) : null,
        usd_foil: card.prices.usd_foil != null ? String(card.prices.usd_foil) : null,
        eur: card.prices.eur != null ? String(card.prices.eur) : null,
        eur_foil: card.prices.eur_foil != null ? String(card.prices.eur_foil) : null,
        tix: card.prices.tix != null ? String(card.prices.tix) : null,
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
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
    { status: 404, headers: { "content-type": "application/json" } },
  );
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
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
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
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/collections/search")) {
        return libraryPageResponse([{ name: "Sol Ring" }]);
      }
      if (url.includes("api.scryfall.com")) {
        return scryfallCardResponse(makeCard("Mana Crypt"));
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
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/collections/search")) return libraryPageResponse([]);
      if (url.includes("api.scryfall.com")) return scryfallNotFound("missing");
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
    const solCard = result.mainboard.find((m) => m.card.name === "Sol Ring")!.card;
    expect(result.ownedMap.get(solCard.scryfall_id)).toBe(2);
  });

  it("does not include unowned cards in ownedMap", async () => {
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/collections/search")) {
        return libraryPageResponse([{ name: "Sol Ring", quantity: 3 }]);
      }
      if (url.includes("api.scryfall.com")) {
        return scryfallCardResponse(makeCard("Mana Crypt"));
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
    expect(result.ownedMap.size).toBe(1);
    const sol = result.mainboard.find((m) => m.card.name === "Sol Ring")!.card;
    expect(result.ownedMap.get(sol.scryfall_id)).toBe(3);
  });
});
