import { describe, it, expect } from "vitest";
import { scoreDeck } from "./index.js";
import type { Card, ResolvedDeck } from "../../types.js";

function makeCard(
  name: string,
  overrides: Partial<Card> = {},
): Card {
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

function makeDeck(): ResolvedDeck {
  return {
    commander: [makeCard("Atraxa, Praetors' Voice", { color_identity: ["W", "U", "B", "G"] })],
    mainboard: [
      { card: makeCard("Sol Ring", { cmc: 1, oracle_text: "{T}: Add {C}{C}." }), qty: 1 },
      { card: makeCard("Forest", { cmc: 0, type: "Land", type_line: "Basic Land — Forest" }), qty: 35 },
    ],
    unresolved: ["Made Up Card"],
    ownedMap: new Map([["sol-ring-sf", 1]]),
  };
}

describe("scoreDeck", () => {
  it("returns a full CrispiReport shape with a full axis set", () => {
    const report = scoreDeck(makeDeck(), { archetypeOverride: "control" });

    expect(report.overall).toBe(0);
    expect(report.axes.consistency.grade).toBe("F");
    expect(report.axes.resilience.notes).toEqual([
      "Not implemented yet in this backend slice.",
    ]);
    expect(report.axes.interaction.notes).toEqual([
      "Not implemented yet in this backend slice.",
    ]);
    expect(report.axes.speed.notes).toEqual([
      "Not implemented yet in this backend slice.",
    ]);
    expect(report.deckMeta.commander).toEqual(["Atraxa, Praetors' Voice"]);
    expect(report.deckMeta.archetype).toBe("control");
    expect(report.deckMeta.unresolvedCount).toBe(1);
    expect(report.deckMeta.cardCount).toBe(37);
    expect(Number.isNaN(Date.parse(report.generatedAt))).toBe(false);
  });
});
