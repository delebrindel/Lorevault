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
});
