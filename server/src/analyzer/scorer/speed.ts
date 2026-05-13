import type { ResolvedDeck } from "../../types.js";
import { tagCard } from "../tags/index.js";
import type { Archetype, AxisReport, CardEvidence, SubMetric } from "../types.js";
import { gradeFromScore } from "./index.js";

const TARGETS: Record<Archetype, {
  fastMana: { min: number; ideal: number; max: number };
  earlyRamp: { min: number; ideal: number; max: number };
  avgCmc: { min: number; ideal: number; max: number };
  lowDrops: { min: number; ideal: number; max: number };
}> = {
  "aggro/voltron": {
    fastMana: { min: 30, ideal: 50, max: 75 },
    earlyRamp: { min: 6, ideal: 9, max: 12 },
    avgCmc: { min: 2.4, ideal: 2.6, max: 2.8 },
    lowDrops: { min: 18, ideal: 24, max: 30 },
  },
  "midrange/goodstuff": {
    fastMana: { min: 25, ideal: 40, max: 60 },
    earlyRamp: { min: 5, ideal: 8, max: 11 },
    avgCmc: { min: 3.0, ideal: 3.2, max: 3.4 },
    lowDrops: { min: 12, ideal: 16, max: 22 },
  },
  control: {
    fastMana: { min: 20, ideal: 35, max: 55 },
    earlyRamp: { min: 4, ideal: 7, max: 10 },
    avgCmc: { min: 2.8, ideal: 3.0, max: 3.2 },
    lowDrops: { min: 14, ideal: 18, max: 24 },
  },
  combo: {
    fastMana: { min: 50, ideal: 70, max: 90 },
    earlyRamp: { min: 7, ideal: 10, max: 14 },
    avgCmc: { min: 2.4, ideal: 2.65, max: 2.9 },
    lowDrops: { min: 14, ideal: 18, max: 24 },
  },
  "aristocrats/sacrifice": {
    fastMana: { min: 25, ideal: 40, max: 60 },
    earlyRamp: { min: 5, ideal: 8, max: 11 },
    avgCmc: { min: 2.6, ideal: 2.8, max: 3.0 },
    lowDrops: { min: 16, ideal: 20, max: 26 },
  },
  spellslinger: {
    fastMana: { min: 25, ideal: 40, max: 60 },
    earlyRamp: { min: 4, ideal: 7, max: 10 },
    avgCmc: { min: 2.4, ideal: 2.6, max: 2.8 },
    lowDrops: { min: 18, ideal: 24, max: 30 },
  },
  "tokens/go-wide": {
    fastMana: { min: 25, ideal: 40, max: 60 },
    earlyRamp: { min: 5, ideal: 8, max: 11 },
    avgCmc: { min: 2.8, ideal: 3.0, max: 3.2 },
    lowDrops: { min: 12, ideal: 16, max: 22 },
  },
  "reanimator/graveyard": {
    fastMana: { min: 35, ideal: 55, max: 75 },
    earlyRamp: { min: 6, ideal: 9, max: 12 },
    avgCmc: { min: 2.8, ideal: 3.0, max: 3.2 },
    lowDrops: { min: 16, ideal: 20, max: 26 },
  },
  "lands/landfall": {
    fastMana: { min: 20, ideal: 35, max: 55 },
    earlyRamp: { min: 5, ideal: 8, max: 11 },
    avgCmc: { min: 2.6, ideal: 2.8, max: 3.0 },
    lowDrops: { min: 12, ideal: 16, max: 22 },
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function scoreAgainstTarget(
  raw: number,
  target: { min: number; ideal: number; max: number },
): number {
  if (raw <= 0) return 0;
  if (raw < target.min) {
    return Math.round((raw / Math.max(1, target.min)) * 60);
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

function scoreAverageCmc(raw: number, target: { min: number; ideal: number; max: number }): number {
  if (raw <= 0) return 0;
  const midpoint = target.ideal;
  const distance = Math.abs(raw - midpoint);
  return Math.round(clamp(100 - distance * 50, 0, 100));
}

export function scoreSpeed(deck: ResolvedDeck, archetype: Archetype): AxisReport {
  const target = TARGETS[archetype];
  const evidence: CardEvidence[] = [];

  let fastManaRaw = 0;
  let earlyRampRaw = 0;
  let lowDropsRaw = 0;
  let totalNonlandCmc = 0;
  let totalNonlandCount = 0;

  const fastManaCards = new Set<string>();
  const earlyRampCards = new Set<string>();
  const lowDropCards = new Set<string>();

  for (const entry of deck.mainboard) {
    const tags = tagCard(entry.card);
    if (tags.isLand) continue;

    totalNonlandCmc += entry.card.cmc * entry.qty;
    totalNonlandCount += entry.qty;

    if (tags.fastManaTierScore > 0) {
      fastManaRaw += tags.fastManaTierScore * entry.qty;
      fastManaCards.add(entry.card.name);
      evidence.push({
        card: entry.card.name,
        axis: "S",
        subMetric: "mana.fast",
        contribution: tags.fastManaTierScore * entry.qty,
        reason: tags.reasons.find((r) => r === "speed: fast mana") ?? "fast mana contribution",
      });
    }

    if (tags.earlyRampScore > 0) {
      earlyRampRaw += tags.earlyRampScore * entry.qty;
      earlyRampCards.add(entry.card.name);
      evidence.push({
        card: entry.card.name,
        axis: "S",
        subMetric: "mana.earlyRamp",
        contribution: tags.earlyRampScore * entry.qty,
        reason: tags.reasons.find((r) => r === "speed: early ramp") ?? "early ramp contribution",
      });
    }

    if (tags.lowDropSpeedScore > 0) {
      lowDropsRaw += tags.lowDropSpeedScore * entry.qty;
      lowDropCards.add(entry.card.name);
      evidence.push({
        card: entry.card.name,
        axis: "S",
        subMetric: "curve.lowDrops",
        contribution: tags.lowDropSpeedScore * entry.qty,
        reason: tags.reasons.find((r) => r === "speed: low drop") ?? "low drop contribution",
      });
    }
  }

  const avgCmcRaw = totalNonlandCount === 0 ? 0 : Number((totalNonlandCmc / totalNonlandCount).toFixed(2));

  const subMetrics: SubMetric[] = [
    {
      key: "mana.fast",
      label: "Fast mana",
      raw: Math.min(100, fastManaRaw),
      target: target.fastMana,
      score: scoreAgainstTarget(Math.min(100, fastManaRaw), target.fastMana),
      weight: 0.30,
      contributingCards: [...fastManaCards],
    },
    {
      key: "mana.earlyRamp",
      label: "Early ramp density",
      raw: Number(earlyRampRaw.toFixed(2)),
      target: target.earlyRamp,
      score: scoreAgainstTarget(earlyRampRaw, target.earlyRamp),
      weight: 0.25,
      contributingCards: [...earlyRampCards],
    },
    {
      key: "curve.avgCMC",
      label: "Average mana value",
      raw: avgCmcRaw,
      target: target.avgCmc,
      score: scoreAverageCmc(avgCmcRaw, target.avgCmc),
      weight: 0.25,
      contributingCards: [],
    },
    {
      key: "curve.lowDrops",
      label: "Low-drop density",
      raw: Number(lowDropsRaw.toFixed(2)),
      target: target.lowDrops,
      score: scoreAgainstTarget(lowDropsRaw, target.lowDrops),
      weight: 0.20,
      contributingCards: [...lowDropCards],
    },
  ];

  const weightedScore = subMetrics.reduce((sum, item) => sum + item.score * item.weight, 0);
  const totalWeight = subMetrics.reduce((sum, item) => sum + item.weight, 0);
  const score = Math.round(weightedScore / totalWeight);

  const notes: string[] = [];
  if (Math.min(100, fastManaRaw) < target.fastMana.min) {
    notes.push(`Fast mana is below the ${archetype} minimum target.`);
  }
  if (earlyRampRaw < target.earlyRamp.min) {
    notes.push(`Early ramp density is below the ${archetype} minimum target.`);
  }
  if (avgCmcRaw < target.avgCmc.min || avgCmcRaw > target.avgCmc.max) {
    notes.push(`Average mana value is outside the ${archetype} target band.`);
  }
  if (lowDropsRaw < target.lowDrops.min) {
    notes.push(`Low-drop density is below the ${archetype} minimum target.`);
  }
  notes.push("Threat density, win-turn estimate, and tutor-speed remain deferred in this Speed MVP slice.");

  return {
    score,
    grade: gradeFromScore(score),
    subMetrics,
    evidence,
    notes,
  };
}
