import type { ResolvedDeck } from "../../types.js";
import { tagCard } from "../tags/index.js";
import type { Archetype, AxisReport, CardEvidence, SubMetric } from "../types.js";
import { gradeFromScore } from "./index.js";

const TARGETS: Record<Archetype, {
  spot: { min: number; ideal: number; max: number };
  wipes: { min: number; ideal: number; max: number };
  counters: { min: number; ideal: number; max: number };
  instantSpeed: { min: number; ideal: number; max: number };
  free: { min: number; ideal: number; max: number };
  stax: { min: number; ideal: number; max: number };
  coverage: { min: number; ideal: number; max: number };
}> = {
  "aggro/voltron": {
    spot: { min: 4, ideal: 6, max: 9 },
    wipes: { min: 0, ideal: 1, max: 3 },
    counters: { min: 0, ideal: 0, max: 2 },
    instantSpeed: { min: 20, ideal: 35, max: 50 },
    free: { min: 0, ideal: 1, max: 3 },
    stax: { min: 0, ideal: 0, max: 2 },
    coverage: { min: 3, ideal: 4, max: 5 },
  },
  "midrange/goodstuff": {
    spot: { min: 6, ideal: 9, max: 13 },
    wipes: { min: 1, ideal: 2, max: 4 },
    counters: { min: 0, ideal: 2, max: 5 },
    instantSpeed: { min: 30, ideal: 45, max: 60 },
    free: { min: 0, ideal: 2, max: 4 },
    stax: { min: 0, ideal: 1, max: 3 },
    coverage: { min: 4, ideal: 5, max: 5 },
  },
  control: {
    spot: { min: 4, ideal: 7, max: 10 },
    wipes: { min: 2, ideal: 4, max: 6 },
    counters: { min: 6, ideal: 10, max: 15 },
    instantSpeed: { min: 55, ideal: 70, max: 85 },
    free: { min: 2, ideal: 4, max: 7 },
    stax: { min: 1, ideal: 2, max: 4 },
    coverage: { min: 4, ideal: 5, max: 5 },
  },
  combo: {
    spot: { min: 3, ideal: 5, max: 8 },
    wipes: { min: 1, ideal: 2, max: 4 },
    counters: { min: 4, ideal: 8, max: 13 },
    instantSpeed: { min: 50, ideal: 65, max: 80 },
    free: { min: 2, ideal: 4, max: 7 },
    stax: { min: 0, ideal: 1, max: 3 },
    coverage: { min: 3, ideal: 4, max: 5 },
  },
  "aristocrats/sacrifice": {
    spot: { min: 4, ideal: 7, max: 10 },
    wipes: { min: 1, ideal: 3, max: 5 },
    counters: { min: 0, ideal: 2, max: 5 },
    instantSpeed: { min: 30, ideal: 45, max: 60 },
    free: { min: 0, ideal: 1, max: 3 },
    stax: { min: 0, ideal: 0, max: 2 },
    coverage: { min: 4, ideal: 5, max: 5 },
  },
  spellslinger: {
    spot: { min: 4, ideal: 7, max: 10 },
    wipes: { min: 1, ideal: 3, max: 5 },
    counters: { min: 4, ideal: 7, max: 12 },
    instantSpeed: { min: 50, ideal: 65, max: 80 },
    free: { min: 1, ideal: 3, max: 5 },
    stax: { min: 0, ideal: 1, max: 3 },
    coverage: { min: 3, ideal: 4, max: 5 },
  },
  "tokens/go-wide": {
    spot: { min: 4, ideal: 6, max: 9 },
    wipes: { min: 0, ideal: 1, max: 3 },
    counters: { min: 0, ideal: 1, max: 4 },
    instantSpeed: { min: 25, ideal: 40, max: 55 },
    free: { min: 0, ideal: 1, max: 3 },
    stax: { min: 0, ideal: 0, max: 2 },
    coverage: { min: 3, ideal: 4, max: 5 },
  },
  "reanimator/graveyard": {
    spot: { min: 3, ideal: 6, max: 9 },
    wipes: { min: 1, ideal: 2, max: 4 },
    counters: { min: 1, ideal: 4, max: 8 },
    instantSpeed: { min: 35, ideal: 50, max: 65 },
    free: { min: 1, ideal: 2, max: 5 },
    stax: { min: 0, ideal: 0, max: 2 },
    coverage: { min: 3, ideal: 4, max: 5 },
  },
  "lands/landfall": {
    spot: { min: 4, ideal: 7, max: 10 },
    wipes: { min: 1, ideal: 3, max: 5 },
    counters: { min: 1, ideal: 3, max: 6 },
    instantSpeed: { min: 30, ideal: 45, max: 60 },
    free: { min: 0, ideal: 1, max: 3 },
    stax: { min: 0, ideal: 1, max: 3 },
    coverage: { min: 4, ideal: 5, max: 5 },
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

function scoreCoverage(raw: number): number {
  if (raw >= 5) return 100;
  if (raw === 4) return 80;
  if (raw === 3) return 55;
  if (raw === 2) return 25;
  return 0;
}

export function scoreInteraction(deck: ResolvedDeck, archetype: Archetype): AxisReport {
  const target = TARGETS[archetype];
  const evidence: CardEvidence[] = [];

  let spotRaw = 0;
  let wipesRaw = 0;
  let countersRaw = 0;
  let freeRaw = 0;
  let staxRaw = 0;
  let instantSpeedNumerator = 0;
  let instantSpeedDenominator = 0;

  const coverage = {
    creature: false,
    artifact: false,
    enchantment: false,
    planeswalker: false,
    land: false,
  };

  const spotCards = new Set<string>();
  const wipeCards = new Set<string>();
  const counterCards = new Set<string>();
  const instantSpeedCards = new Set<string>();
  const freeCards = new Set<string>();
  const staxCards = new Set<string>();
  const coverageCards = new Set<string>();

  for (const entry of deck.mainboard) {
    const tags = tagCard(entry.card);
    const contributesInteraction =
      tags.removalSpotScore > 0 ||
      tags.removalBoardwipeScore > 0 ||
      tags.counterspellScore > 0 ||
      tags.interactionFreeScore > 0 ||
      tags.interactionStaxScore > 0;

    if (contributesInteraction) {
      instantSpeedDenominator += entry.qty;
    }

    if (tags.interactionInstantSpeed > 0 && contributesInteraction) {
      instantSpeedNumerator += tags.interactionInstantSpeed * entry.qty;
      instantSpeedCards.add(entry.card.name);
      evidence.push({
        card: entry.card.name,
        axis: "I",
        subMetric: "interaction.instantSpeed",
        contribution: tags.interactionInstantSpeed * entry.qty,
        reason: tags.reasons.find((r) => r === "interaction: instant-speed interaction") ?? "instant-speed interaction contribution",
      });
    }

    if (tags.removalSpotScore > 0) {
      spotRaw += tags.removalSpotScore * entry.qty;
      spotCards.add(entry.card.name);
      evidence.push({
        card: entry.card.name,
        axis: "I",
        subMetric: "removal.spot",
        contribution: tags.removalSpotScore * entry.qty,
        reason: tags.reasons.find((r) => r === "interaction: spot removal") ?? "spot removal contribution",
      });
    }

    if (tags.removalBoardwipeScore > 0) {
      wipesRaw += tags.removalBoardwipeScore * entry.qty;
      wipeCards.add(entry.card.name);
      evidence.push({
        card: entry.card.name,
        axis: "I",
        subMetric: "removal.boardwipe",
        contribution: tags.removalBoardwipeScore * entry.qty,
        reason: tags.reasons.find((r) => r === "interaction: board wipe") ?? "board wipe contribution",
      });
    }

    if (tags.counterspellScore > 0) {
      countersRaw += tags.counterspellScore * entry.qty;
      counterCards.add(entry.card.name);
      evidence.push({
        card: entry.card.name,
        axis: "I",
        subMetric: "counterspells.count",
        contribution: tags.counterspellScore * entry.qty,
        reason: tags.reasons.find((r) => r === "interaction: counterspell") ?? "counterspell contribution",
      });
    }

    if (tags.interactionFreeScore > 0) {
      freeRaw += tags.interactionFreeScore * entry.qty;
      freeCards.add(entry.card.name);
      evidence.push({
        card: entry.card.name,
        axis: "I",
        subMetric: "interaction.free",
        contribution: tags.interactionFreeScore * entry.qty,
        reason: tags.reasons.find((r) => r === "interaction: free interaction") ?? "free interaction contribution",
      });
    }

    if (tags.interactionStaxScore > 0) {
      staxRaw += tags.interactionStaxScore * entry.qty;
      staxCards.add(entry.card.name);
      evidence.push({
        card: entry.card.name,
        axis: "I",
        subMetric: "interaction.stax",
        contribution: tags.interactionStaxScore * entry.qty,
        reason: tags.reasons.find((r) => r === "interaction: stax piece") ?? "stax contribution",
      });
    }

    for (const type of Object.keys(tags.interactionCoverage) as Array<keyof typeof tags.interactionCoverage>) {
      if (tags.interactionCoverage[type]) {
        coverage[type] = true;
        coverageCards.add(entry.card.name);
        evidence.push({
          card: entry.card.name,
          axis: "I",
          subMetric: "interaction.coverage",
          contribution: 1,
          reason: `interaction: coverage against ${type}`,
        });
      }
    }
  }

  const coverageRaw = Object.values(coverage).filter(Boolean).length;
  const instantSpeedRaw = instantSpeedDenominator === 0
    ? 0
    : Math.round((instantSpeedNumerator / instantSpeedDenominator) * 100);

  const subMetrics: SubMetric[] = [
    {
      key: "removal.spot",
      label: "Spot removal",
      raw: Number(spotRaw.toFixed(2)),
      target: target.spot,
      score: scoreAgainstTarget(spotRaw, target.spot),
      weight: 0.25,
      contributingCards: [...spotCards],
    },
    {
      key: "removal.boardwipe",
      label: "Board wipes",
      raw: Number(wipesRaw.toFixed(2)),
      target: target.wipes,
      score: scoreAgainstTarget(wipesRaw, target.wipes),
      weight: 0.15,
      contributingCards: [...wipeCards],
    },
    {
      key: "counterspells.count",
      label: "Counterspells",
      raw: Number(countersRaw.toFixed(2)),
      target: target.counters,
      score: scoreAgainstTarget(countersRaw, target.counters),
      weight: 0.15,
      contributingCards: [...counterCards],
    },
    {
      key: "interaction.instantSpeed",
      label: "Instant-speed interaction",
      raw: instantSpeedRaw,
      target: target.instantSpeed,
      score: scoreAgainstTarget(instantSpeedRaw, target.instantSpeed),
      weight: 0.15,
      contributingCards: [...instantSpeedCards],
    },
    {
      key: "interaction.free",
      label: "Free interaction",
      raw: Number(freeRaw.toFixed(2)),
      target: target.free,
      score: scoreAgainstTarget(freeRaw, target.free),
      weight: 0.10,
      contributingCards: [...freeCards],
    },
    {
      key: "interaction.stax",
      label: "Stax / denial",
      raw: Number(staxRaw.toFixed(2)),
      target: target.stax,
      score: scoreAgainstTarget(staxRaw, target.stax),
      weight: 0.05,
      contributingCards: [...staxCards],
    },
    {
      key: "interaction.coverage",
      label: "Threat-type coverage",
      raw: coverageRaw,
      target: target.coverage,
      score: scoreCoverage(coverageRaw),
      weight: 0.15,
      contributingCards: [...coverageCards],
    },
  ];

  const weightedScore = subMetrics.reduce((sum, item) => sum + item.score * item.weight, 0);
  const totalWeight = subMetrics.reduce((sum, item) => sum + item.weight, 0);
  const score = Math.round(weightedScore / totalWeight);

  const notes: string[] = [];
  if (spotRaw < target.spot.min) {
    notes.push(`Spot removal is below the ${archetype} minimum target.`);
  }
  if (wipesRaw < target.wipes.min) {
    notes.push(`Board wipe density is below the ${archetype} minimum target.`);
  }
  if (countersRaw < target.counters.min) {
    notes.push(`Counterspell density is below the ${archetype} minimum target.`);
  }
  if (instantSpeedRaw < target.instantSpeed.min) {
    notes.push(`Instant-speed interaction is below the ${archetype} minimum target.`);
  }
  if (freeRaw < target.free.min) {
    notes.push(`Free interaction density is below the ${archetype} minimum target.`);
  }
  if (staxRaw < target.stax.min) {
    notes.push(`Stax / denial density is below the ${archetype} minimum target.`);
  }
  if (coverageRaw < target.coverage.min) {
    notes.push("Threat-type coverage is below the archetype minimum target.");
  }

  return {
    score,
    grade: gradeFromScore(score),
    subMetrics,
    evidence,
    notes,
  };
}
