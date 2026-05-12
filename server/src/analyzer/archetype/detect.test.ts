import { describe, it, expect } from "vitest";
import { detectArchetype } from "./detect.js";
import { scoreDeck } from "../scorer/index.js";
import type { Card, ResolvedDeck } from "../../types.js";

function makeCard(name: string, overrides: Partial<Card> = {}): Card {
  return {
    id: name,
    uniqueCardId: `${name}-oracle`,
    scryfall_id: `${name.toLowerCase()}-sf`,
    set: "set",
    set_name: "Set",
    name,
    cn: "1",
    layout: "normal",
    cmc: 2,
    type: "Artifact",
    type_line: "Artifact",
    oracle_text: "",
    mana_cost: "{2}",
    colors: [],
    color_identity: [],
    rarity: "common",
    prices: {},
    ...overrides,
  };
}

const deck: ResolvedDeck = {
  commander: [makeCard("Atraxa, Praetors' Voice", { color_identity: ["W", "U", "B", "G"] })],
  mainboard: [],
  unresolved: [],
  ownedMap: new Map(),
};

describe("detectArchetype", () => {
  it("returns the slice-1 default archetype with low-confidence reasons", () => {
    const result = detectArchetype(deck);

    expect(result.archetype).toBe("midrange/goodstuff");
    expect(result.confidence).toBe("low");
    expect(result.reasons).toContain(
      "Slice 1 uses a conservative detector stub until richer tag density exists.",
    );
  });

  it("is used by scoreDeck when no override is provided", () => {
    const report = scoreDeck(deck);
    expect(report.deckMeta.archetype).toBe("midrange/goodstuff");
  });
});
