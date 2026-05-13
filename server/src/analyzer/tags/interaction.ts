import type { Card } from "../../types.js";

export interface InteractionTagSlice {
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

const BLANK_COVERAGE = {
  creature: false,
  artifact: false,
  enchantment: false,
  planeswalker: false,
  land: false,
};

const COUNTER_HARD_RE = /^counter target spell\.?$/i;
const COUNTER_NARROW_RE = /counter target (noncreature|creature|artifact|enchantment|planeswalker|instant|sorcery) spell/i;
const COUNTER_SOFT_RE = /counter target spell unless/i;
const TARGET_PERMANENT_RE = /(destroy|exile) target permanent/i;
const TARGET_CREATURE_RE = /(destroy|exile) target creature/i;
const TARGET_ARTIFACT_OR_ENCHANTMENT_RE = /(destroy|exile) target artifact or enchantment/i;
const TARGET_PLANESWALKER_RE = /(destroy|exile) target planeswalker/i;
const TARGET_LAND_RE = /(destroy|exile) target land/i;
const ALL_CREATURES_RE = /(destroy|exile|return) all creatures/i;
const ALL_ARTIFACTS_RE = /(destroy|exile) all artifacts/i;
const ALL_ENCHANTMENTS_RE = /(destroy|exile) all enchantments/i;
const ALL_PERMANENTS_RE = /(destroy|exile) all permanents/i;

function makeCoverage() {
  return { ...BLANK_COVERAGE };
}

export function detectInteractionTags(card: Card): InteractionTagSlice {
  const oracle = card.oracle_text;
  const reasons: string[] = [];
  const interactionCoverage = makeCoverage();

  let removalSpotScore = 0;
  if (TARGET_PERMANENT_RE.test(oracle)) {
    removalSpotScore = 1.5;
    interactionCoverage.creature = true;
    interactionCoverage.artifact = true;
    interactionCoverage.enchantment = true;
    interactionCoverage.planeswalker = true;
    interactionCoverage.land = true;
    reasons.push("interaction: spot removal");
  } else if (TARGET_ARTIFACT_OR_ENCHANTMENT_RE.test(oracle)) {
    removalSpotScore = 1;
    interactionCoverage.artifact = true;
    interactionCoverage.enchantment = true;
    reasons.push("interaction: spot removal");
  } else if (TARGET_CREATURE_RE.test(oracle)) {
    removalSpotScore = 1;
    interactionCoverage.creature = true;
    reasons.push("interaction: spot removal");
  } else if (TARGET_PLANESWALKER_RE.test(oracle)) {
    removalSpotScore = 1;
    interactionCoverage.planeswalker = true;
    reasons.push("interaction: spot removal");
  } else if (TARGET_LAND_RE.test(oracle)) {
    removalSpotScore = 1;
    interactionCoverage.land = true;
    reasons.push("interaction: spot removal");
  }

  let removalBoardwipeScore = 0;
  if (ALL_PERMANENTS_RE.test(oracle)) {
    removalBoardwipeScore = 1.5;
    interactionCoverage.creature = true;
    interactionCoverage.artifact = true;
    interactionCoverage.enchantment = true;
    interactionCoverage.planeswalker = true;
    interactionCoverage.land = true;
    reasons.push("interaction: board wipe");
  } else {
    let sweepTypes = 0;
    if (ALL_CREATURES_RE.test(oracle)) {
      interactionCoverage.creature = true;
      sweepTypes += 1;
    }
    if (ALL_ARTIFACTS_RE.test(oracle)) {
      interactionCoverage.artifact = true;
      sweepTypes += 1;
    }
    if (ALL_ENCHANTMENTS_RE.test(oracle)) {
      interactionCoverage.enchantment = true;
      sweepTypes += 1;
    }
    if (sweepTypes > 0) {
      removalBoardwipeScore = sweepTypes >= 2 ? 1.5 : 1;
      reasons.push("interaction: board wipe");
    }
  }

  let counterspellScore = 0;
  if (COUNTER_HARD_RE.test(oracle.trim())) {
    counterspellScore = 1;
    reasons.push("interaction: counterspell");
  } else if (COUNTER_SOFT_RE.test(oracle)) {
    counterspellScore = 0.6;
    reasons.push("interaction: counterspell");
  } else if (COUNTER_NARROW_RE.test(oracle)) {
    counterspellScore = 0.4;
    reasons.push("interaction: counterspell");
  }

  for (const type of Object.keys(interactionCoverage) as Array<keyof typeof interactionCoverage>) {
    if (interactionCoverage[type]) {
      reasons.push(`interaction: coverage against ${type}`);
    }
  }

  return {
    removalSpotScore,
    removalBoardwipeScore,
    counterspellScore,
    interactionCoverage,
    reasons,
  };
}
