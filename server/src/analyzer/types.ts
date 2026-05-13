import type { MtgColor } from "../types.js";

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

export type AxisKey = "consistency" | "resilience" | "interaction" | "speed";
export type AxisShortKey = "C" | "R" | "I" | "S";
export type Grade = "F" | "D" | "C" | "B" | "A" | "S";

export interface SubMetric {
  key: string;
  label: string;
  raw: number;
  target: { min: number; ideal: number; max: number };
  score: number;
  weight: number;
  contributingCards: string[];
}

export interface CardEvidence {
  card: string;
  axis: AxisShortKey;
  subMetric: string;
  contribution: number;
  reason: string;
}

export interface AxisReport {
  score: number;
  grade: Grade;
  subMetrics: SubMetric[];
  evidence: CardEvidence[];
  notes: string[];
}

export interface CrispiReport {
  overall: number;
  axes: {
    consistency: AxisReport;
    resilience: AxisReport;
    interaction: AxisReport;
    speed: AxisReport;
  };
  deckMeta: {
    commander: string[];
    archetype: Archetype;
    colorIdentity: MtgColor[];
    cardCount: number;
    unresolvedCount: number;
  };
  generatedAt: string;
}

export interface ArchetypeDetectionResult {
  archetype: Archetype;
  confidence: "low" | "medium" | "high";
  reasons: string[];
}

export interface CardTags {
  isLand: boolean;
  rampScore: number;
  drawScore: number;
  tutorScore: number;
  recursionScore: number;
  protectionPermanentScore: number;
  protectionSpellScore: number;
  boardwipeSurvivalScore: number;
  graveyardRelianceScore: number;
  removalSpotScore: number;
  removalBoardwipeScore: number;
  counterspellScore: number;
  interactionCoverage: {
    creature: boolean;
    artifact: boolean;
    enchantment: boolean;
    planeswalker: boolean;
    land: boolean;
  };
  reasons: string[];
}
