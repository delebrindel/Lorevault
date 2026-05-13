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
  interactionInstantSpeed: number;
  interactionFreeScore: number;
  interactionStaxScore: number;
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
const COUNTER_BROAD_RE = /counter target spell/i;
const COUNTER_NARROW_RE = /counter target (noncreature|creature|artifact|enchantment|planeswalker|instant|sorcery) spell/i;
const COUNTER_SOFT_RE = /counter target spell unless/i;
const COUNTER_ETB_RE = /when .* enters, counter target spell/i;
const TARGET_PERMANENT_RE = /(destroy|exile) target permanent/i;
const TARGET_CREATURE_RE = /(destroy|exile) target creature/i;
const TARGET_ARTIFACT_OR_ENCHANTMENT_RE = /(destroy|exile) target artifact or enchantment/i;
const TARGET_PLANESWALKER_RE = /(destroy|exile) target planeswalker/i;
const TARGET_LAND_RE = /(destroy|exile) target land/i;
const ALL_CREATURES_RE = /(destroy|exile|return) all creatures/i;
const ALL_ARTIFACTS_RE = /(destroy|exile) all artifacts/i;
const ALL_ENCHANTMENTS_RE = /(destroy|exile) all enchantments/i;
const ALL_PERMANENTS_RE = /(destroy|exile) all permanents/i;
const FLASH_RE = /\bFlash\b/i;
const FREE_CAST_RE = /without paying (?:its|their|this spell's|that spell's) mana cost/i;
const EXILE_ALT_COST_RE = /exile a .* card from your hand rather than pay/i;
const ZERO_ALT_COST_RE = /pay 0 rather than pay/i;
const COMMANDER_FREE_RE = /if you control a commander, you may cast this spell without paying its mana cost/i;
const RULE_OF_LAW_RE = /can't cast more than one spell each turn/i;
const SEARCH_DENIAL_RE = /if an opponent would search a library/i;
const CAST_RESTRICTION_RE = /opponents can't cast spells from anywhere other than their hands/i;
const UNTAP_DENIAL_RE = /players skip their untap steps/i;
const OPPONENT_TAX_RE = /spells your opponents cast cost .* more to cast/i;

function makeCoverage() {
  return { ...BLANK_COVERAGE };
}

export function detectInteractionTags(card: Card): InteractionTagSlice {
  const oracle = card.oracle_text;
  const typeLine = card.type_line;
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
  } else if (COUNTER_BROAD_RE.test(oracle)) {
    counterspellScore = 1;
    reasons.push("interaction: counterspell");
  } else if (COUNTER_ETB_RE.test(oracle)) {
    counterspellScore = 0.8;
    reasons.push("interaction: counterspell");
  }

  let interactionFreeScore = 0;
  if (
    counterspellScore > 0 &&
    (FREE_CAST_RE.test(oracle) || EXILE_ALT_COST_RE.test(oracle) || ZERO_ALT_COST_RE.test(oracle) || COMMANDER_FREE_RE.test(oracle))
  ) {
    interactionFreeScore = 1;
    reasons.push("interaction: free interaction");
  }

  let interactionStaxScore = 0;
  if (
    RULE_OF_LAW_RE.test(oracle) ||
    SEARCH_DENIAL_RE.test(oracle) ||
    CAST_RESTRICTION_RE.test(oracle) ||
    UNTAP_DENIAL_RE.test(oracle) ||
    OPPONENT_TAX_RE.test(oracle)
  ) {
    interactionStaxScore = 1;
    reasons.push("interaction: stax piece");
  }

  const isInstantSpeedInteraction =
    (removalSpotScore > 0 || removalBoardwipeScore > 0 || counterspellScore > 0) &&
    (/\bInstant\b/i.test(typeLine) || FLASH_RE.test(typeLine) || FLASH_RE.test(oracle));

  const interactionInstantSpeed = isInstantSpeedInteraction ? 1 : 0;
  if (interactionInstantSpeed > 0) {
    reasons.push("interaction: instant-speed interaction");
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
    interactionInstantSpeed,
    interactionFreeScore,
    interactionStaxScore,
    reasons,
  };
}
