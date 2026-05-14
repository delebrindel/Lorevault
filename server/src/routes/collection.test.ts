import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../services/library.js", () => ({
  getOwnedLibrary: vi.fn(),
  MoxfieldError: class MoxfieldError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = "MoxfieldError";
      this.status = status;
    }
  },
}));

import { collection, filterByColorIdentity, mapCardResponse } from "./collection.js";
import { getOwnedLibrary, MoxfieldError } from "../services/library.js";
import { clearScryfallCacheRows, createScryfallCache } from "../services/scryfall-cache.js";
import type { CollectionItem, Card, MtgColor, OwnedCard, OwnedLibrary } from "../types.js";

/** Helper to build a minimal CollectionItem for testing. */
function makeItem(
  overrides: Partial<Card> & { color_identity: string[] },
  quantity = 1,
  finish?: string,
): CollectionItem {
  return {
    id: "item-1",
    quantity,
    condition: "NearMint",
    finish,
    card: {
      id: "card-1",
      uniqueCardId: "uid-1",
      scryfall_id: overrides.scryfall_id ?? "abc123",
      set: overrides.set ?? "set",
      set_name: overrides.set_name ?? "Test Set",
      name: overrides.name ?? "Test Card",
      cn: "1",
      layout: "normal",
      cmc: overrides.cmc ?? 3,
      type: "Creature",
      type_line: overrides.type_line ?? "Creature — Human",
      oracle_text: overrides.oracle_text ?? "Some text",
      mana_cost: overrides.mana_cost ?? "{2}{W}",
      power: overrides.power,
      toughness: overrides.toughness,
      colors: overrides.colors ?? [],
      color_identity: overrides.color_identity,
      rarity: overrides.rarity ?? "common",
      prices: overrides.prices ?? {},
    },
  };
}

describe("filterByColorIdentity", () => {
  const monoWhite = makeItem({ color_identity: ["W"], name: "White Knight" });
  const monoBlue = makeItem({ color_identity: ["U"], name: "Counterspell" });
  const whiteBlue = makeItem({ color_identity: ["W", "U"], name: "Azorius Charm" });
  const monoRed = makeItem({ color_identity: ["R"], name: "Lightning Bolt" });
  const colorless = makeItem({ color_identity: [], name: "Sol Ring" });
  const fiveColor = makeItem({ color_identity: ["W", "U", "B", "R", "G"], name: "Niv-Mizzet Reborn" });

  const allCards = [monoWhite, monoBlue, whiteBlue, monoRed, colorless, fiveColor];

  it("filters mono-white when only W is selected", () => {
    const result = filterByColorIdentity(allCards, ["W"], false);
    const names = result.map((i) => i.card.name);

    expect(names).toContain("White Knight");
    expect(names).toContain("Sol Ring"); // colorless always included when colors selected
    expect(names).not.toContain("Counterspell");
    expect(names).not.toContain("Azorius Charm"); // UW is not a subset of W
    expect(names).not.toContain("Lightning Bolt");
    expect(names).not.toContain("Niv-Mizzet Reborn");
  });

  it("includes multi-color cards that are a subset of selected colors", () => {
    const result = filterByColorIdentity(allCards, ["W", "U"], false);
    const names = result.map((i) => i.card.name);

    expect(names).toContain("White Knight");
    expect(names).toContain("Counterspell");
    expect(names).toContain("Azorius Charm"); // WU is subset of WU
    expect(names).toContain("Sol Ring");
    expect(names).not.toContain("Lightning Bolt");
    expect(names).not.toContain("Niv-Mizzet Reborn");
  });

  it("returns only colorless when colorless flag is on with no colors", () => {
    const result = filterByColorIdentity(allCards, [], true);
    const names = result.map((i) => i.card.name);

    expect(names).toEqual(["Sol Ring"]);
  });

  it("includes colorless alongside colored when both selected", () => {
    const result = filterByColorIdentity(allCards, ["R"], true);
    const names = result.map((i) => i.card.name);

    expect(names).toContain("Lightning Bolt");
    expect(names).toContain("Sol Ring");
    expect(names).not.toContain("White Knight");
  });

  it("returns all single-color and subset cards when all 5 colors selected", () => {
    const result = filterByColorIdentity(allCards, ["W", "U", "B", "R", "G"], false);
    const names = result.map((i) => i.card.name);

    expect(names).toContain("White Knight");
    expect(names).toContain("Counterspell");
    expect(names).toContain("Azorius Charm");
    expect(names).toContain("Lightning Bolt");
    expect(names).toContain("Sol Ring");
    expect(names).toContain("Niv-Mizzet Reborn");
  });

  it("returns empty when no colors selected and colorless is off", () => {
    const result = filterByColorIdentity(allCards, [], false);
    expect(result).toEqual([]);
  });
});

