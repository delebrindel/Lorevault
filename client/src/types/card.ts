export type MtgColor = "W" | "U" | "B" | "R" | "G";

export interface FilteredCard {
  name: string;
  scryfall_id: string;
  mana_cost: string;
  type_line: string;
  oracle_text: string;
  color_identity: string[];
  cmc: number;
  rarity: string;
  set_name: string;
  power?: string;
  toughness?: string;
  quantity: number;
  prices: Record<string, number | string | undefined>;
  set_code: string;
  collector_number: string;
  finish: string;
}

export interface CollectionResult {
  totalResults: number;
  filteredCount: number;
  cards: FilteredCard[];
}

export const MTG_COLORS: { code: MtgColor; name: string; symbol: string; hex: string }[] = [
  { code: "W", name: "White", symbol: "{W}", hex: "#F9FAF4" },
  { code: "U", name: "Blue", symbol: "{U}", hex: "#0E68AB" },
  { code: "B", name: "Black", symbol: "{B}", hex: "#150B00" },
  { code: "R", name: "Red", symbol: "{R}", hex: "#D3202A" },
  { code: "G", name: "Green", symbol: "{G}", hex: "#00733E" },
];
