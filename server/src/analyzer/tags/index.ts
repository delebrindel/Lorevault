import type { Card } from "../../types.js";
import type { CardTags } from "../types.js";

const DRAW_TRIGGER_RE = /(at the beginning of|whenever|whenever one or more)/i;
const DRAW_RE = /draws? (a|one|two|three|x) cards?/i;
const TUTOR_ANY_RE = /search your library for a card/i;
const TUTOR_NARROW_RE = /search your library for (an? )?(artifact|creature|enchantment|instant|sorcery) card/i;
const TUTOR_LAND_RE = /search your library for .*land card/i;
const MANA_ADD_RE = /add (one mana|\{[WUBRGC]\}|two mana|three mana)/i;
const COST_REDUCER_RE = /spells? you cast cost .* less to cast/i;
const LAND_RAMP_RE = /search your library for .*land card.*put .* onto the battlefield/i;
const MANA_DORK_RE = /^Creature/i;

export function tagCard(card: Card): CardTags {
  const reasons: string[] = [];
  const oracle = card.oracle_text;
  const isLand = /\bLand\b/i.test(card.type_line);

  let rampScore = 0;
  if (!isLand && MANA_ADD_RE.test(oracle)) {
    rampScore = 1;
    reasons.push("ramp: mana production effect");
  } else if (!isLand && LAND_RAMP_RE.test(oracle)) {
    rampScore = 1;
    reasons.push("ramp: land ramp effect");
  } else if (!isLand && MANA_DORK_RE.test(card.type_line) && MANA_ADD_RE.test(oracle)) {
    rampScore = 1;
    reasons.push("ramp: mana dork effect");
  } else if (!isLand && COST_REDUCER_RE.test(oracle)) {
    rampScore = 1;
    reasons.push("ramp: cost reduction effect");
  }

  let drawScore = 0;
  if (DRAW_RE.test(oracle)) {
    drawScore = DRAW_TRIGGER_RE.test(oracle) ? 2 : 1;
    reasons.push(drawScore === 2 ? "draw: recurring engine" : "draw: one-shot draw");
  }

  let tutorScore = 0;
  if (TUTOR_ANY_RE.test(oracle)) {
    tutorScore = 1.5;
    reasons.push("tutor: broad tutor");
  } else if (TUTOR_NARROW_RE.test(oracle)) {
    tutorScore = 1;
    reasons.push("tutor: narrow tutor");
  } else if (TUTOR_LAND_RE.test(oracle)) {
    tutorScore = 0.5;
    reasons.push("tutor: land tutor");
  }

  return {
    isLand,
    rampScore,
    drawScore,
    tutorScore,
    recursionScore: 0,
    protectionPermanentScore: 0,
    protectionSpellScore: 0,
    boardwipeSurvivalScore: 0,
    graveyardRelianceScore: 0,
    reasons,
  };
}
