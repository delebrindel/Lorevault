import type { ResolvedDeck } from "../../types.js";
import { tagCard } from "../tags/index.js";
import type { Archetype, AxisReport, CardEvidence, SubMetric } from "../types.js";
import { gradeFromScore } from "./index.js";

const TARGETS: Record<Archetype, {
  lands: { min: number; ideal: number; max: number };
  ramp: { min: number; ideal: number; max: number };
  draw: { min: number; ideal: number; max: number };
  tutors: { min: number; ideal: number; max: number };
  avgCmc: number;
}> = {
  "aggro/voltron": { lands: { min: 34, ideal: 36, max: 38 }, ramp: { min: 8, ideal: 10, max: 12 }, draw: { min: 8, ideal: 10, max: 13 }, tutors: { min: 0, ideal: 2, max: 5 }, avgCmc: 2.6 },
  "midrange/goodstuff": { lands: { min: 36, ideal: 38, max: 40 }, ramp: { min: 10, ideal: 12, max: 14 }, draw: { min: 10, ideal: 12, max: 15 }, tutors: { min: 2, ideal: 4, max: 7 }, avgCmc: 3.2 },
  control: { lands: { min: 36, ideal: 38, max: 41 }, ramp: { min: 8, ideal: 10, max: 12 }, draw: { min: 12, ideal: 15, max: 18 }, tutors: { min: 3, ideal: 5, max: 8 }, avgCmc: 3.0 },
  combo: { lands: { min: 32, ideal: 34, max: 37 }, ramp: { min: 10, ideal: 13, max: 16 }, draw: { min: 12, ideal: 15, max: 18 }, tutors: { min: 6, ideal: 9, max: 12 }, avgCmc: 2.8 },
  "aristocrats/sacrifice": { lands: { min: 35, ideal: 37, max: 39 }, ramp: { min: 10, ideal: 12, max: 14 }, draw: { min: 10, ideal: 12, max: 15 }, tutors: { min: 2, ideal: 4, max: 7 }, avgCmc: 2.9 },
  spellslinger: { lands: { min: 36, ideal: 38, max: 40 }, ramp: { min: 10, ideal: 12, max: 14 }, draw: { min: 12, ideal: 15, max: 18 }, tutors: { min: 3, ideal: 5, max: 8 }, avgCmc: 2.7 },
  "tokens/go-wide": { lands: { min: 36, ideal: 38, max: 40 }, ramp: { min: 10, ideal: 12, max: 14 }, draw: { min: 9, ideal: 11, max: 14 }, tutors: { min: 1, ideal: 3, max: 6 }, avgCmc: 3.0 },
  "reanimator/graveyard": { lands: { min: 35, ideal: 37, max: 39 }, ramp: { min: 9, ideal: 11, max: 13 }, draw: { min: 10, ideal: 13, max: 16 }, tutors: { min: 4, ideal: 6, max: 9 }, avgCmc: 3.0 },
  "lands/landfall": { lands: { min: 40, ideal: 43, max: 46 }, ramp: { min: 12, ideal: 15, max: 18 }, draw: { min: 9, ideal: 11, max: 14 }, tutors: { min: 1, ideal: 3, max: 6 }, avgCmc: 2.8 },
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

function avgCmcScore(rawAvgCmc: number, idealAvgCmc: number): number {
  const diff = Math.abs(rawAvgCmc - idealAvgCmc);
  return Math.round(clamp(100 - diff * 35, 0, 100));
}

export function scoreConsistency(deck: ResolvedDeck, archetype: Archetype): AxisReport {
  const target = TARGETS[archetype];
  const evidence: CardEvidence[] = [];

  let landCount = 0;
  let rampRaw = 0;
  let drawRaw = 0;
  let tutorRaw = 0;
  let nonlandQty = 0;
  let nonlandCmcTotal = 0;

  const rampCards = new Set<string>();
  const drawCards = new Set<string>();
  const tutorCards = new Set<string>();
  const landCards = new Set<string>();

  for (const entry of deck.mainboard) {
    const tags = tagCard(entry.card);
    if (tags.isLand) {
      landCount += entry.qty;
      landCards.add(entry.card.name);
    } else {
      nonlandQty += entry.qty;
      nonlandCmcTotal += entry.card.cmc * entry.qty;
    }

    if (tags.rampScore > 0) {
      rampRaw += tags.rampScore * entry.qty;
      rampCards.add(entry.card.name);
      evidence.push({
        card: entry.card.name,
        axis: "C",
        subMetric: "ramp.count",
        contribution: tags.rampScore * entry.qty,
        reason: tags.reasons.find((r) => r.startsWith("ramp:")) ?? "ramp contribution",
      });
    }

    if (tags.drawScore > 0) {
      drawRaw += tags.drawScore * entry.qty;
      drawCards.add(entry.card.name);
      evidence.push({
        card: entry.card.name,
        axis: "C",
        subMetric: "draw.density",
        contribution: tags.drawScore * entry.qty,
        reason: tags.reasons.find((r) => r.startsWith("draw:")) ?? "draw contribution",
      });
    }

    if (tags.tutorScore > 0) {
      tutorRaw += tags.tutorScore * entry.qty;
      tutorCards.add(entry.card.name);
      evidence.push({
        card: entry.card.name,
        axis: "C",
        subMetric: "tutor.count",
        contribution: tags.tutorScore * entry.qty,
        reason: tags.reasons.find((r) => r.startsWith("tutor:")) ?? "tutor contribution",
      });
    }
  }

  const avgCmc = nonlandQty > 0 ? nonlandCmcTotal / nonlandQty : 0;

  const subMetrics: SubMetric[] = [
    {
      key: "ramp.count",
      label: "Ramp pieces",
      raw: Number(rampRaw.toFixed(2)),
      target: target.ramp,
      score: scoreAgainstTarget(rampRaw, target.ramp),
      weight: 0.2,
      contributingCards: [...rampCards],
    },
    {
      key: "draw.density",
      label: "Card-draw density",
      raw: Number(drawRaw.toFixed(2)),
      target: target.draw,
      score: scoreAgainstTarget(drawRaw, target.draw),
      weight: 0.25,
      contributingCards: [...drawCards],
    },
    {
      key: "tutor.count",
      label: "Tutors",
      raw: Number(tutorRaw.toFixed(2)),
      target: target.tutors,
      score: scoreAgainstTarget(tutorRaw, target.tutors),
      weight: 0.1,
      contributingCards: [...tutorCards],
    },
    {
      key: "manabase.size",
      label: "Land count",
      raw: landCount,
      target: target.lands,
      score: scoreAgainstTarget(landCount, target.lands),
      weight: 0.2,
      contributingCards: [...landCards],
    },
    {
      key: "curve.shape",
      label: "Mana curve health",
      raw: Number(avgCmc.toFixed(2)),
      target: { min: target.avgCmc - 0.4, ideal: target.avgCmc, max: target.avgCmc + 0.4 },
      score: avgCmcScore(avgCmc, target.avgCmc),
      weight: 0.1,
      contributingCards: [],
    },
  ];

  const weightedScore = subMetrics.reduce((sum, item) => sum + item.score * item.weight, 0);
  const totalWeight = subMetrics.reduce((sum, item) => sum + item.weight, 0);
  const score = Math.round(weightedScore / totalWeight);

  const notes: string[] = [];
  if (landCount < target.lands.min) {
    notes.push(`Land count is below the ${archetype} minimum target.`);
  }
  if (drawRaw < target.draw.min) {
    notes.push(`Card-draw density is below the ${archetype} minimum target.`);
  }
  if (rampRaw < target.ramp.min) {
    notes.push(`Ramp density is below the ${archetype} minimum target.`);
  }

  return {
    score,
    grade: gradeFromScore(score),
    subMetrics,
    evidence,
    notes,
  };
}
