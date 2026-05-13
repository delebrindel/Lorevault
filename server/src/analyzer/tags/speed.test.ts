import { describe, it, expect } from "vitest";
import { detectSpeedTags } from "./speed.js";
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

describe("detectSpeedTags", () => {
  it("detects explicit fast mana from the allowlist", () => {
    const tags = detectSpeedTags(makeCard("Sol Ring", {
      cmc: 1,
      oracle_text: "{T}: Add {C}{C}.",
    }));
    expect(tags.fastManaTierScore).toBe(40);
    expect(tags.earlyRampScore).toBeGreaterThan(0);
    expect(tags.reasons).toContain("speed: fast mana");
  });

  it("detects early ramp at mana value two or less", () => {
    const tags = detectSpeedTags(makeCard("Arcane Signet", {
      cmc: 2,
      oracle_text: "{T}: Add one mana of any color in your commander's color identity.",
    }));
    expect(tags.earlyRampScore).toBeGreaterThan(0);
    expect(tags.reasons).toContain("speed: early ramp");
  });

  it("detects low-drop non-ramp cards", () => {
    const tags = detectSpeedTags(makeCard("Esper Sentinel", {
      type: "Creature",
      type_line: "Artifact Creature — Human Soldier",
      cmc: 1,
      oracle_text: "Whenever an opponent casts their first noncreature spell each turn, draw a card unless that player pays {X}, where X is Esper Sentinel's power.",
    }));
    expect(tags.lowDropSpeedScore).toBeGreaterThan(0);
    expect(tags.reasons).toContain("speed: low drop");
  });

  it("does not double-count pure ramp rocks as low-drop speed cards", () => {
    const tags = detectSpeedTags(makeCard("Arcane Signet", {
      cmc: 2,
      oracle_text: "{T}: Add one mana of any color in your commander's color identity.",
    }));
    expect(tags.lowDropSpeedScore).toBe(0);
  });

  it("does not mark unrelated utility cards as fast mana", () => {
    const tags = detectSpeedTags(makeCard("Lightning Greaves", {
      cmc: 2,
      type: "Artifact",
      type_line: "Artifact — Equipment",
      oracle_text: "Equipped creature has haste and shroud.",
    }));
    expect(tags.fastManaTierScore).toBe(0);
  });
});
