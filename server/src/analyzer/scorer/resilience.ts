import type { ResolvedDeck } from "../../types.js";
import { tagCard } from "../tags/index.js";
import type { Archetype, AxisReport, CardEvidence, SubMetric } from "../types.js";
import { gradeFromScore } from "./index.js";

const TARGETS: Record<Archetype, {
  recursion: { min: number; ideal: number; max: number };
  permanentProtection: { min: number; ideal: number; max: number };
  spellProtection: { min: number; ideal: number; max: number };
  wipeSurvival: { min: number; ideal: number; max: number };
}> = {
  "aggro/voltron": {
    recursion: { min: 2, ideal: 4, max: 7 },
    permanentProtection: { min: 4, ideal: 6, max: 9 },
    spellProtection: { min: 1, ideal: 3, max: 5 },
    wipeSurvival: { min: 8, ideal: 15, max: 25 },
  },
  "midrange/goodstuff": {
    recursion: { min: 3, ideal: 5, max: 8 },
    permanentProtection: { min: 2, ideal: 4, max: 6 },
    spellProtection: { min: 2, ideal: 4, max: 6 },
    wipeSurvival: { min: 10, ideal: 18, max: 28 },
  },
  control: {
    recursion: { min: 2, ideal: 4, max: 6 },
    permanentProtection: { min: 2, ideal: 4, max: 6 },
    spellProtection: { min: 4, ideal: 7, max: 12 },
    wipeSurvival: { min: 12, ideal: 20, max: 30 },
  },
  combo: {
    recursion: { min: 2, ideal: 4, max: 6 },
    permanentProtection: { min: 2, ideal: 4, max: 6 },
    spellProtection: { min: 4, ideal: 8, max: 14 },
    wipeSurvival: { min: 5, ideal: 12, max: 22 },
  },
  "aristocrats/sacrifice": {
    recursion: { min: 4, ideal: 7, max: 11 },
    permanentProtection: { min: 2, ideal: 4, max: 6 },
    spellProtection: { min: 1, ideal: 3, max: 5 },
    wipeSurvival: { min: 15, ideal: 25, max: 35 },
  },
  spellslinger: {
    recursion: { min: 2, ideal: 4, max: 6 },
    permanentProtection: { min: 1, ideal: 3, max: 5 },
    spellProtection: { min: 3, ideal: 6, max: 10 },
    wipeSurvival: { min: 5, ideal: 10, max: 18 },
  },
  "tokens/go-wide": {
    recursion: { min: 2, ideal: 4, max: 7 },
    permanentProtection: { min: 2, ideal: 4, max: 6 },
    spellProtection: { min: 1, ideal: 3, max: 5 },
    wipeSurvival: { min: 8, ideal: 15, max: 25 },
  },
  "reanimator/graveyard": {
    recursion: { min: 6, ideal: 10, max: 14 },
    permanentProtection: { min: 2, ideal: 4, max: 6 },
    spellProtection: { min: 2, ideal: 4, max: 6 },
    wipeSurvival: { min: 10, ideal: 18, max: 28 },
  },
  "lands/landfall": {
    recursion: { min: 3, ideal: 5, max: 8 },
    permanentProtection: { min: 1, ideal: 3, max: 5 },
    spellProtection: { min: 2, ideal: 4, max: 6 },
    wipeSurvival: { min: 12, ideal: 22, max: 32 },
  },
};

const GRAVEYARD_EXPOSURE_THRESHOLD = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function scoreAgainstTarget(
  raw: number,
  target: { min: number; ideal: number; max: number },
): number {
  if (raw <= 0) return 0;
  if (raw < target.min) {
    return Math.round((raw / target.min) * 60);
  }
  if (raw <= target.ideal) {
    return Math.round(60 + ((raw - target.min) / Math.max(1, target.ideal - target.min)) * 40);
  }
  if (raw <= target.max) {
    return 100;
  }
  const headroom = Math.max(1, Math.round(target.max * 0.5));
  const overflow = raw - target.max;
  return Math.round(clamp(100 - (overflow / headroom) * 40, 60, 100));
}

function scoreGraveyardExposure(rawReliance: number): number {
  if (rawReliance <= GRAVEYARD_EXPOSURE_THRESHOLD) return 100;
  if (rawReliance <= GRAVEYARD_EXPOSURE_THRESHOLD + 2) return 60;
  return 35;
}

