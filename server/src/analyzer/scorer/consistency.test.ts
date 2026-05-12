import { describe, it, expect } from "vitest";
import { scoreConsistency } from "./consistency.js";
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
    type: "Sorcery",
    type_line: "Sorcery",
    oracle_text: "",
    mana_cost: "{2}",
    colors: [],
    color_identity: [],
    rarity: "common",
    prices: {},
    ...overrides,
  };
}

function land(name: string): Card {
  return makeCard(name, { cmc: 0, type: "Land", type_line: "Basic Land — Forest" });
}

function weakDeck(): ResolvedDeck {
  return {
    commander: [makeCard("Commander")],
    mainboard: [
      { card: land("Forest"), qty: 30 },
      { card: makeCard("Big Spell", { cmc: 7, mana_cost: "{7}" }), qty: 20 },
    ],
    unresolved: [],
    ownedMap: new Map(),
  };
}

function strongDeck(): ResolvedDeck {
  return {
    commander: [makeCard("Commander")],
    mainboard: [
      { card: land("Forest"), qty: 38 },
      { card: makeCard("Sol Ring", { cmc: 1, type: "Artifact", type_line: "Artifact", oracle_text: "{T}: Add {C}{C}." }), qty: 1 },
      { card: makeCard("Arcane Signet", { cmc: 2, type: "Artifact", type_line: "Artifact", oracle_text: "{T}: Add one mana of any color in your commander's color identity." }), qty: 1 },
      { card: makeCard("Cultivate", { cmc: 3, oracle_text: "Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle." }), qty: 1 },
      { card: makeCard("Night's Whisper", { cmc: 2, oracle_text: "You draw two cards and you lose 2 life." }), qty: 1 },
      { card: makeCard("Phyrexian Arena", { cmc: 3, type: "Enchantment", type_line: "Enchantment", oracle_text: "At the beginning of your upkeep, you draw a card and you lose 1 life." }), qty: 1 },
      { card: makeCard("Demonic Tutor", { cmc: 2, oracle_text: "Search your library for a card, put that card into your hand, then shuffle." }), qty: 1 },
      { card: makeCard("Swords to Plowshares", { cmc: 1, oracle_text: "Exile target creature. Its controller gains life equal to its power." }), qty: 1 },
    ],
    unresolved: [],
    ownedMap: new Map(),
  };
}

describe("scoreConsistency", () => {
  it("returns the expected sub-metric keys", () => {
    const report = scoreConsistency(strongDeck(), "midrange/goodstuff");
    expect(report.subMetrics.map((m) => m.key)).toEqual([
      "ramp.count",
      "draw.density",
      "tutor.count",
      "manabase.size",
      "curve.shape",
    ]);
  });

  it("scores a stronger deck higher than a weak one", () => {
    const weak = scoreConsistency(weakDeck(), "midrange/goodstuff");
    const strong = scoreConsistency(strongDeck(), "midrange/goodstuff");
    expect(strong.score).toBeGreaterThan(weak.score);
  });

  it("records evidence from tagged cards", () => {
    const report = scoreConsistency(strongDeck(), "midrange/goodstuff");
    expect(report.evidence.some((e) => e.card === "Sol Ring" && e.subMetric === "ramp.count")).toBe(true);
    expect(report.evidence.some((e) => e.card === "Phyrexian Arena" && e.subMetric === "draw.density")).toBe(true);
    expect(report.evidence.some((e) => e.card === "Demonic Tutor" && e.subMetric === "tutor.count")).toBe(true);
  });

  it("uses the score-to-grade mapping from the analyzer layer", () => {
    const report = scoreConsistency(strongDeck(), "midrange/goodstuff");
    expect(["F", "D", "C", "B", "A", "S"]).toContain(report.grade);
  });
});
