# Phase 1.G — CRISPI Backend Speed MVP Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real backend `Speed` axis to `scoreDeck()` using a focused speed tagging helper and scorer, while deferring the higher-risk Speed heuristics to a later extension slice.

**Architecture:** Keep the public analyzer entrypoints unchanged: `tagCard()` remains the shared tag API and `scoreDeck()` remains the top-level scorer. Add a focused `tags/speed.ts` helper for fast mana / early ramp / low-drop signals, then implement `scoreSpeed()` in `scorer/speed.ts` for the MVP sub-metrics `mana.fast`, `mana.earlyRamp`, `curve.avgCMC`, and `curve.lowDrops`. This slice explicitly keeps `threat.density`, `wincon.turnEstimate`, and `tutor.speed` deferred.

**Tech Stack:** TypeScript ESM, Vitest, existing server analyzer structure, no new dependencies.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `server/src/analyzer/types.ts` | Modify | Extend `CardTags` with Speed MVP helper fields. |
| `server/src/analyzer/tags/speed.ts` | Create | Focused speed tag helper for fast mana, early ramp, and low-drop signals. |
| `server/src/analyzer/tags/speed.test.ts` | Create | Unit tests for the Speed helper heuristics. |
| `server/src/analyzer/tags/index.ts` | Modify | Compose the Speed helper into `tagCard()`. |
| `server/src/analyzer/tags/index.test.ts` | Modify | Verify shared `tagCard()` exposes Speed fields without regressing current axes. |
| `server/src/analyzer/scorer/speed.ts` | Create | Real `Speed` axis scorer for the MVP sub-metrics. |
| `server/src/analyzer/scorer/speed.test.ts` | Create | Unit tests for Speed scoring behavior, curve scoring, notes, and evidence. |
| `server/src/analyzer/scorer/index.ts` | Modify | Replace the Speed stub with `scoreSpeed()`. |
| `server/src/analyzer/scorer/index.test.ts` | Modify | Verify the top-level report now has all four real CRISPI axes. |

---

## Codebase notes (read before Task 1)

Verified from the current repo:

- `server/src/analyzer/tags/index.ts` already composes Consistency, Resilience, and Interaction helper fields through `tagCard()`.
- `server/src/analyzer/types.ts` currently has no Speed-facing helper fields.
- `server/src/analyzer/scorer/index.ts` already wires real `Consistency`, `Resilience`, and `Interaction`, and still stubs `Speed`.
- The analyzer already uses target-based scoring, weighted sub-metrics, evidence arrays, and notes in the existing axis scorers. Match that style.
- The repo instructions require Dele to make commits. Do **not** run `git add` or `git commit`. At each checkpoint, stop and hand off the suggested commit message.
- This repo has a known Vitest quirk where stale `dist/**/*.test.js` files may be picked up. When focused tests become noisy, prefer `npm test -- src/...` source test paths for red/green verification.

---

## Scoring scope for this slice

### Real in this slice
- `mana.fast`
- `mana.earlyRamp`
- `curve.avgCMC`
- `curve.lowDrops`

### Explicitly deferred in this slice
- `threat.density`
- `wincon.turnEstimate`
- `tutor.speed`
- client/UI work
- route changes
- Monte Carlo or simulation
- commander-cost cheating models

### Speed MVP targets

Use these targets inside `server/src/analyzer/scorer/speed.ts`:

```ts
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
```

Use Speed MVP weights:

```ts
const WEIGHTS = {
  fastMana: 0.30,
  earlyRamp: 0.25,
  avgCmc: 0.25,
  lowDrops: 0.20,
} as const;
```

Use this explicit fast-mana allowlist/tier table inside `server/src/analyzer/tags/speed.ts`:

```ts
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
```

---

## Task 1 — Add the Speed helper and extend `CardTags`

**Files:**
- Modify: `server/src/analyzer/types.ts`
- Create: `server/src/analyzer/tags/speed.ts`
- Create: `server/src/analyzer/tags/speed.test.ts`

