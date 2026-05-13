import { describe, it, expect } from "vitest";
import { scoreSpeed } from "./speed.js";
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

function land(name: string): Card {
  return makeCard(name, { cmc: 0, type: "Land", type_line: "Basic Land — Plains" });
}

function weakDeck(): ResolvedDeck {
  return {
    commander: [makeCard("Commander", { type: "Creature", type_line: "Legendary Creature", cmc: 5 })],
    mainboard: [
      { card: land("Plains"), qty: 36 },
      { card: makeCard("Big Creature", { type: "Creature", type_line: "Creature", cmc: 7 }), qty: 8 },
    ],
    unresolved: [],
    ownedMap: new Map(),
  };
}

function strongDeck(): ResolvedDeck {
  return {
    commander: [makeCard("Commander", { type: "Creature", type_line: "Legendary Creature", cmc: 3 })],
    mainboard: [
      { card: land("Plains"), qty: 36 },
      { card: makeCard("Sol Ring", { cmc: 1, oracle_text: "{T}: Add {C}{C}." }), qty: 1 },
      { card: makeCard("Arcane Signet", { cmc: 2, oracle_text: "{T}: Add one mana of any color in your commander's color identity." }), qty: 1 },
      { card: makeCard("Esper Sentinel", {
        type: "Creature",
        type_line: "Artifact Creature — Human Soldier",
        cmc: 1,
        oracle_text: "Whenever an opponent casts their first noncreature spell each turn, draw a card unless that player pays {X}, where X is Esper Sentinel's power.",
      }), qty: 1 },
      { card: makeCard("Mother of Runes", {
        type: "Creature",
        type_line: "Creature — Human Cleric",
        cmc: 1,
        oracle_text: "{T}: Target creature you control gains protection from the color of your choice until end of turn.",
      }), qty: 1 },
    ],
    unresolved: [],
    ownedMap: new Map(),
  };
}

function fullSpecDeck(): ResolvedDeck {
  return {
    commander: [makeCard("Commander", { type: "Creature", type_line: "Legendary Creature", cmc: 3 })],
    mainboard: [
      { card: land("Plains"), qty: 36 },
      { card: makeCard("Sol Ring", { cmc: 1, oracle_text: "{T}: Add {C}{C}." }), qty: 1 },
      { card: makeCard("Demonic Tutor", {
        type: "Sorcery",
        type_line: "Sorcery",
        cmc: 2,
        oracle_text: "Search your library for a card, put that card into your hand, then shuffle.",
      }), qty: 1 },
      { card: makeCard("Blackblade Reforged", {
        type: "Artifact",
        type_line: "Legendary Artifact — Equipment",
        cmc: 2,
        oracle_text: "Equipped creature gets +1/+1 for each land you control.",
      }), qty: 1 },
      { card: makeCard("Craterhoof Behemoth", {
        type: "Creature",
        type_line: "Creature — Beast",
        cmc: 8,
        oracle_text: "When Craterhoof Behemoth enters, creatures you control gain trample and get +X/+X until end of turn, where X is the number of creatures you control.",
      }), qty: 1 },
    ],
    unresolved: [],
    ownedMap: new Map(),
  };
}

function slowerDeck(): ResolvedDeck {
  return {
    commander: [makeCard("Commander", { type: "Creature", type_line: "Legendary Creature", cmc: 6 })],
    mainboard: [
      { card: land("Plains"), qty: 36 },
      { card: makeCard("Diabolic Tutor", {
        type: "Sorcery",
        type_line: "Sorcery",
        cmc: 4,
        oracle_text: "Search your library for a card, put that card into your hand, then shuffle.",
      }), qty: 1 },
      { card: makeCard("Big Creature", { type: "Creature", type_line: "Creature", cmc: 7 }), qty: 4 },
    ],
    unresolved: [],
    ownedMap: new Map(),
  };
}

describe("scoreSpeed", () => {
  it("returns the expected full Speed sub-metric keys", () => {
    const report = scoreSpeed(strongDeck(), "aggro/voltron");
    expect(report.subMetrics.map((m) => m.key)).toEqual([
      "mana.fast",
      "mana.earlyRamp",
      "curve.avgCMC",
      "curve.lowDrops",
      "threat.density",
      "wincon.turnEstimate",
      "tutor.speed",
    ]);
  });

  it("scores a faster deck higher than a weak one", () => {
    const weak = scoreSpeed(weakDeck(), "aggro/voltron");
    const strong = scoreSpeed(strongDeck(), "aggro/voltron");
    expect(strong.score).toBeGreaterThan(weak.score);
  });

  it("records evidence from representative speed cards", () => {
    const report = scoreSpeed(strongDeck(), "aggro/voltron");
    expect(report.evidence.some((e) => e.card === "Sol Ring" && e.subMetric === "mana.fast")).toBe(true);
    expect(report.evidence.some((e) => e.card === "Arcane Signet" && e.subMetric === "mana.earlyRamp")).toBe(true);
    expect(report.evidence.some((e) => e.card === "Esper Sentinel" && e.subMetric === "curve.lowDrops")).toBe(true);
  });

  it("scores average cmc relative to the archetype band", () => {
    const aggro = scoreSpeed(strongDeck(), "aggro/voltron");
    const control = scoreSpeed(strongDeck(), "control");
    const aggroCurve = aggro.subMetrics.find((m) => m.key === "curve.avgCMC");
    const controlCurve = control.subMetrics.find((m) => m.key === "curve.avgCMC");
    expect(aggroCurve?.score).not.toBe(controlCurve?.score);
  });

  it("records threat and tutor-speed evidence", () => {
    const report = scoreSpeed(fullSpecDeck(), "aggro/voltron");
    expect(report.evidence.some((e) => e.card === "Craterhoof Behemoth" && e.subMetric === "threat.density")).toBe(true);
    expect(report.evidence.some((e) => e.card === "Demonic Tutor" && e.subMetric === "tutor.speed")).toBe(true);
  });

  it("estimates a faster win turn for the faster deck profile", () => {
    const faster = scoreSpeed(fullSpecDeck(), "aggro/voltron");
    const slower = scoreSpeed(slowerDeck(), "aggro/voltron");
    const fasterMetric = faster.subMetrics.find((m) => m.key === "wincon.turnEstimate");
    const slowerMetric = slower.subMetrics.find((m) => m.key === "wincon.turnEstimate");
    expect((fasterMetric?.score ?? 0)).toBeGreaterThan(slowerMetric?.score ?? 0);
  });

  it("removes the old Speed MVP-only deferred note", () => {
    const report = scoreSpeed(fullSpecDeck(), "aggro/voltron");
    expect(report.notes).not.toContain(
      "Threat density, win-turn estimate, and tutor-speed remain deferred in this Speed MVP slice.",
    );
  });

  it("uses the shared analyzer grade mapping", () => {
    const report = scoreSpeed(strongDeck(), "aggro/voltron");
    expect(["F", "D", "C", "B", "A", "S"]).toContain(report.grade);
  });
});
