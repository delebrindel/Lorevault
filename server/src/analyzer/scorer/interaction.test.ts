import { describe, it, expect } from "vitest";
import { scoreInteraction } from "./interaction.js";
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
    type: "Instant",
    type_line: "Instant",
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
  return makeCard(name, { cmc: 0, type: "Land", type_line: "Basic Land — Plains" });
}

function weakDeck(): ResolvedDeck {
  return {
    commander: [makeCard("Commander")],
    mainboard: [
      { card: land("Plains"), qty: 36 },
      { card: makeCard("Vanilla Creature", { type: "Creature", type_line: "Creature" }), qty: 10 },
    ],
    unresolved: [],
    ownedMap: new Map(),
  };
}

function strongDeck(): ResolvedDeck {
  return {
    commander: [makeCard("Commander")],
    mainboard: [
      { card: land("Plains"), qty: 36 },
      { card: makeCard("Swords to Plowshares", {
        oracle_text: "Exile target creature. Its controller gains life equal to its power.",
      }), qty: 1 },
      { card: makeCard("Beast Within", {
        oracle_text: "Destroy target permanent. Its controller creates a 3/3 green Beast creature token.",
      }), qty: 1 },
      { card: makeCard("Wrath of God", {
        type: "Sorcery",
        type_line: "Sorcery",
        oracle_text: "Destroy all creatures. They can't be regenerated.",
      }), qty: 1 },
      { card: makeCard("Counterspell", {
        oracle_text: "Counter target spell.",
      }), qty: 1 },
      { card: makeCard("Negate", {
        oracle_text: "Counter target noncreature spell.",
      }), qty: 1 },
    ],
    unresolved: [],
    ownedMap: new Map(),
  };
}

function fullSpecDeck(): ResolvedDeck {
  return {
    commander: [makeCard("Commander")],
    mainboard: [
      { card: land("Island"), qty: 36 },
      { card: makeCard("Swords to Plowshares", {
        oracle_text: "Exile target creature. Its controller gains life equal to its power.",
      }), qty: 1 },
      { card: makeCard("Counterspell", {
        oracle_text: "Counter target spell.",
      }), qty: 1 },
      { card: makeCard("Force of Will", {
        oracle_text: "You may pay 1 life and exile a blue card from your hand rather than pay this spell's mana cost. Counter target spell.",
      }), qty: 1 },
      { card: makeCard("Frilled Mystic", {
        type: "Creature",
        type_line: "Creature — Elf Lizard Wizard",
        oracle_text: "Flash\nWhen Frilled Mystic enters, counter target spell.",
      }), qty: 1 },
      { card: makeCard("Rule of Law", {
        type: "Enchantment",
        type_line: "Enchantment",
        oracle_text: "Each player can't cast more than one spell each turn.",
      }), qty: 1 },
    ],
    unresolved: [],
    ownedMap: new Map(),
  };
}

function sorceryHeavyInteractionDeck(): ResolvedDeck {
  return {
    commander: [makeCard("Commander")],
    mainboard: [
      { card: land("Plains"), qty: 36 },
      { card: makeCard("Vindicate", {
        type: "Sorcery",
        type_line: "Sorcery",
        oracle_text: "Destroy target permanent.",
      }), qty: 1 },
      { card: makeCard("Wrath of God", {
        type: "Sorcery",
        type_line: "Sorcery",
        oracle_text: "Destroy all creatures. They can't be regenerated.",
      }), qty: 1 },
    ],
    unresolved: [],
    ownedMap: new Map(),
  };
}

describe("scoreInteraction", () => {
  it("returns the expected full Interaction sub-metric keys", () => {
    const report = scoreInteraction(strongDeck(), "control");
    expect(report.subMetrics.map((m) => m.key)).toEqual([
      "removal.spot",
      "removal.boardwipe",
      "counterspells.count",
      "interaction.instantSpeed",
      "interaction.free",
      "interaction.stax",
      "interaction.coverage",
    ]);
  });

  it("scores a stronger interaction deck higher than a weak one", () => {
    const weak = scoreInteraction(weakDeck(), "control");
    const strong = scoreInteraction(strongDeck(), "control");
    expect(strong.score).toBeGreaterThan(weak.score);
  });

  it("records evidence from representative interaction cards", () => {
    const report = scoreInteraction(strongDeck(), "control");
    expect(report.evidence.some((e) => e.card === "Swords to Plowshares" && e.subMetric === "removal.spot")).toBe(true);
    expect(report.evidence.some((e) => e.card === "Wrath of God" && e.subMetric === "removal.boardwipe")).toBe(true);
    expect(report.evidence.some((e) => e.card === "Counterspell" && e.subMetric === "counterspells.count")).toBe(true);
    expect(report.evidence.some((e) => e.card === "Beast Within" && e.subMetric === "interaction.coverage")).toBe(true);
  });

  it("uses the declared coverage step scoring", () => {
    const report = scoreInteraction(strongDeck(), "control");
    const coverage = report.subMetrics.find((m) => m.key === "interaction.coverage");
    expect(coverage?.raw).toBeGreaterThanOrEqual(3);
    expect([0, 25, 55, 80, 100]).toContain(coverage?.score);
  });

  it("uses ratio behavior for instant-speed interaction", () => {
    const instantHeavy = scoreInteraction(fullSpecDeck(), "control");
    const sorceryHeavy = scoreInteraction(sorceryHeavyInteractionDeck(), "control");
    const instantMetric = instantHeavy.subMetrics.find((m) => m.key === "interaction.instantSpeed");
    const sorceryMetric = sorceryHeavy.subMetrics.find((m) => m.key === "interaction.instantSpeed");
    expect((instantMetric?.raw ?? 0)).toBeGreaterThan(sorceryMetric?.raw ?? 0);
    expect((instantMetric?.score ?? 0)).toBeGreaterThan(sorceryMetric?.score ?? 0);
  });

  it("records free interaction and stax evidence", () => {
    const report = scoreInteraction(fullSpecDeck(), "control");
    expect(report.evidence.some((e) => e.card === "Force of Will" && e.subMetric === "interaction.free")).toBe(true);
    expect(report.evidence.some((e) => e.card === "Rule of Law" && e.subMetric === "interaction.stax")).toBe(true);
  });

  it("removes the old MVP-only deferred note", () => {
    const report = scoreInteraction(fullSpecDeck(), "control");
    expect(report.notes).not.toContain(
      "Instant-speed interaction, free interaction, and stax remain deferred in this MVP slice.",
    );
  });

  it("uses the shared analyzer grade mapping", () => {
    const report = scoreInteraction(strongDeck(), "control");
    expect(["F", "D", "C", "B", "A", "S"]).toContain(report.grade);
  });
});
