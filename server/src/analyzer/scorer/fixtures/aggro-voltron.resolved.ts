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
    type: "Creature",
    type_line: "Creature",
    oracle_text: "",
    mana_cost: "{2}",
    colors: [],
    color_identity: ["W"],
    rarity: "common",
    prices: {},
    ...overrides,
  };
}

function land(name: string): Card {
  return makeCard(name, { cmc: 0, type: "Land", type_line: "Basic Land — Plains", oracle_text: "{T}: Add {W}." });
}

export const aggroVoltronFixture: ResolvedDeck = {
  commander: [makeCard("Commander", { cmc: 3, type: "Creature", type_line: "Legendary Creature", color_identity: ["W", "R"] })],
  mainboard: [
    { card: land("Plains"), qty: 35 },
    { card: makeCard("Sol Ring", { cmc: 1, type: "Artifact", type_line: "Artifact", oracle_text: "{T}: Add {C}{C}." }), qty: 1 },
    { card: makeCard("Blackblade Reforged", { cmc: 2, type: "Artifact", type_line: "Legendary Artifact — Equipment", oracle_text: "Equipped creature gets +1/+1 for each land you control." }), qty: 1 },
    { card: makeCard("Swords to Plowshares", { cmc: 1, type: "Instant", type_line: "Instant", oracle_text: "Exile target creature. Its controller gains life equal to its power." }), qty: 1 },
  ],
  unresolved: [],
  ownedMap: new Map(),
};