- [ ] **Step 1: Write the failing Speed helper tests**

Create `server/src/analyzer/tags/speed.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { detectSpeedTags } from "./speed.js";
import type { Card } from "../../types.js";

function makeCard(name: string, overrides: Partial<Card> = {}): Card {
  return {
    id: name,
    uniqueCardId: `${name}-oracle`,
    scryfall_id: `${name.toLowerCase()}-sf`,
    set: "set",
    set_name: "Set",
    name,
    cn: "1",
    layout: "normal",
    cmc: 2,
    type: "Artifact",
    type_line: "Artifact",
    oracle_text: "",
    mana_cost: "{2}",
    colors: [],
    color_identity: [],
    rarity: "common",
    prices: {},
    ...overrides,
  };
}

describe("detectSpeedTags", () => {
  it("detects explicit fast mana from the allowlist", () => {
    const tags = detectSpeedTags(makeCard("Sol Ring", {
      cmc: 1,
      oracle_text: "{T}: Add {C}{C}.",
    }));
    expect(tags.fastManaTierScore).toBe(40);
    expect(tags.earlyRampScore).toBeGreaterThan(0);
    expect(tags.reasons).toContain("speed: fast mana");
  });

  it("detects early ramp at mana value two or less", () => {
    const tags = detectSpeedTags(makeCard("Arcane Signet", {
      cmc: 2,
      oracle_text: "{T}: Add one mana of any color in your commander's color identity.",
    }));
    expect(tags.earlyRampScore).toBeGreaterThan(0);
    expect(tags.reasons).toContain("speed: early ramp");
  });

  it("detects low-drop non-ramp cards", () => {
    const tags = detectSpeedTags(makeCard("Esper Sentinel", {
      type: "Creature",
      type_line: "Artifact Creature — Human Soldier",
      cmc: 1,
      oracle_text: "Whenever an opponent casts their first noncreature spell each turn, draw a card unless that player pays {X}, where X is Esper Sentinel's power.",
    }));
    expect(tags.lowDropSpeedScore).toBeGreaterThan(0);
    expect(tags.reasons).toContain("speed: low drop");
  });

  it("does not double-count pure ramp rocks as low-drop speed cards", () => {
    const tags = detectSpeedTags(makeCard("Arcane Signet", {
      cmc: 2,
      oracle_text: "{T}: Add one mana of any color in your commander's color identity.",
    }));
    expect(tags.lowDropSpeedScore).toBe(0);
  });

  it("does not mark unrelated utility cards as fast mana", () => {
    const tags = detectSpeedTags(makeCard("Lightning Greaves", {
      cmc: 2,
      type: "Artifact",
      type_line: "Artifact — Equipment",
      oracle_text: "Equipped creature has haste and shroud.",
    }));
    expect(tags.fastManaTierScore).toBe(0);
  });
});
```

- [ ] **Step 2: Run the helper test to verify it fails**

Run:

```bash
cd server && npm test -- src/analyzer/tags/speed.test.ts
```

Expected: FAIL because `server/src/analyzer/tags/speed.ts` does not exist yet.

- [ ] **Step 3: Extend `CardTags` with Speed MVP fields**

Modify `server/src/analyzer/types.ts` by replacing the current `CardTags` block with:

```ts
export interface CardTags {
  isLand: boolean;
  rampScore: number;
  drawScore: number;
  tutorScore: number;
  recursionScore: number;
  protectionPermanentScore: number;
  protectionSpellScore: number;
  boardwipeSurvivalScore: number;
  graveyardRelianceScore: number;
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
  fastManaTierScore: number;
  earlyRampScore: number;
  lowDropSpeedScore: number;
  reasons: string[];
}
```

- [ ] **Step 4: Create the Speed helper implementation**

Create `server/src/analyzer/tags/speed.ts`:

```ts
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
```

- [ ] **Step 5: Run the helper test and build**

