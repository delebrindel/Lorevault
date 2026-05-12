import type { ResolvedDeck } from "../../types.js";
import { detectArchetype } from "../archetype/detect.js";
import { scoreConsistency } from "./consistency.js";
import { scoreResilience } from "./resilience.js";
import type { Archetype, AxisReport, CrispiReport, Grade } from "../types.js";

function gradeFromScore(score: number): Grade {
  if (score >= 95) return "S";
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

function makeStubAxis(): AxisReport {
  return {
    score: 0,
    grade: "F",
    subMetrics: [],
    evidence: [],
    notes: ["Not implemented yet in this backend slice."],
  };
}

function collectColorIdentity(deck: ResolvedDeck): Array<"W" | "U" | "B" | "R" | "G"> {
  const source = deck.commander.length > 0
    ? deck.commander
    : deck.mainboard.map((entry) => entry.card);
  const colors = new Set<"W" | "U" | "B" | "R" | "G">();
  for (const card of source) {
    for (const color of card.color_identity) {
      if (color === "W" || color === "U" || color === "B" || color === "R" || color === "G") {
        colors.add(color);
      }
    }
  }
  return [...colors];
}

export function scoreDeck(
  deck: ResolvedDeck,
  opts: { archetypeOverride?: Archetype } = {},
): CrispiReport {
  const detected = opts.archetypeOverride
    ? { archetype: opts.archetypeOverride }
    : detectArchetype(deck);

  const consistency = scoreConsistency(deck, detected.archetype);
  const resilience = scoreResilience(deck, detected.archetype);
  const interaction = makeStubAxis();
  const speed = makeStubAxis();

  const overall = Math.round((
    consistency.score + resilience.score + interaction.score + speed.score
  ) / 4);

  return {
    overall,
    axes: { consistency, resilience, interaction, speed },
    deckMeta: {
      commander: deck.commander.map((card) => card.name),
      archetype: detected.archetype,
      colorIdentity: collectColorIdentity(deck),
      cardCount: deck.commander.length + deck.mainboard.reduce((sum, entry) => sum + entry.qty, 0),
      unresolvedCount: deck.unresolved.length,
    },
    generatedAt: new Date().toISOString(),
  };
}

export { gradeFromScore };