describe("mapCardResponse", () => {
  it("maps all fields correctly", () => {
    const item = makeItem(
      {
        name: "Sol Ring",
        scryfall_id: "abc-123",
        mana_cost: "{1}",
        type_line: "Artifact",
        oracle_text: "Tap: Add {C}{C}.",
        color_identity: [],
        cmc: 1,
        rarity: "uncommon",
        power: undefined,
        toughness: undefined,
        prices: { usd: 3.5 },
      },
      4,
      "Foil",
    );
    item.card.set = "cmd";
    item.card.set_name = "Commander";
    item.card.cn = "217";

    const mapped = mapCardResponse(item);

    expect(mapped.name).toBe("Sol Ring");
    expect(mapped.scryfall_id).toBe("abc-123");
    expect(mapped.quantity).toBe(4);
    expect(mapped.finish).toBe("Foil");
    expect(mapped.set_code).toBe("cmd");
    expect(mapped.collector_number).toBe("217");
    expect(mapped.rarity).toBe("uncommon");
  });

  it("defaults finish to Normal when missing", () => {
    const item = makeItem({ color_identity: [] });
    const mapped = mapCardResponse(item);

    expect(mapped.finish).toBe("Normal");
  });
});

describe("POST /api/collection (route wiring)", () => {
  const mockGet = getOwnedLibrary as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clearScryfallCacheRows();
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

  it("warms the collection cache while preserving the response shape", async () => {
    const item = makeItem({ color_identity: [], name: "Sol Ring", set: "cmd", set_name: "Commander" }, 2, "Foil");
    item.card.cn = "217";

    const library: OwnedLibrary = new Map<string, OwnedCard>([
      ["Sol Ring", { name: "Sol Ring", printings: [item], totalQty: 2 }],
    ]);

    mockGet.mockResolvedValueOnce({ library, totalResults: 1 });

    const res = await collection.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ colors: [], colorless: true }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      totalResults: number;
      filteredCount: number;
      cards: Array<{ name: string; quantity: number; finish: string }>;
    };
    expect(body.totalResults).toBe(1);
    expect(body.filteredCount).toBe(1);
    expect(body.cards[0]).toEqual(expect.objectContaining({ name: "Sol Ring", quantity: 2, finish: "Foil" }));

    const cache = createScryfallCache({ missTtlMs: 7 * 24 * 60 * 60 * 1000 });
    expect(cache.lookupCollectionCard("Sol Ring")).toEqual(
      expect.objectContaining({
        kind: "collection-hit",
        quantityTotal: 2,
        finish: "Foil",
        sourceSetCode: "cmd",
        sourceCollectorNumber: "217",
      }),
    );
  });

  it("uses the aggregate owned quantity when warming duplicate-name collection rows", async () => {
    const first = makeItem({ color_identity: [], name: "Arcane Signet", set: "ncc" }, 1, "Normal");
    const second = makeItem({ color_identity: [], name: "Arcane Signet", set: "clb" }, 2, "Foil");
    second.card.cn = "300";

    const library: OwnedLibrary = new Map<string, OwnedCard>([
      ["Arcane Signet", { name: "Arcane Signet", printings: [first, second], totalQty: 3 }],
    ]);

    mockGet.mockResolvedValueOnce({ library, totalResults: 2 });

    const res = await collection.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ colors: [], colorless: true }),
    });

    expect(res.status).toBe(200);

    const cache = createScryfallCache({ missTtlMs: 7 * 24 * 60 * 60 * 1000 });
    expect(cache.lookupCollectionCard("Arcane Signet")).toEqual(
      expect.objectContaining({
        kind: "collection-hit",
        quantityTotal: 3,
      }),
    );
  });
});