Run:

```bash
cd server && npm test -- src/analyzer/tags/speed.test.ts && npm run build
```

Expected: helper test passes; build may still fail until `tagCard()` is updated in Task 2.

- [ ] **Step 6: Pause for Dele to commit**

Stop and present:
- Files changed:
  - `server/src/analyzer/types.ts`
  - `server/src/analyzer/tags/speed.ts`
  - `server/src/analyzer/tags/speed.test.ts`
- Suggested message: `feat(analyzer-tags): add speed helper and CardTags fields`

Wait for Dele before starting Task 2.

---

## Task 2 — Compose Speed fields through `tagCard()`

**Files:**
- Modify: `server/src/analyzer/tags/index.ts`
- Modify: `server/src/analyzer/tags/index.test.ts`

- [ ] **Step 1: Add failing shared tag tests for the Speed fields**

Append to `server/src/analyzer/tags/index.test.ts`:

```ts
  it("exposes speed helper signals through tagCard", () => {
    const fastMana = tagCard(makeCard("Sol Ring", {
      type: "Artifact",
      type_line: "Artifact",
      cmc: 1,
      oracle_text: "{T}: Add {C}{C}.",
    }));
    const lowDrop = tagCard(makeCard("Esper Sentinel", {
      type: "Creature",
      type_line: "Artifact Creature — Human Soldier",
      cmc: 1,
      oracle_text: "Whenever an opponent casts their first noncreature spell each turn, draw a card unless that player pays {X}, where X is Esper Sentinel's power.",
    }));
    expect(fastMana.fastManaTierScore).toBe(40);
    expect(fastMana.earlyRampScore).toBeGreaterThan(0);
    expect(lowDrop.lowDropSpeedScore).toBeGreaterThan(0);
    expect(lowDrop.reasons).toContain("speed: low drop");
  });
```

- [ ] **Step 2: Run the shared tag test to verify it fails**

Run:

```bash
cd server && npm test -- src/analyzer/tags/index.test.ts
```

Expected: FAIL because `tagCard()` does not yet expose the new Speed fields.

- [ ] **Step 3: Compose the Speed helper in `tagCard()`**

Edit `server/src/analyzer/tags/index.ts`.

Add import:

```ts
import { detectSpeedTags } from "./speed.js";
```

Add this line near the existing helper calls:

```ts
  const speed = detectSpeedTags(card);
```

Then replace the `return` block with:

```ts
  return {
    isLand,
    rampScore,
    drawScore,
    tutorScore,
    recursionScore: resilience.recursionScore,
    protectionPermanentScore: resilience.protectionPermanentScore,
    protectionSpellScore: resilience.protectionSpellScore,
    boardwipeSurvivalScore: resilience.boardwipeSurvivalScore,
    graveyardRelianceScore: resilience.graveyardRelianceScore,
    removalSpotScore: interaction.removalSpotScore,
    removalBoardwipeScore: interaction.removalBoardwipeScore,
    counterspellScore: interaction.counterspellScore,
    interactionCoverage: interaction.interactionCoverage,
    interactionInstantSpeed: interaction.interactionInstantSpeed,
    interactionFreeScore: interaction.interactionFreeScore,
    interactionStaxScore: interaction.interactionStaxScore,
    fastManaTierScore: speed.fastManaTierScore,
    earlyRampScore: speed.earlyRampScore,
    lowDropSpeedScore: speed.lowDropSpeedScore,
    reasons: [...reasons, ...resilience.reasons, ...interaction.reasons, ...speed.reasons],
  };
}
```

- [ ] **Step 4: Run the focused tag tests and build**

Run:

```bash
cd server && npm test -- src/analyzer/tags/index.test.ts && npm test -- src/analyzer/tags/speed.test.ts && npm run build
```

Expected: PASS.

- [ ] **Step 5: Pause for Dele to commit**

Stop and present:
- Files changed:
  - `server/src/analyzer/tags/index.ts`
  - `server/src/analyzer/tags/index.test.ts`
