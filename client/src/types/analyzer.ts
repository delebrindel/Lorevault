export type AnalyzerSource = "manual" | "moxfield";
export type Grade = "F" | "D" | "C" | "B" | "A" | "S";
export type AxisKey = "consistency" | "resilience" | "interaction" | "speed";
export type Archetype =
  | "aggro/voltron"
  | "midrange/goodstuff"
  | "control"
  | "combo"
  | "aristocrats/sacrifice"
  | "spellslinger"
  | "tokens/go-wide"
  | "reanimator/graveyard"
  | "lands/landfall";

export interface ParsedDeckEntry {
  name: string;
  qty: number;
}

export interface ParsedDeck {
  source: AnalyzerSource;
  commander: string[];
  mainboard: ParsedDeckEntry[];
  unresolved: string[];
}

export interface AnalyzerCard {
  id: string;
  uniqueCardId: string;
  scryfall_id: string;
  name: string;
  mana_cost: string;
  type_line: string;
  oracle_text: string;
  cmc: number;
  colors: string[];
  color_identity: string[];
  rarity: string;
  set: string;
  set_name: string;
  cn: string;
  layout: string;
  prices: Record<string, number | string | undefined>;
  power?: string;
  toughness?: string;
}

export interface ResolvedDeckEntry {
  card: AnalyzerCard;
  qty: number;
}

export interface SerializedResolvedDeck {
  commander: AnalyzerCard[];
  mainboard: ResolvedDeckEntry[];
  unresolved: string[];
  ownedMap: Record<string, number>;
}

export interface AxisSummary {
  score: number;
  grade: Grade;
  notes: string[];
}

export interface CrispiReport {
  overall: number;
  axes: Record<AxisKey, AxisSummary>;
  deckMeta: {
    commander: string[];
    archetype: Archetype;
    colorIdentity: string[];
    cardCount: number;
    unresolvedCount: number;
  };
  generatedAt: string;
}

export interface AnalyzerRequestError {
  error?: string;
}
