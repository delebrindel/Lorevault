import type { Card } from "../../types.js";

export interface SpeedTagSlice {
  fastManaTierScore: number;
  earlyRampScore: number;
  lowDropSpeedScore: number;
  reasons: string[];
}

const FAST_MANA_TIERS: Record<string, 40 | 20 | 10> = {
  "Sol Ring": 40,
  "Mana Crypt": 40,
  "Jeweled Lotus": 40,
  "Mana Vault": 40,
  "Chrome Mox": 20,
  "Mox Diamond": 20,
  "Lotus Petal": 20,
  "Ancient Tomb": 20,
  "Grim Monolith": 10,
  "City of Traitors": 10,
  "Mox Opal": 10,
  "Mox Amber": 10,
};

const MANA_ADD_RE = /add (one mana|\{[WUBRGC]\}|two mana|three mana)/i;
const LAND_RAMP_RE = /search your library for .*land card.*put .* onto the battlefield/i;
const COST_REDUCER_RE = /spells? you cast cost .* less to cast/i;
const MANA_DORK_RE = /^Creature/i;

function isRampCard(card: Card): boolean {
  const oracle = card.oracle_text;
  if (FAST_MANA_TIERS[card.name] !== undefined) return true;
  if (MANA_ADD_RE.test(oracle)) return true;
  if (LAND_RAMP_RE.test(oracle)) return true;
  if (COST_REDUCER_RE.test(oracle)) return true;
  if (MANA_DORK_RE.test(card.type_line) && MANA_ADD_RE.test(oracle)) return true;
  return false;
}

export function detectSpeedTags(card: Card): SpeedTagSlice {
  const reasons: string[] = [];
  const isLand = /\bLand\b/i.test(card.type_line);
  const isRamp = isRampCard(card);

  const fastManaTierScore = FAST_MANA_TIERS[card.name] ?? 0;
  if (fastManaTierScore > 0) {
    reasons.push("speed: fast mana");
  }

  const earlyRampScore = !isLand && isRamp && card.cmc <= 2 ? 1 : 0;
  if (earlyRampScore > 0) {
    reasons.push("speed: early ramp");
  }

  const lowDropSpeedScore = !isLand && card.cmc <= 2 && !isRamp ? 1 : 0;
  if (lowDropSpeedScore > 0) {
    reasons.push("speed: low drop");
  }

  return {
    fastManaTierScore,
    earlyRampScore,
    lowDropSpeedScore,
    reasons,
  };
}