- Suggested message: `feat(analyzer-tags): compose speed signals into tagCard`

Wait for Dele before starting Task 3.

---

## Task 3 — Implement `scoreSpeed()`

**Files:**
- Create: `server/src/analyzer/scorer/speed.ts`
- Create: `server/src/analyzer/scorer/speed.test.ts`

- [ ] **Step 1: Write the failing Speed scorer tests**

Create `server/src/analyzer/scorer/speed.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { scoreSpeed } from "./speed.js";
import type { Card, ResolvedDeck } from "../../types.js";

function makeCard(name: string, overrides: Partial<Card> = {}): Card {
  return {
    id: name,
    uniqueCardId: `${name}-oracle`,
    scryfall_id: `${name.toLowerCase()}-sf`,
    set: "set",
    set_name: "Set",
    name,
    cn: "1",
    layout: "normal",
    cmc: 2,
    type: "Artifact",
    type_line: "Artifact",
    oracle_text: "",
    mana_cost: "{2}",
    colors: [],
    color_identity: [],
    rarity: "common",
    prices: {},
    ...overrides,
  };
}

function land(name: string): Card {
  return makeCard(name, { cmc: 0, type: "Land", type_line: "Basic Land — Plains" });
}

function weakDeck(): ResolvedDeck {
  return {
    commander: [makeCard("Commander", { type: "Creature", type_line: "Legendary Creature", cmc: 5 })],
    mainboard: [
      { card: land("Plains"), qty: 36 },
      { card: makeCard("Big Creature", { type: "Creature", type_line: "Creature", cmc: 7 }), qty: 8 },
    ],
    unresolved: [],
    ownedMap: new Map(),
  };
}

function strongDeck(): ResolvedDeck {
  return {
    commander: [makeCard("Commander", { type: "Creature", type_line: "Legendary Creature", cmc: 3 })],
    mainboard: [
      { card: land("Plains"), qty: 36 },
      { card: makeCard("Sol Ring", { cmc: 1, oracle_text: "{T}: Add {C}{C}." }), qty: 1 },
      { card: makeCard("Arcane Signet", { cmc: 2, oracle_text: "{T}: Add one mana of any color in your commander's color identity." }), qty: 1 },
      { card: makeCard("Esper Sentinel", {
        type: "Creature",
        type_line: "Artifact Creature — Human Soldier",
        cmc: 1,
        oracle_text: "Whenever an opponent casts their first noncreature spell each turn, draw a card unless that player pays {X}, where X is Esper Sentinel's power.",
      }), qty: 1 },
      { card: makeCard("Mother of Runes", {
        type: "Creature",
        type_line: "Creature — Human Cleric",
        cmc: 1,
        oracle_text: "{T}: Target creature you control gains protection from the color of your choice until end of turn.",
      }), qty: 1 },
    ],
    unresolved: [],
    ownedMap: new Map(),
  };
}

describe("scoreSpeed", () => {
  it("returns the expected Speed sub-metric keys", () => {
    const report = scoreSpeed(strongDeck(), "aggro/voltron");
    expect(report.subMetrics.map((m) => m.key)).toEqual([
      "mana.fast",
      "mana.earlyRamp",
      "curve.avgCMC",
      "curve.lowDrops",
    ]);
  });

  it("scores a faster deck higher than a weak one", () => {
    const weak = scoreSpeed(weakDeck(), "aggro/voltron");
    const strong = scoreSpeed(strongDeck(), "aggro/voltron");
    expect(strong.score).toBeGreaterThan(weak.score);
  });

  it("records evidence from representative speed cards", () => {
    const report = scoreSpeed(strongDeck(), "aggro/voltron");
    expect(report.evidence.some((e) => e.card === "Sol Ring" && e.subMetric === "mana.fast")).toBe(true);
    expect(report.evidence.some((e) => e.card === "Arcane Signet" && e.subMetric === "mana.earlyRamp")).toBe(true);
    expect(report.evidence.some((e) => e.card === "Esper Sentinel" && e.subMetric === "curve.lowDrops")).toBe(true);
  });

  it("scores average cmc relative to the archetype band", () => {
    const aggro = scoreSpeed(strongDeck(), "aggro/voltron");
    const control = scoreSpeed(strongDeck(), "control");
    const aggroCurve = aggro.subMetrics.find((m) => m.key === "curve.avgCMC");
    const controlCurve = control.subMetrics.find((m) => m.key === "curve.avgCMC");
    expect(aggroCurve?.score).not.toBe(controlCurve?.score);
  });

  it("includes the MVP deferred note", () => {
    const report = scoreSpeed(weakDeck(), "control");
    expect(report.notes).toContain(
      "Threat density, win-turn estimate, and tutor-speed remain deferred in this Speed MVP slice.",
    );
  });

  it("uses the shared analyzer grade mapping", () => {
    const report = scoreSpeed(strongDeck(), "aggro/voltron");
    expect(["F", "D", "C", "B", "A", "S"]).toContain(report.grade);
  });
});
```