export function scoreResilience(deck: ResolvedDeck, archetype: Archetype): AxisReport {
  const target = TARGETS[archetype];
  const evidence: CardEvidence[] = [];

  let recursionRaw = 0;
  let permanentProtectionRaw = 0;
  let spellProtectionRaw = 0;
  let wipeSurvivalRaw = 0;
  let graveyardRelianceRaw = 0;

  const recursionCards = new Set<string>();
  const permanentProtectionCards = new Set<string>();
  const spellProtectionCards = new Set<string>();
  const wipeSurvivalCards = new Set<string>();
  const graveyardRelianceCards = new Set<string>();

  for (const entry of deck.mainboard) {
    const tags = tagCard(entry.card);

    if (tags.recursionScore > 0) {
      recursionRaw += tags.recursionScore * entry.qty;
      recursionCards.add(entry.card.name);
      evidence.push({
        card: entry.card.name,
        axis: "R",
        subMetric: "recursion.count",
        contribution: tags.recursionScore * entry.qty,
        reason: tags.reasons.find((r) => r.startsWith("recursion:")) ?? "recursion contribution",
      });
    }

    if (tags.protectionPermanentScore > 0) {
      permanentProtectionRaw += tags.protectionPermanentScore * entry.qty;
      permanentProtectionCards.add(entry.card.name);
      evidence.push({
        card: entry.card.name,
        axis: "R",
        subMetric: "protection.permanents",
        contribution: tags.protectionPermanentScore * entry.qty,
        reason: tags.reasons.find((r) => r === "protection: permanent-based protection") ?? "permanent protection contribution",
      });
    }

    if (tags.protectionSpellScore > 0) {
      spellProtectionRaw += tags.protectionSpellScore * entry.qty;
      spellProtectionCards.add(entry.card.name);
      evidence.push({
        card: entry.card.name,
        axis: "R",
        subMetric: "protection.spells",
        contribution: tags.protectionSpellScore * entry.qty,
        reason: tags.reasons.find((r) => r === "protection: spell-based protection") ?? "spell protection contribution",
      });
    }

    if (tags.boardwipeSurvivalScore > 0) {
      wipeSurvivalRaw += tags.boardwipeSurvivalScore * entry.qty;
      wipeSurvivalCards.add(entry.card.name);
      evidence.push({
        card: entry.card.name,
        axis: "R",
        subMetric: "boardwipe.survivability",
        contribution: tags.boardwipeSurvivalScore * entry.qty,
        reason: tags.reasons.find((r) => r.startsWith("survival:")) ?? "wipe survival contribution",
      });
    }

    if (tags.graveyardRelianceScore > 0) {
      graveyardRelianceRaw += tags.graveyardRelianceScore * entry.qty;
      graveyardRelianceCards.add(entry.card.name);
      evidence.push({
        card: entry.card.name,
        axis: "R",
        subMetric: "graveyard.exposure",
        contribution: tags.graveyardRelianceScore * entry.qty,
        reason: tags.reasons.find((r) => r.startsWith("graveyard:")) ?? "graveyard reliance contribution",
      });
    }
  }

  const subMetrics: SubMetric[] = [
    {
      key: "recursion.count",
      label: "Recursion / rebuy",
      raw: Number(recursionRaw.toFixed(2)),
      target: target.recursion,
      score: scoreAgainstTarget(recursionRaw, target.recursion),
      weight: 0.25,
      contributingCards: [...recursionCards],
    },
    {
      key: "protection.permanents",
      label: "Permanent protection",
      raw: Number(permanentProtectionRaw.toFixed(2)),
      target: target.permanentProtection,
      score: scoreAgainstTarget(permanentProtectionRaw, target.permanentProtection),
      weight: 0.20,
      contributingCards: [...permanentProtectionCards],
    },
    {
      key: "protection.spells",
      label: "Protective spells",
      raw: Number(spellProtectionRaw.toFixed(2)),
      target: target.spellProtection,
      score: scoreAgainstTarget(spellProtectionRaw, target.spellProtection),
      weight: 0.15,
      contributingCards: [...spellProtectionCards],
    },
    {
      key: "boardwipe.survivability",
      label: "Boardwipe survivability",
      raw: Number(wipeSurvivalRaw.toFixed(2)),
      target: target.wipeSurvival,
      score: scoreAgainstTarget(wipeSurvivalRaw, target.wipeSurvival),
      weight: 0.25,
      contributingCards: [...wipeSurvivalCards],
    },
    {
      key: "graveyard.exposure",
      label: "Graveyard exposure",
      raw: Number(graveyardRelianceRaw.toFixed(2)),
      target: { min: 0, ideal: 0, max: GRAVEYARD_EXPOSURE_THRESHOLD },
      score: scoreGraveyardExposure(graveyardRelianceRaw),
      weight: 0.15,
      contributingCards: [...graveyardRelianceCards],
    },
  ];

  const weightedScore = subMetrics.reduce((sum, item) => sum + item.score * item.weight, 0);
  const totalWeight = subMetrics.reduce((sum, item) => sum + item.weight, 0);
  const score = Math.round(weightedScore / totalWeight);

  const notes: string[] = [];
  if (recursionRaw < target.recursion.min) {
    notes.push(`Recursion is below the ${archetype} minimum target.`);
  }
  if (permanentProtectionRaw < target.permanentProtection.min) {
    notes.push(`Permanent-based protection is below the ${archetype} minimum target.`);
  }
  if (spellProtectionRaw < target.spellProtection.min) {
    notes.push(`Protective spell density is below the ${archetype} minimum target.`);
  }
  if (wipeSurvivalRaw < target.wipeSurvival.min) {
    notes.push(`Boardwipe survivability is below the ${archetype} minimum target.`);
  }
  if (graveyardRelianceRaw > GRAVEYARD_EXPOSURE_THRESHOLD) {
    notes.push("This deck shows meaningful graveyard reliance and may be exposed to graveyard hate.");
  }

  return {
    score,
    grade: gradeFromScore(score),
    subMetrics,
    evidence,
    notes,
  };
}
