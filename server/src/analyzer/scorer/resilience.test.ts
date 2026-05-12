import { describe, it, expect } from "vitest";
import { scoreResilience } from "./resilience.js";
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
    type: "Creature",
    type_line: "Creature",
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
      { card: makeCard("Vanilla Creature", { oracle_text: "" }), qty: 10 },
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
      { card: makeCard("Sun Titan", {
        cmc: 6,
        oracle_text: "Whenever Sun Titan enters or attacks, return target permanent card with mana value 3 or less from your graveyard to the battlefield.",
      }), qty: 1 },
      { card: makeCard("Eternal Witness", {
        cmc: 3,
        oracle_text: "When Eternal Witness enters, you may return target card from your graveyard to your hand.",
      }), qty: 1 },
      { card: makeCard("Lightning Greaves", {
        type: "Artifact",
        type_line: "Artifact — Equipment",
        oracle_text: "Equipped creature has haste and shroud.",
      }), qty: 1 },
      { card: makeCard("Heroic Intervention", {
        type: "Instant",
        type_line: "Instant",
        oracle_text: "Permanents you control gain hexproof and indestructible until end of turn.",
      }), qty: 1 },
      { card: makeCard("Selfless Spirit", {
        oracle_text: "Sacrifice Selfless Spirit: Creatures you control gain indestructible until end of turn.",
      }), qty: 1 },
    ],
    unresolved: [],
    ownedMap: new Map(),
  };
}

function graveyardHeavyDeck(): ResolvedDeck {
  return {
    commander: [makeCard("Commander")],
    mainboard: [
      { card: land("Swamp"), qty: 36 },
      { card: makeCard("Reanimate", {
        type: "Sorcery",
        type_line: "Sorcery",
        oracle_text: "Put target creature card from a graveyard onto the battlefield under your control. You lose life equal to its mana value.",
      }), qty: 2 },
      { card: makeCard("Victimize", {
        type: "Sorcery",
        type_line: "Sorcery",
        oracle_text: "Choose two target creature cards in your graveyard. Sacrifice a creature. If you do, return the chosen cards to the battlefield tapped.",
      }), qty: 2 },
      { card: makeCard("Animate Dead", {
        type: "Enchantment",
        type_line: "Enchantment — Aura",
        oracle_text: "When Animate Dead enters, if it's on the battlefield, it loses enchant creature card in a graveyard and gains enchant creature put onto the battlefield with Animate Dead. Return enchanted creature card to the battlefield under your control.",
      }), qty: 1 },
    ],
    unresolved: [],
    ownedMap: new Map(),
  };
}

describe("scoreResilience", () => {
  it("returns the expected sub-metric keys", () => {
    const report = scoreResilience(strongDeck(), "midrange/goodstuff");
    expect(report.subMetrics.map((m) => m.key)).toEqual([
      "recursion.count",
      "protection.permanents",
      "protection.spells",
      "boardwipe.survivability",
      "graveyard.exposure",
    ]);
  });

  it("scores a stronger resilience deck higher than a weak one", () => {
    const weak = scoreResilience(weakDeck(), "midrange/goodstuff");
    const strong = scoreResilience(strongDeck(), "midrange/goodstuff");
    expect(strong.score).toBeGreaterThan(weak.score);
  });

  it("records evidence from representative resilience cards", () => {
    const report = scoreResilience(strongDeck(), "midrange/goodstuff");
    expect(report.evidence.some((e) => e.card === "Sun Titan" && e.subMetric === "recursion.count")).toBe(true);
    expect(report.evidence.some((e) => e.card === "Lightning Greaves" && e.subMetric === "protection.permanents")).toBe(true);
    expect(report.evidence.some((e) => e.card === "Heroic Intervention" && e.subMetric === "protection.spells")).toBe(true);
    expect(report.evidence.some((e) => e.card === "Selfless Spirit" && e.subMetric === "boardwipe.survivability")).toBe(true);
  });

  it("penalizes graveyard-heavy decks on graveyard exposure", () => {
    const report = scoreResilience(graveyardHeavyDeck(), "reanimator/graveyard");
    const exposure = report.subMetrics.find((m) => m.key === "graveyard.exposure");
    expect(exposure?.score).toBeLessThan(100);
  });

  it("uses the shared analyzer grade mapping", () => {
    const report = scoreResilience(strongDeck(), "midrange/goodstuff");
    expect(["F", "D", "C", "B", "A", "S"]).toContain(report.grade);
  });
});
