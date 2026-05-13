import { describe, it, expect } from "vitest";
import { detectInteractionTags } from "./interaction.js";
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

describe("detectInteractionTags", () => {
  it("detects narrow spot removal against creatures", () => {
    const tags = detectInteractionTags(makeCard("Swords to Plowshares", {
      oracle_text: "Exile target creature. Its controller gains life equal to its power.",
    }));
    expect(tags.removalSpotScore).toBeGreaterThan(0);
    expect(tags.interactionCoverage.creature).toBe(true);
    expect(tags.reasons).toContain("interaction: spot removal");
    expect(tags.reasons).toContain("interaction: coverage against creature");
  });

  it("detects flexible catch-all removal and broad coverage", () => {
    const tags = detectInteractionTags(makeCard("Beast Within", {
      oracle_text: "Destroy target permanent. Its controller creates a 3/3 green Beast creature token.",
    }));
    expect(tags.removalSpotScore).toBeGreaterThan(1);
    expect(tags.interactionCoverage.creature).toBe(true);
    expect(tags.interactionCoverage.artifact).toBe(true);
    expect(tags.interactionCoverage.enchantment).toBe(true);
    expect(tags.interactionCoverage.planeswalker).toBe(true);
    expect(tags.interactionCoverage.land).toBe(true);
  });

  it("detects broad board wipes", () => {
    const tags = detectInteractionTags(makeCard("Wrath of God", {
      type: "Sorcery",
      type_line: "Sorcery",
      oracle_text: "Destroy all creatures. They can't be regenerated.",
    }));
    expect(tags.removalBoardwipeScore).toBeGreaterThan(0);
    expect(tags.interactionCoverage.creature).toBe(true);
    expect(tags.reasons).toContain("interaction: board wipe");
  });

  it("detects counterspells with conservative weighting", () => {
    const hard = detectInteractionTags(makeCard("Counterspell", {
      oracle_text: "Counter target spell.",
    }));
    const narrow = detectInteractionTags(makeCard("Negate", {
      oracle_text: "Counter target noncreature spell.",
    }));
    expect(hard.counterspellScore).toBeGreaterThan(narrow.counterspellScore);
    expect(hard.reasons).toContain("interaction: counterspell");
  });

  it("does not falsely mark utility ramp as interaction", () => {
    const tags = detectInteractionTags(makeCard("Arcane Signet", {
      type: "Artifact",
      type_line: "Artifact",
      oracle_text: "{T}: Add one mana of any color in your commander's color identity.",
    }));
    expect(tags.removalSpotScore).toBe(0);
    expect(tags.removalBoardwipeScore).toBe(0);
    expect(tags.counterspellScore).toBe(0);
    expect(Object.values(tags.interactionCoverage).some(Boolean)).toBe(false);
  });
});
