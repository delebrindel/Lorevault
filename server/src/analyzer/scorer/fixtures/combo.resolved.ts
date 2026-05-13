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
    type: "Sorcery",
    type_line: "Sorcery",
    oracle_text: "",
    mana_cost: "{2}",
    colors: [],
    color_identity: ["B", "U"],
    rarity: "common",
    prices: {},
    ...overrides,
  };
}

function land(name: string): Card {
  return makeCard(name, { cmc: 0, type: "Land", type_line: "Basic Land — Swamp", oracle_text: "{T}: Add {B}." });
}

export const comboFixture: ResolvedDeck = {
  commander: [makeCard("Commander", { cmc: 3, type: "Creature", type_line: "Legendary Creature", color_identity: ["U", "B"] })],
  mainboard: [
    { card: land("Swamp"), qty: 35 },
    { card: makeCard("Mana Vault", { cmc: 1, type: "Artifact", type_line: "Artifact", oracle_text: "{T}: Add {C}{C}{C}." }), qty: 1 },
    { card: makeCard("Demonic Tutor", { cmc: 2, oracle_text: "Search your library for a card, put that card into your hand, then shuffle." }), qty: 1 },
    { card: makeCard("Craterhoof Behemoth", { cmc: 8, type: "Creature", type_line: "Creature — Beast", oracle_text: "When Craterhoof Behemoth enters, creatures you control gain trample and get +X/+X until end of turn, where X is the number of creatures you control." }), qty: 1 },
  ],
  unresolved: [],
  ownedMap: new Map(),
};