- [ ] **Step 2: Run the scorer test to verify it fails**

Run:

```bash
cd server && npm test -- src/analyzer/scorer/speed.test.ts
```

Expected: FAIL because `server/src/analyzer/scorer/speed.ts` does not exist yet.

- [ ] **Step 3: Implement the Speed scorer**

Create `server/src/analyzer/scorer/speed.ts`:

```ts
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
  const tolerance = Math.max(midpoint - target.min, target.max - midpoint, 0.2);
  const distance = Math.abs(raw - midpoint);
  return Math.round(clamp(100 - (distance / tolerance) * 40, 0, 100));
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
```

- [ ] **Step 4: Run the focused Speed scorer test and build**

Run:

```bash
cd server && npm test -- src/analyzer/scorer/speed.test.ts && npm run build
```

Expected: PASS.

- [ ] **Step 5: Pause for Dele to commit**

Stop and present:
- Files changed:
  - `server/src/analyzer/scorer/speed.ts`
  - `server/src/analyzer/scorer/speed.test.ts`
- Suggested message: `feat(crispi): implement speed scoring axis mvp`

Wait for Dele before starting Task 4.

---

## Task 4 — Wire `scoreSpeed()` into `scoreDeck()`

**Files:**
- Modify: `server/src/analyzer/scorer/index.ts`
- Modify: `server/src/analyzer/scorer/index.test.ts`

- [ ] **Step 1: Strengthen the top-level scorer test first**

Replace the first test’s Speed assertion in `server/src/analyzer/scorer/index.test.ts` with:

```ts
    expect(report.axes.speed.grade).toBeDefined();
```

Replace the second test with:

```ts
  it("keeps the full-report contract while all four CRISPI axes are implemented", () => {
    const report = scoreDeck(makeDeck(), { archetypeOverride: "control" });

    expect(report.axes.consistency.subMetrics.length).toBeGreaterThan(0);
    expect(report.axes.resilience.subMetrics.length).toBeGreaterThan(0);
    expect(report.axes.interaction.subMetrics.length).toBeGreaterThan(0);
    expect(report.axes.speed.subMetrics.map((m) => m.key)).toEqual([
      "mana.fast",
      "mana.earlyRamp",
      "curve.avgCMC",
      "curve.lowDrops",
    ]);
    expect(report.overall).toBe(
      Math.round((
        report.axes.consistency.score +
        report.axes.resilience.score +
        report.axes.interaction.score +
        report.axes.speed.score
      ) / 4),
    );
  });
```

- [ ] **Step 2: Run the scorer-index test to verify it fails**

Run:

```bash
cd server && npm test -- src/analyzer/scorer/index.test.ts
```

Expected: FAIL because `scoreDeck()` still returns a stubbed Speed axis.

