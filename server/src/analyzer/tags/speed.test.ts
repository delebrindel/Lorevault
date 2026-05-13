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

  it("detects clear finishing or must-answer threats", () => {
    const tags = detectSpeedTags(makeCard("Craterhoof Behemoth", {
      type: "Creature",
      type_line: "Creature — Beast",
      cmc: 8,
      oracle_text: "When Craterhoof Behemoth enters, creatures you control gain trample and get +X/+X until end of turn, where X is the number of creatures you control.",
    }));
    expect(tags.threatDensityScore).toBeGreaterThan(0);
    expect(tags.reasons).toContain("speed: threat density");
  });

  it("gives extra threat weight to commander-damage style closers", () => {
    const tags = detectSpeedTags(makeCard("Blackblade Reforged", {
      type: "Artifact",
      type_line: "Legendary Artifact — Equipment",
      cmc: 2,
      oracle_text: "Equipped creature gets +1/+1 for each land you control.",
    }));
    expect(tags.threatDensityScore).toBeGreaterThan(1);
  });

  it("detects cheap broad tutors as speed-positive", () => {
    const tags = detectSpeedTags(makeCard("Demonic Tutor", {
      type: "Sorcery",
      type_line: "Sorcery",
      cmc: 2,
      oracle_text: "Search your library for a card, put that card into your hand, then shuffle.",
    }));
    expect(tags.tutorSpeedScore).toBeGreaterThan(0);
    expect(tags.reasons).toContain("speed: tutor-speed contribution");
  });

  it("scores slow narrow tutors below cheap broad tutors", () => {
    const broad = detectSpeedTags(makeCard("Demonic Tutor", {
      type: "Sorcery",
      type_line: "Sorcery",
      cmc: 2,
      oracle_text: "Search your library for a card, put that card into your hand, then shuffle.",
    }));
    const narrow = detectSpeedTags(makeCard("Diabolic Tutor", {
      type: "Sorcery",
      type_line: "Sorcery",
      cmc: 4,
      oracle_text: "Search your library for a card, put that card into your hand, then shuffle.",
    }));
    expect(broad.tutorSpeedScore).toBeGreaterThan(narrow.tutorSpeedScore);
  });

  it("does not falsely count generic value cards as speed threats", () => {
    const tags = detectSpeedTags(makeCard("Rhystic Study", {
      type: "Enchantment",
      type_line: "Enchantment",
      cmc: 3,
      oracle_text: "Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.",
    }));
    expect(tags.threatDensityScore).toBe(0);
  });
});
