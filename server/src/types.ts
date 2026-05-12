export interface CardPrices {
  usd?: number;
  usd_foil?: number;
  eur?: number;
  eur_foil?: number;
  tix?: number;
  ck?: number;
  ck_foil?: number;
  lastUpdatedAtUtc?: string;
}

export interface Card {
  id: string;
  uniqueCardId: string;
  scryfall_id: string;
  set: string;
  set_name: string;
  name: string;
  cn: string;
  layout: string;
  cmc: number;
  type: string;
  type_line: string;
  oracle_text: string;
  mana_cost: string;
  power?: string;
  toughness?: string;
  colors: string[];
  color_identity: string[];
  rarity: string;
  prices: CardPrices;
}

export interface CollectionItem {
  id: string;
  quantity: number;
  condition: string;
  finish?: string;
  card: Card;
}

export interface CollectionResponse {
  pageNumber: number;
  pageSize: number;
  totalResults: number;
  totalPages: number;
  data: CollectionItem[];
}

export type MtgColor = "W" | "U" | "B" | "R" | "G";

export const MTG_COLORS: Record<MtgColor, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
};

/**
 * A single owned card, identified by name, with all printings/finishes the user owns.
 * `totalQty` = sum of `quantity` across all `printings`.
 */
export interface OwnedCard {
  name: string;
  printings: CollectionItem[];
  totalQty: number;
}

/**
 * The entire owned collection grouped by card name (case-sensitive, exact match).
 * Key = `OwnedCard.name`. DFC `//` and Alchemy `A-` prefixes are treated as distinct.
 */
export type OwnedLibrary = Map<string, OwnedCard>;

/**
 * A deck after input parsing but before card-name resolution.
 * `commander` holds 1 name, or 2 if partner / background / friends-forever.
 * `unresolved` is parser-level: lines the parser could not tokenize at all.
 * Card-resolution failures live on `ResolvedDeck.unresolved`, not here.
 */
export interface ParsedDeck {
  source: "moxfield" | "manual";
  commander: string[];
  mainboard: { name: string; qty: number }[];
  unresolved: string[];
}

/**
 * A deck after every name has been mapped to a `Card`.
 * `commander` and `mainboard` contain only successful resolutions.
 * `unresolved` lists names neither the owned library nor Moxfield could resolve.
 * `ownedMap` reports owned quantity per `scryfall_id` for quick "do I own this?" lookups.
 */
export interface ResolvedDeck {
  commander: Card[];
  mainboard: { card: Card; qty: number }[];
  unresolved: string[];
  ownedMap: Map<string, number>;
}