- [ ] **Step 3: Wire real Speed scoring into `scoreDeck()`**

Edit `server/src/analyzer/scorer/index.ts`.

Add import:

```ts
import { scoreSpeed } from "./speed.js";
```

Replace the axis construction section with:

```ts
  const consistency = scoreConsistency(deck, detected.archetype);
  const resilience = scoreResilience(deck, detected.archetype);
  const interaction = scoreInteraction(deck, detected.archetype);
  const speed = scoreSpeed(deck, detected.archetype);
```

The relevant function body becomes:

```ts
export function scoreDeck(
  deck: ResolvedDeck,
  opts: { archetypeOverride?: Archetype } = {},
): CrispiReport {
  const detected = opts.archetypeOverride
    ? { archetype: opts.archetypeOverride }
    : detectArchetype(deck);

  const consistency = scoreConsistency(deck, detected.archetype);
  const resilience = scoreResilience(deck, detected.archetype);
  const interaction = scoreInteraction(deck, detected.archetype);
  const speed = scoreSpeed(deck, detected.archetype);

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
```

- [ ] **Step 4: Run the focused scorer tests and build**

Run:

```bash
cd server && npm test -- src/analyzer/scorer/index.test.ts && npm test -- src/analyzer/scorer/speed.test.ts && npm run build
```

Expected: PASS.

- [ ] **Step 5: Pause for Dele to commit**

Stop and present:
- Files changed:
  - `server/src/analyzer/scorer/index.ts`
  - `server/src/analyzer/scorer/index.test.ts`
- Suggested message: `feat(crispi): wire speed axis into scoreDeck`

Wait for Dele before starting Task 5.

---

## Task 5 — Final verification sweep for the backend Speed MVP slice

**Files:**
- Verify only; no new files required unless fixes are needed.

- [ ] **Step 1: Run the full server test suite**

Run:

```bash
cd server && npm test
```

Expected: all server tests pass.

- [ ] **Step 2: Run the server build**

Run:

```bash
cd server && npm run build
```

Expected: zero TypeScript errors.

- [ ] **Step 3: Optional manual contract probe**

If you want a manual sanity check, start the built server and POST a resolved-deck JSON body to `/api/deck/score` containing cards such as `Sol Ring`, `Arcane Signet`, and one or two cheap low-drop spells/creatures.

Expected: HTTP 200 with:
- a non-empty `axes.speed.subMetrics`
- Speed sub-metric keys:
  - `mana.fast`
  - `mana.earlyRamp`
  - `curve.avgCMC`
  - `curve.lowDrops`
- `overall === round((consistency + resilience + interaction + speed) / 4)`
- the note `Threat density, win-turn estimate, and tutor-speed remain deferred in this Speed MVP slice.`

- [ ] **Step 4: Pause for Dele to commit**

Stop and present:
- Files changed: all analyzer files touched in Tasks 1–4
- Suggested message: `feat(crispi): add backend speed scoring mvp slice`

Wait for Dele.

---

## Self-review checklist

- [ ] `tagCard()` remains the shared analyzer tag entrypoint
- [ ] `mana.fast` uses the agreed explicit fast-mana allowlist/tier table
- [ ] `mana.earlyRamp` intentionally overlaps with Consistency ramp counting
- [ ] `curve.avgCMC` stays scorer-driven from deck contents
- [ ] `curve.lowDrops` stays conservative and avoids obvious pure-ramp double counting
- [ ] `scoreDeck()` now has real `Consistency` + `Resilience` + `Interaction` + `Speed`
- [ ] `overall` remains the mean of all four axes
- [ ] No route contract changes
- [ ] No new dependencies and no client changes
- [ ] Deferred note for future Speed extension work remains explicit

---

## Execution handoff

Recommended execution mode for this plan: **Inline Execution** via `superpowers:executing-plans`, because the Speed MVP helper and scorer build directly on the current analyzer files and follow the same checkpoint pattern as the recent CRISPI slices.
