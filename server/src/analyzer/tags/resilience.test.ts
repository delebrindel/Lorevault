import { describe, it, expect } from "vitest";
import { detectResilienceTags } from "./resilience.js";
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

describe("detectResilienceTags", () => {
  it("detects battlefield recursion", () => {
    const tags = detectResilienceTags(makeCard("Sun Titan", {
      oracle_text: "Whenever Sun Titan enters or attacks, return target permanent card with mana value 3 or less from your graveyard to the battlefield.",
    }));
    expect(tags.recursionScore).toBeGreaterThan(0);
    expect(tags.reasons).toContain("recursion: battlefield rebuy");
  });

  it("detects permanent-based protection", () => {
    const tags = detectResilienceTags(makeCard("Lightning Greaves", {
      type: "Artifact",
      type_line: "Artifact — Equipment",
      oracle_text: "Equipped creature has haste and shroud.",
    }));
    expect(tags.protectionPermanentScore).toBeGreaterThan(0);
    expect(tags.reasons).toContain("protection: permanent-based protection");
  });

  it("detects non-counter protective spells", () => {
    const tags = detectResilienceTags(makeCard("Heroic Intervention", {
      type: "Instant",
      type_line: "Instant",
      oracle_text: "Permanents you control gain hexproof and indestructible until end of turn.",
    }));
    expect(tags.protectionSpellScore).toBeGreaterThan(0);
    expect(tags.boardwipeSurvivalScore).toBeGreaterThan(0);
    expect(tags.reasons).toContain("protection: spell-based protection");
    expect(tags.reasons).toContain("survival: wipe protection");
  });

  it("tracks graveyard reliance for graveyard-centric spells", () => {
    const tags = detectResilienceTags(makeCard("Reanimate", {
      type: "Sorcery",
      type_line: "Sorcery",
      oracle_text: "Put target creature card from a graveyard onto the battlefield under your control. You lose life equal to its mana value.",
    }));
    expect(tags.recursionScore).toBeGreaterThan(0);
    expect(tags.graveyardRelianceScore).toBeGreaterThan(0);
    expect(tags.reasons).toContain("graveyard: reliance on graveyard resource");
  });

  it("does not count counterspells as protection spells in this slice", () => {
    const tags = detectResilienceTags(makeCard("Counterspell", {
      type: "Instant",
      type_line: "Instant",
      oracle_text: "Counter target spell.",
    }));
    expect(tags.protectionSpellScore).toBe(0);
  });
});
