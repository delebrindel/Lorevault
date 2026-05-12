import { describe, it, expect } from "vitest";
import { tagCard } from "./index.js";
import type { Card } from "../../types.js";

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

describe("tagCard", () => {
  it("marks lands from type_line", () => {
    const tags = tagCard(makeCard("Forest", { type: "Land", type_line: "Basic Land — Forest", cmc: 0 }));
    expect(tags.isLand).toBe(true);
    expect(tags.rampScore).toBe(0);
  });

  it("detects obvious mana-rock ramp", () => {
    const tags = tagCard(makeCard("Arcane Signet", {
      type: "Artifact",
      type_line: "Artifact",
      cmc: 2,
      oracle_text: "{T}: Add one mana of any color in your commander's color identity.",
    }));
    expect(tags.rampScore).toBe(1);
    expect(tags.reasons).toContain("ramp: mana production effect");
  });

  it("weights recurring card draw above a cantrip", () => {
    const cantrip = tagCard(makeCard("Sign in Blood", {
      oracle_text: "Target player draws two cards and loses 2 life.",
    }));
    const engine = tagCard(makeCard("Phyrexian Arena", {
      type: "Enchantment",
      type_line: "Enchantment",
      oracle_text: "At the beginning of your upkeep, you draw a card and you lose 1 life.",
    }));
    expect(cantrip.drawScore).toBe(1);
    expect(engine.drawScore).toBe(2);
  });

  it("distinguishes land tutors from broad tutors", () => {
    const landTutor = tagCard(makeCard("Cultivate", {
      oracle_text: "Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.",
    }));
    const broadTutor = tagCard(makeCard("Demonic Tutor", {
      oracle_text: "Search your library for a card, put that card into your hand, then shuffle.",
    }));
    expect(landTutor.tutorScore).toBe(0.5);
    expect(broadTutor.tutorScore).toBe(1.5);
  });

  it("merges resilience helper signals into tagCard output", () => {
    const tags = tagCard(makeCard("Heroic Intervention", {
      type: "Instant",
      type_line: "Instant",
      oracle_text: "Permanents you control gain hexproof and indestructible until end of turn.",
    }));
    expect(tags.protectionSpellScore).toBeGreaterThan(0);
    expect(tags.boardwipeSurvivalScore).toBeGreaterThan(0);
    expect(tags.reasons).toContain("protection: spell-based protection");
  });

  it("still keeps counterspells out of protection.spells", () => {
    const tags = tagCard(makeCard("Counterspell", {
      type: "Instant",
      type_line: "Instant",
      oracle_text: "Counter target spell.",
    }));
    expect(tags.protectionSpellScore).toBe(0);
  });
});
