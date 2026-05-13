import type { Card, ResolvedDeck } from "../../../types.js";

function makeCard(name: string, overrides: Partial<Card> = {}): Card {
  return {
    id: name,
    uniqueCardId: `${name}-oracle`,
    scryfall_id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-sf`,
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
    color_identity: ["U"],
    rarity: "common",
    prices: {},
    ...overrides,
  };
}

function land(name: string): Card {
  return makeCard(name, { cmc: 0, type: "Land", type_line: "Basic Land — Island", oracle_text: "{T}: Add {U}." });
}

export const controlFixture: ResolvedDeck = {
  commander: [makeCard("Commander", { cmc: 5, type: "Creature", type_line: "Legendary Creature", color_identity: ["U", "W"] })],
  mainboard: [
    { card: land("Island"), qty: 35 },
    { card: makeCard("Counterspell", { cmc: 2, oracle_text: "Counter target spell." }), qty: 1 },
    { card: makeCard("Force of Will", { cmc: 5, oracle_text: "You may pay 1 life and exile a blue card from your hand rather than pay this spell's mana cost. Counter target spell." }), qty: 1 },
    { card: makeCard("Wrath of God", { cmc: 4, type: "Sorcery", type_line: "Sorcery", oracle_text: "Destroy all creatures. They can't be regenerated." }), qty: 1 },
    { card: makeCard("Rule of Law", { cmc: 3, type: "Enchantment", type_line: "Enchantment", oracle_text: "Each player can't cast more than one spell each turn." }), qty: 1 },
  ],
  unresolved: [],
  ownedMap: new Map(),
};
