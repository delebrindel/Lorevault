import type { ResolvedDeck } from "../../types.js";
import { tagCard } from "../tags/index.js";
import type { Archetype, AxisReport, CardEvidence, SubMetric } from "../types.js";
import { gradeFromScore } from "./index.js";
import { WIN_TURN_TARGETS } from "./speed.constants.js";

const TARGETS: Record<Archetype, {
  fastMana: { min: number; ideal: number; max: number };
  earlyRamp: { min: number; ideal: number; max: number };
  avgCmc: { min: number; ideal: number; max: number };
  lowDrops: { min: number; ideal: number; max: number };
  threatDensity: { min: number; ideal: number; max: number };
  winconTurn: { min: number; ideal: number; max: number };
  tutorSpeed: { min: number; ideal: number; max: number };
}> = {
  "aggro/voltron": {
    fastMana: { min: 30, ideal: 50, max: 75 },
    earlyRamp: { min: 6, ideal: 9, max: 12 },
    avgCmc: { min: 2.4, ideal: 2.6, max: 2.8 },
    lowDrops: { min: 18, ideal: 24, max: 30 },
    threatDensity: { min: 8, ideal: 12, max: 16 },
    winconTurn: WIN_TURN_TARGETS["aggro/voltron"],
    tutorSpeed: { min: 0, ideal: 1, max: 3 },
  },
  "midrange/goodstuff": {
    fastMana: { min: 25, ideal: 40, max: 60 },
    earlyRamp: { min: 5, ideal: 8, max: 11 },
    avgCmc: { min: 3.0, ideal: 3.2, max: 3.4 },
    lowDrops: { min: 12, ideal: 16, max: 22 },
    threatDensity: { min: 6, ideal: 9, max: 13 },
    winconTurn: WIN_TURN_TARGETS["midrange/goodstuff"],
    tutorSpeed: { min: 0, ideal: 1, max: 3 },
  },
  control: {
    fastMana: { min: 20, ideal: 35, max: 55 },
    earlyRamp: { min: 4, ideal: 7, max: 10 },
    avgCmc: { min: 2.8, ideal: 3.0, max: 3.2 },
    lowDrops: { min: 14, ideal: 18, max: 24 },
    threatDensity: { min: 3, ideal: 5, max: 8 },
    winconTurn: WIN_TURN_TARGETS.control,
    tutorSpeed: { min: 0, ideal: 1, max: 3 },
  },
  combo: {
    fastMana: { min: 50, ideal: 70, max: 90 },
    earlyRamp: { min: 7, ideal: 10, max: 14 },
    avgCmc: { min: 2.4, ideal: 2.65, max: 2.9 },
    lowDrops: { min: 14, ideal: 18, max: 24 },
    threatDensity: { min: 2, ideal: 4, max: 7 },
    winconTurn: WIN_TURN_TARGETS.combo,
    tutorSpeed: { min: 1, ideal: 2, max: 4 },
  },
  "aristocrats/sacrifice": {
    fastMana: { min: 25, ideal: 40, max: 60 },
    earlyRamp: { min: 5, ideal: 8, max: 11 },
    avgCmc: { min: 2.6, ideal: 2.8, max: 3.0 },
    lowDrops: { min: 16, ideal: 20, max: 26 },
    threatDensity: { min: 5, ideal: 8, max: 12 },
    winconTurn: WIN_TURN_TARGETS["aristocrats/sacrifice"],
    tutorSpeed: { min: 0, ideal: 1, max: 3 },
  },
  spellslinger: {
    fastMana: { min: 25, ideal: 40, max: 60 },
    earlyRamp: { min: 4, ideal: 7, max: 10 },
    avgCmc: { min: 2.4, ideal: 2.6, max: 2.8 },
    lowDrops: { min: 18, ideal: 24, max: 30 },
    threatDensity: { min: 4, ideal: 7, max: 11 },
    winconTurn: WIN_TURN_TARGETS.spellslinger,
    tutorSpeed: { min: 0, ideal: 1, max: 3 },
  },
  "tokens/go-wide": {
    fastMana: { min: 25, ideal: 40, max: 60 },
    earlyRamp: { min: 5, ideal: 8, max: 11 },
    avgCmc: { min: 2.8, ideal: 3.0, max: 3.2 },
    lowDrops: { min: 12, ideal: 16, max: 22 },
    threatDensity: { min: 6, ideal: 9, max: 13 },
    winconTurn: WIN_TURN_TARGETS["tokens/go-wide"],
    tutorSpeed: { min: 0, ideal: 1, max: 3 },
  },
  "reanimator/graveyard": {
    fastMana: { min: 35, ideal: 55, max: 75 },
    earlyRamp: { min: 6, ideal: 9, max: 12 },
    avgCmc: { min: 2.8, ideal: 3.0, max: 3.2 },
    lowDrops: { min: 16, ideal: 20, max: 26 },
    threatDensity: { min: 4, ideal: 7, max: 11 },
    winconTurn: WIN_TURN_TARGETS["reanimator/graveyard"],
    tutorSpeed: { min: 0, ideal: 1, max: 3 },
  },
  "lands/landfall": {
    fastMana: { min: 20, ideal: 35, max: 55 },
    earlyRamp: { min: 5, ideal: 8, max: 11 },
    avgCmc: { min: 2.6, ideal: 2.8, max: 3.0 },
    lowDrops: { min: 12, ideal: 16, max: 22 },
    threatDensity: { min: 4, ideal: 7, max: 11 },
    winconTurn: WIN_TURN_TARGETS["lands/landfall"],
    tutorSpeed: { min: 0, ideal: 1, max: 3 },
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

function scoreWinTurn(rawTurn: number, target: { min: number; ideal: number; max: number }): number {
  if (rawTurn <= 0) return 0;
  if (rawTurn <= target.max) return 100;
  if (rawTurn <= target.ideal) {
    return Math.round(100 - (rawTurn - target.max) * 10);
  }
  if (rawTurn <= target.min) {
    return Math.round(80 - (rawTurn - target.ideal) * 12);
  }
  return Math.max(0, Math.round(50 - (rawTurn - target.min) * 10));
}

export function scoreSpeed(deck: ResolvedDeck, archetype: Archetype): AxisReport {
  const target = TARGETS[archetype];
  const evidence: CardEvidence[] = [];

  let fastManaRaw = 0;
  let earlyRampRaw = 0;
  let lowDropsRaw = 0;
  let threatRaw = 0;
  let tutorSpeedRaw = 0;
  let totalNonlandCmc = 0;
  let totalNonlandCount = 0;

  const fastManaCards = new Set<string>();
  const earlyRampCards = new Set<string>();
  const lowDropCards = new Set<string>();
  const threatCards = new Set<string>();
  const tutorCards = new Set<string>();

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

    if (tags.threatDensityScore > 0) {
      threatRaw += tags.threatDensityScore * entry.qty;
      threatCards.add(entry.card.name);
      evidence.push({
        card: entry.card.name,
        axis: "S",
        subMetric: "threat.density",
        contribution: tags.threatDensityScore * entry.qty,
        reason: tags.reasons.find((r) => r === "speed: threat density") ?? "threat density contribution",
      });
    }

    if (tags.tutorSpeedScore > 0) {
      tutorSpeedRaw += tags.tutorSpeedScore * entry.qty;
      tutorCards.add(entry.card.name);
      evidence.push({
        card: entry.card.name,
        axis: "S",
        subMetric: "tutor.speed",
        contribution: tags.tutorSpeedScore * entry.qty,
        reason: tags.reasons.find((r) => r === "speed: tutor-speed contribution") ?? "tutor-speed contribution",
      });
    }
  }

  const avgCmcRaw = totalNonlandCount === 0 ? 0 : Number((totalNonlandCmc / totalNonlandCount).toFixed(2));

  const estimatedTurn = Math.max(
    target.winconTurn.max,
    Math.round((deck.commander[0]?.cmc ?? 4) + Math.max(0, avgCmcRaw - 2.5) - Math.min(3, earlyRampRaw * 0.2 + tutorSpeedRaw * 0.3 + Math.min(2, fastManaRaw / 40))),
  );

  const subMetrics: SubMetric[] = [
    {
      key: "mana.fast",
      label: "Fast mana",
      raw: Math.min(100, fastManaRaw),
      target: target.fastMana,
      score: scoreAgainstTarget(Math.min(100, fastManaRaw), target.fastMana),
      weight: 0.20,
      contributingCards: [...fastManaCards],
    },
    {
      key: "mana.earlyRamp",
      label: "Early ramp density",
      raw: Number(earlyRampRaw.toFixed(2)),
      target: target.earlyRamp,
      score: scoreAgainstTarget(earlyRampRaw, target.earlyRamp),
      weight: 0.15,
      contributingCards: [...earlyRampCards],
    },
    {
      key: "curve.avgCMC",
      label: "Average mana value",
      raw: avgCmcRaw,
      target: target.avgCmc,
      score: scoreAverageCmc(avgCmcRaw, target.avgCmc),
      weight: 0.15,
      contributingCards: [],
    },
    {
      key: "curve.lowDrops",
      label: "Low-drop density",
      raw: Number(lowDropsRaw.toFixed(2)),
      target: target.lowDrops,
      score: scoreAgainstTarget(lowDropsRaw, target.lowDrops),
      weight: 0.10,
      contributingCards: [...lowDropCards],
    },
    {
      key: "threat.density",
      label: "Threat density",
      raw: Number(threatRaw.toFixed(2)),
      target: target.threatDensity,
      score: scoreAgainstTarget(threatRaw, target.threatDensity),
      weight: 0.20,
      contributingCards: [...threatCards],
    },
    {
      key: "wincon.turnEstimate",
      label: "Estimated goldfish turn",
      raw: estimatedTurn,
      target: target.winconTurn,
      score: scoreWinTurn(estimatedTurn, target.winconTurn),
      weight: 0.15,
      contributingCards: [],
    },
    {
      key: "tutor.speed",
      label: "Tutor speed contribution",
      raw: Number(tutorSpeedRaw.toFixed(2)),
      target: target.tutorSpeed,
      score: scoreAgainstTarget(tutorSpeedRaw, target.tutorSpeed),
      weight: 0.05,
      contributingCards: [...tutorCards],
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
  if (threatRaw < target.threatDensity.min) {
    notes.push(`Threat density is below the ${archetype} minimum target.`);
  }
  if (estimatedTurn > target.winconTurn.min) {
    notes.push(`Estimated goldfish turn is slower than the ${archetype} target band.`);
  }
  if (tutorSpeedRaw < target.tutorSpeed.min) {
    notes.push(`Tutor-speed contribution is below the ${archetype} minimum target.`);
  }

  return {
    score,
    grade: gradeFromScore(score),
    subMetrics,
    evidence,
    notes,
  };
}
