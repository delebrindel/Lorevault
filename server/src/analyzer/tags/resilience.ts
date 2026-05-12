import type { Card } from "../../types.js";

export interface ResilienceTagSlice {
  recursionScore: number;
  protectionPermanentScore: number;
  protectionSpellScore: number;
  boardwipeSurvivalScore: number;
  graveyardRelianceScore: number;
  reasons: string[];
}

const COUNTERSPELL_RE = /counter target/i;
const BATTLEFIELD_RECURSION_RE = /(?:return|put) target .* from (?:your|a) graveyard to|(?:return|put) .* from (?:your|a) graveyard onto the battlefield/i;
const HAND_RECURSION_RE = /return target .* from your graveyard to your hand|return .* from your graveyard to your hand/i;
const PROTECTION_KEYWORD_RE = /\b(hexproof|indestructible|shroud|ward|phasing|phase out|regenerate)\b/i;
const TEAM_PROTECTION_RE = /(permanents|creatures) you control gain .*?(hexproof|indestructible)|phase out|regenerate each creature you control/i;
const SAC_PROTECTION_RE = /sacrifice .*: .*creatures you control gain indestructible/i;
const GRAVEYARD_RELIANCE_RE = /from (?:your|a) graveyard|in your graveyard/i;

export function detectResilienceTags(card: Card): ResilienceTagSlice {
  const reasons: string[] = [];
  const oracle = card.oracle_text;
  const typeLine = card.type_line;
  const isSpell = /\bInstant\b|\bSorcery\b/i.test(typeLine);
  const isPermanent = !isSpell;

  let recursionScore = 0;
  if (BATTLEFIELD_RECURSION_RE.test(oracle)) {
    recursionScore = 1.5;
    reasons.push("recursion: battlefield rebuy");
  } else if (HAND_RECURSION_RE.test(oracle)) {
    recursionScore = 1;
    reasons.push("recursion: hand rebuy");
  }

  let protectionPermanentScore = 0;
  if (isPermanent && (PROTECTION_KEYWORD_RE.test(oracle) || PROTECTION_KEYWORD_RE.test(typeLine))) {
    protectionPermanentScore = 1;
    reasons.push("protection: permanent-based protection");
  }
  if (isPermanent && SAC_PROTECTION_RE.test(oracle)) {
    protectionPermanentScore = Math.max(protectionPermanentScore, 1.5);
    if (!reasons.includes("protection: permanent-based protection")) {
      reasons.push("protection: permanent-based protection");
    }
  }

  let protectionSpellScore = 0;
  if (isSpell && !COUNTERSPELL_RE.test(oracle) && TEAM_PROTECTION_RE.test(oracle)) {
    protectionSpellScore = 1.5;
    reasons.push("protection: spell-based protection");
  } else if (
    isSpell &&
    !COUNTERSPELL_RE.test(oracle) &&
    PROTECTION_KEYWORD_RE.test(oracle) &&
    /you control|target permanent you control|target creature you control/i.test(oracle)
  ) {
    protectionSpellScore = 1;
    reasons.push("protection: spell-based protection");
  }

  let boardwipeSurvivalScore = 0;
  if (TEAM_PROTECTION_RE.test(oracle) || SAC_PROTECTION_RE.test(oracle)) {
    boardwipeSurvivalScore = 1.5;
    reasons.push("survival: wipe protection");
  } else if (isPermanent && /\bindestructible\b/i.test(oracle)) {
    boardwipeSurvivalScore = 1;
    reasons.push("survival: self survives wipes");
  }

  let graveyardRelianceScore = 0;
  if (GRAVEYARD_RELIANCE_RE.test(oracle)) {
    graveyardRelianceScore = recursionScore > 0 ? 1.5 : 1;
    reasons.push("graveyard: reliance on graveyard resource");
  }

  return {
    recursionScore,
    protectionPermanentScore,
    protectionSpellScore,
    boardwipeSurvivalScore,
    graveyardRelianceScore,
    reasons,
  };
}
