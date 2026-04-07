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
