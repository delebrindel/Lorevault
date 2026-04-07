import { describe, it, expect } from "vitest";
import { filterByColorIdentity, mapCardResponse } from "./collection.js";
import type { CollectionItem, Card, MtgColor } from "../types.js";

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
