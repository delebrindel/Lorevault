# Phase 1.E — CRISPI Backend Interaction MVP Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real backend `Interaction` axis to `scoreDeck()` using a focused interaction tagging helper and scorer, while keeping `Speed` stubbed.

**Architecture:** Keep the public analyzer entrypoints unchanged: `tagCard()` remains the shared tag API and `scoreDeck()` remains the top-level scorer. Add a focused `tags/interaction.ts` helper that extends `CardTags` with interaction-facing numeric and coverage signals, then implement `scoreInteraction()` in `scorer/interaction.ts` and wire it into the existing CRISPI report assembly. This is intentionally an MVP subset of the full Interaction spec; the plan includes an explicit deferred note for the future full-spec slice.

**Tech Stack:** TypeScript ESM, Vitest, existing server analyzer structure, no new dependencies.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `server/src/analyzer/types.ts` | Modify | Extend `CardTags` with interaction-facing numeric fields and coverage booleans. |
| `server/src/analyzer/tags/interaction.ts` | Create | Focused interaction tag helper for spot removal, board wipes, counterspells, and threat-type coverage. |
| `server/src/analyzer/tags/interaction.test.ts` | Create | Unit tests for interaction helper heuristics. |
| `server/src/analyzer/tags/index.ts` | Modify | Compose the interaction helper into `tagCard()`. |
| `server/src/analyzer/tags/index.test.ts` | Modify | Verify shared `tagCard()` exposes interaction fields without regressing current consistency/resilience behavior. |
| `server/src/analyzer/scorer/interaction.ts` | Create | Real `Interaction` axis scorer for the MVP sub-metrics. |
| `server/src/analyzer/scorer/interaction.test.ts` | Create | Unit tests for interaction scoring behavior, coverage step scoring, notes, and evidence. |
| `server/src/analyzer/scorer/index.ts` | Modify | Replace the interaction stub with `scoreInteraction()`. |
| `server/src/analyzer/scorer/index.test.ts` | Modify | Verify the top-level report now has real consistency + resilience + interaction and updated overall formula. |

---

## Codebase notes (read before Task 1)

Verified from the current repo:

- `server/src/analyzer/tags/index.ts` currently returns consistency and resilience-facing fields only.
- `server/src/analyzer/types.ts` currently defines `CardTags` without interaction fields, so extending the tag layer must start there.
- `server/src/analyzer/scorer/index.ts` already wires `scoreConsistency()` and `scoreResilience()` and still stubs `interaction` and `speed`.
- `server/src/analyzer/scorer/resilience.ts` already contains the preferred scoring style to mirror: piecewise target scoring, weighted mean, explicit evidence arrays, and notes.
- The repo instructions require Dele to make commits. Do **not** run `git add` or `git commit`. At each checkpoint, stop and hand off the suggested commit message.
- The Interaction MVP must leave `Speed` stubbed and must explicitly preserve the current Resilience behavior where counterspells do **not** contribute to `protection.spells`.

---

## Scoring scope for this slice

### Real in this slice
- `removal.spot`
- `removal.boardwipe`
- `counterspells.count`
- `interaction.coverage`

### Explicitly deferred in this slice
- `interaction.instantSpeed`
- `interaction.free`
- `interaction.stax`
- politics / pillowfort interaction modeling
- targeted hand disruption
- counterspell double-counting back into Resilience
- any client work
- any route changes

### Archetype target table for this slice

Use this target table inside `server/src/analyzer/scorer/interaction.ts`:

```ts
const TARGETS: Record<Archetype, {
  spot: { min: number; ideal: number; max: number };
  wipes: { min: number; ideal: number; max: number };
  counters: { min: number; ideal: number; max: number };
  coverage: { min: number; ideal: number; max: number };
}> = {
  "aggro/voltron": {
    spot: { min: 4, ideal: 6, max: 9 },
    wipes: { min: 0, ideal: 1, max: 3 },
    counters: { min: 0, ideal: 0, max: 2 },
    coverage: { min: 3, ideal: 4, max: 5 },
  },
  "midrange/goodstuff": {
    spot: { min: 6, ideal: 9, max: 13 },
    wipes: { min: 1, ideal: 2, max: 4 },
    counters: { min: 0, ideal: 2, max: 5 },
    coverage: { min: 4, ideal: 5, max: 5 },
  },
  control: {
    spot: { min: 4, ideal: 7, max: 10 },
    wipes: { min: 2, ideal: 4, max: 6 },
    counters: { min: 6, ideal: 10, max: 15 },
    coverage: { min: 4, ideal: 5, max: 5 },
  },
  combo: {
    spot: { min: 3, ideal: 5, max: 8 },
    wipes: { min: 1, ideal: 2, max: 4 },
    counters: { min: 4, ideal: 8, max: 13 },
    coverage: { min: 3, ideal: 4, max: 5 },
  },
  "aristocrats/sacrifice": {
    spot: { min: 4, ideal: 7, max: 10 },
    wipes: { min: 1, ideal: 3, max: 5 },
    counters: { min: 0, ideal: 2, max: 5 },
    coverage: { min: 4, ideal: 5, max: 5 },
  },
  spellslinger: {
    spot: { min: 4, ideal: 7, max: 10 },
    wipes: { min: 1, ideal: 3, max: 5 },
    counters: { min: 4, ideal: 7, max: 12 },
    coverage: { min: 3, ideal: 4, max: 5 },
  },
  "tokens/go-wide": {
    spot: { min: 4, ideal: 6, max: 9 },
    wipes: { min: 0, ideal: 1, max: 3 },
    counters: { min: 0, ideal: 1, max: 4 },
    coverage: { min: 3, ideal: 4, max: 5 },
  },
  "reanimator/graveyard": {
    spot: { min: 3, ideal: 6, max: 9 },
    wipes: { min: 1, ideal: 2, max: 4 },
    counters: { min: 1, ideal: 4, max: 8 },
    coverage: { min: 3, ideal: 4, max: 5 },
  },
  "lands/landfall": {
    spot: { min: 4, ideal: 7, max: 10 },
    wipes: { min: 1, ideal: 3, max: 5 },
    counters: { min: 1, ideal: 3, max: 6 },
    coverage: { min: 4, ideal: 5, max: 5 },
  },
};
```

Use Interaction MVP weights:

```ts
const WEIGHTS = {
  spot: 0.35,
  wipes: 0.20,
  counters: 0.20,
  coverage: 0.25,
} as const;
```

Use coverage step scoring:

```ts
function scoreCoverage(raw: number): number {
  if (raw >= 5) return 100;
  if (raw === 4) return 80;
  if (raw === 3) return 55;
  if (raw === 2) return 25;
  return 0;
}
```

---

## Task 1 — Add interaction tag helper + extend `CardTags`

**Files:**
- Modify: `server/src/analyzer/types.ts`
- Create: `server/src/analyzer/tags/interaction.ts`
- Create: `server/src/analyzer/tags/interaction.test.ts`

- [ ] **Step 1: Write the failing interaction-helper tests**

Create `server/src/analyzer/tags/interaction.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { detectInteractionTags } from "./interaction.js";
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
    type: "Instant",
    type_line: "Instant",
    oracle_text: "",
    mana_cost: "{2}",
    colors: [],
    color_identity: [],
    rarity: "common",
    prices: {},
    ...overrides,
  };
}

describe("detectInteractionTags", () => {
  it("detects narrow spot removal against creatures", () => {
    const tags = detectInteractionTags(makeCard("Swords to Plowshares", {
      oracle_text: "Exile target creature. Its controller gains life equal to its power.",
    }));
    expect(tags.removalSpotScore).toBeGreaterThan(0);
    expect(tags.interactionCoverage.creature).toBe(true);
    expect(tags.reasons).toContain("interaction: spot removal");
    expect(tags.reasons).toContain("interaction: coverage against creature");
  });

  it("detects flexible catch-all removal and broad coverage", () => {
    const tags = detectInteractionTags(makeCard("Beast Within", {
      oracle_text: "Destroy target permanent. Its controller creates a 3/3 green Beast creature token.",
    }));
    expect(tags.removalSpotScore).toBeGreaterThan(1);
    expect(tags.interactionCoverage.creature).toBe(true);
    expect(tags.interactionCoverage.artifact).toBe(true);
    expect(tags.interactionCoverage.enchantment).toBe(true);
    expect(tags.interactionCoverage.planeswalker).toBe(true);
    expect(tags.interactionCoverage.land).toBe(true);
  });

  it("detects broad board wipes", () => {
    const tags = detectInteractionTags(makeCard("Wrath of God", {
      type: "Sorcery",
      type_line: "Sorcery",
      oracle_text: "Destroy all creatures. They can't be regenerated.",
    }));
    expect(tags.removalBoardwipeScore).toBeGreaterThan(0);
    expect(tags.interactionCoverage.creature).toBe(true);
    expect(tags.reasons).toContain("interaction: board wipe");
  });

  it("detects counterspells with conservative weighting", () => {
    const hard = detectInteractionTags(makeCard("Counterspell", {
      oracle_text: "Counter target spell.",
    }));
    const narrow = detectInteractionTags(makeCard("Negate", {
      oracle_text: "Counter target noncreature spell.",
    }));
    expect(hard.counterspellScore).toBeGreaterThan(narrow.counterspellScore);
    expect(hard.reasons).toContain("interaction: counterspell");
  });

  it("does not falsely mark utility ramp as interaction", () => {
    const tags = detectInteractionTags(makeCard("Arcane Signet", {
      type: "Artifact",
      type_line: "Artifact",
      oracle_text: "{T}: Add one mana of any color in your commander's color identity.",
    }));
    expect(tags.removalSpotScore).toBe(0);
    expect(tags.removalBoardwipeScore).toBe(0);
    expect(tags.counterspellScore).toBe(0);
    expect(Object.values(tags.interactionCoverage).some(Boolean)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd server && npm test -- analyzer/tags/interaction
```

Expected: FAIL because `server/src/analyzer/tags/interaction.ts` does not exist yet.

- [ ] **Step 3: Extend `CardTags` for interaction fields**

Modify `server/src/analyzer/types.ts` by replacing the existing `CardTags` block with:

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
  reasons: string[];
}
```

- [ ] **Step 4: Create the interaction helper implementation**

Create `server/src/analyzer/tags/interaction.ts`:

```ts
import type { Card } from "../../types.js";

export interface InteractionTagSlice {
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
  reasons: string[];
}

const BLANK_COVERAGE = {
  creature: false,
  artifact: false,
  enchantment: false,
  planeswalker: false,
  land: false,
};

const COUNTER_HARD_RE = /^counter target spell\.?$/i;
const COUNTER_NARROW_RE = /counter target (noncreature|creature|artifact|enchantment|planeswalker|instant|sorcery) spell/i;
const COUNTER_SOFT_RE = /counter target spell unless/i;
const TARGET_PERMANENT_RE = /(destroy|exile) target permanent/i;
const TARGET_CREATURE_RE = /(destroy|exile) target creature/i;
const TARGET_ARTIFACT_OR_ENCHANTMENT_RE = /(destroy|exile) target artifact or enchantment/i;
const TARGET_PLANESWALKER_RE = /(destroy|exile) target planeswalker/i;
const TARGET_LAND_RE = /(destroy|exile) target land/i;
const ALL_CREATURES_RE = /(destroy|exile|return) all creatures/i;
const ALL_ARTIFACTS_RE = /(destroy|exile) all artifacts/i;
const ALL_ENCHANTMENTS_RE = /(destroy|exile) all enchantments/i;
const ALL_PERMANENTS_RE = /(destroy|exile) all permanents/i;

function makeCoverage() {
  return { ...BLANK_COVERAGE };
}

export function detectInteractionTags(card: Card): InteractionTagSlice {
  const oracle = card.oracle_text;
  const reasons: string[] = [];
  const interactionCoverage = makeCoverage();

  let removalSpotScore = 0;
  if (TARGET_PERMANENT_RE.test(oracle)) {
    removalSpotScore = 1.5;
    interactionCoverage.creature = true;
    interactionCoverage.artifact = true;
    interactionCoverage.enchantment = true;
    interactionCoverage.planeswalker = true;
    interactionCoverage.land = true;
    reasons.push("interaction: spot removal");
  } else if (TARGET_ARTIFACT_OR_ENCHANTMENT_RE.test(oracle)) {
    removalSpotScore = 1;
    interactionCoverage.artifact = true;
    interactionCoverage.enchantment = true;
    reasons.push("interaction: spot removal");
  } else if (TARGET_CREATURE_RE.test(oracle)) {
    removalSpotScore = 1;
    interactionCoverage.creature = true;
    reasons.push("interaction: spot removal");
  } else if (TARGET_PLANESWALKER_RE.test(oracle)) {
    removalSpotScore = 1;
    interactionCoverage.planeswalker = true;
    reasons.push("interaction: spot removal");
  } else if (TARGET_LAND_RE.test(oracle)) {
    removalSpotScore = 1;
    interactionCoverage.land = true;
    reasons.push("interaction: spot removal");
  }

  let removalBoardwipeScore = 0;
  if (ALL_PERMANENTS_RE.test(oracle)) {
    removalBoardwipeScore = 1.5;
    interactionCoverage.creature = true;
    interactionCoverage.artifact = true;
    interactionCoverage.enchantment = true;
    interactionCoverage.planeswalker = true;
    interactionCoverage.land = true;
    reasons.push("interaction: board wipe");
  } else {
    let sweepTypes = 0;
    if (ALL_CREATURES_RE.test(oracle)) {
      interactionCoverage.creature = true;
      sweepTypes += 1;
    }
    if (ALL_ARTIFACTS_RE.test(oracle)) {
      interactionCoverage.artifact = true;
      sweepTypes += 1;
    }
    if (ALL_ENCHANTMENTS_RE.test(oracle)) {
      interactionCoverage.enchantment = true;
      sweepTypes += 1;
    }
    if (sweepTypes > 0) {
      removalBoardwipeScore = sweepTypes >= 2 ? 1.5 : 1;
      reasons.push("interaction: board wipe");
    }
  }

  let counterspellScore = 0;
  if (COUNTER_HARD_RE.test(oracle.trim())) {
    counterspellScore = 1;
    reasons.push("interaction: counterspell");
  } else if (COUNTER_SOFT_RE.test(oracle)) {
    counterspellScore = 0.6;
    reasons.push("interaction: counterspell");
  } else if (COUNTER_NARROW_RE.test(oracle)) {
    counterspellScore = 0.4;
    reasons.push("interaction: counterspell");
  }

  for (const type of Object.keys(interactionCoverage) as Array<keyof typeof interactionCoverage>) {
    if (interactionCoverage[type]) {
      reasons.push(`interaction: coverage against ${type}`);
    }
  }

  return {
    removalSpotScore,
    removalBoardwipeScore,
    counterspellScore,
    interactionCoverage,
    reasons,
  };
}
```

- [ ] **Step 5: Run the helper tests and build**

Run:

```bash
cd server && npm test -- analyzer/tags/interaction && npm run build
```

Expected: PASS.

- [ ] **Step 6: Pause for Dele to commit**

Stop and present:
- Files changed:
  - `server/src/analyzer/types.ts`
  - `server/src/analyzer/tags/interaction.ts`
  - `server/src/analyzer/tags/interaction.test.ts`
- Suggested message: `feat(analyzer-tags): add interaction tag helper and CardTags fields`

Wait for Dele before starting Task 2.

---

## Task 2 — Wire interaction tags through `tagCard()`

**Files:**
- Modify: `server/src/analyzer/tags/index.ts`
- Modify: `server/src/analyzer/tags/index.test.ts`

- [ ] **Step 1: Add failing integration tests for `tagCard()`**

Append to `server/src/analyzer/tags/index.test.ts`:

```ts
  it("merges interaction helper signals into tagCard output", () => {
    const tags = tagCard(makeCard("Beast Within", {
      oracle_text: "Destroy target permanent. Its controller creates a 3/3 green Beast creature token.",
    }));
    expect(tags.removalSpotScore).toBeGreaterThan(1);
    expect(tags.interactionCoverage.creature).toBe(true);
    expect(tags.interactionCoverage.artifact).toBe(true);
    expect(tags.interactionCoverage.enchantment).toBe(true);
    expect(tags.interactionCoverage.planeswalker).toBe(true);
    expect(tags.interactionCoverage.land).toBe(true);
    expect(tags.reasons).toContain("interaction: spot removal");
  });

  it("exposes counterspell scoring through tagCard without changing resilience protection", () => {
    const tags = tagCard(makeCard("Counterspell", {
      type: "Instant",
      type_line: "Instant",
      oracle_text: "Counter target spell.",
    }));
    expect(tags.counterspellScore).toBeGreaterThan(0);
    expect(tags.protectionSpellScore).toBe(0);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
cd server && npm test -- analyzer/tags/index
```

Expected: FAIL because `tagCard()` does not yet expose the new interaction fields.

- [ ] **Step 3: Compose the interaction helper in `tagCard()`**

Edit `server/src/analyzer/tags/index.ts`.

Add import:

```ts
import { detectInteractionTags } from "./interaction.js";
```

Then replace the beginning and return portion of `tagCard()` with:

```ts
export function tagCard(card: Card): CardTags {
  const reasons: string[] = [];
  const oracle = card.oracle_text;
  const isLand = /\bLand\b/i.test(card.type_line);
  const resilience = detectResilienceTags(card);
  const interaction = detectInteractionTags(card);

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
    recursionScore: resilience.recursionScore,
    protectionPermanentScore: resilience.protectionPermanentScore,
    protectionSpellScore: resilience.protectionSpellScore,
    boardwipeSurvivalScore: resilience.boardwipeSurvivalScore,
    graveyardRelianceScore: resilience.graveyardRelianceScore,
    removalSpotScore: interaction.removalSpotScore,
    removalBoardwipeScore: interaction.removalBoardwipeScore,
    counterspellScore: interaction.counterspellScore,
    interactionCoverage: interaction.interactionCoverage,
    reasons: [...reasons, ...resilience.reasons, ...interaction.reasons],
  };
}
```

- [ ] **Step 4: Run the tag tests and build**

Run:

```bash
cd server && npm test -- analyzer/tags/index && npm test -- analyzer/tags/interaction && npm test -- analyzer/tags/resilience && npm run build
```

Expected: PASS.

- [ ] **Step 5: Pause for Dele to commit**

Stop and present:
- Files changed:
  - `server/src/analyzer/tags/index.ts`
  - `server/src/analyzer/tags/index.test.ts`
- Suggested message: `feat(analyzer-tags): compose interaction signals into tagCard`

Wait for Dele before starting Task 3.

---

## Task 3 — Implement `scoreInteraction()`

**Files:**
- Create: `server/src/analyzer/scorer/interaction.ts`
- Create: `server/src/analyzer/scorer/interaction.test.ts`

- [ ] **Step 1: Write the failing interaction-scorer tests**

Create `server/src/analyzer/scorer/interaction.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { scoreInteraction } from "./interaction.js";
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
    type: "Instant",
    type_line: "Instant",
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
    commander: [makeCard("Commander")],
    mainboard: [
      { card: land("Plains"), qty: 36 },
      { card: makeCard("Vanilla Creature", { type: "Creature", type_line: "Creature" }), qty: 10 },
    ],
    unresolved: [],
    ownedMap: new Map(),
  };
}

function strongDeck(): ResolvedDeck {
  return {
    commander: [makeCard("Commander")],
    mainboard: [
      { card: land("Plains"), qty: 36 },
      { card: makeCard("Swords to Plowshares", {
        oracle_text: "Exile target creature. Its controller gains life equal to its power.",
      }), qty: 1 },
      { card: makeCard("Beast Within", {
        oracle_text: "Destroy target permanent. Its controller creates a 3/3 green Beast creature token.",
      }), qty: 1 },
      { card: makeCard("Wrath of God", {
        type: "Sorcery",
        type_line: "Sorcery",
        oracle_text: "Destroy all creatures. They can't be regenerated.",
      }), qty: 1 },
      { card: makeCard("Counterspell", {
        oracle_text: "Counter target spell.",
      }), qty: 1 },
      { card: makeCard("Negate", {
        oracle_text: "Counter target noncreature spell.",
      }), qty: 1 },
    ],
    unresolved: [],
    ownedMap: new Map(),
  };
}

describe("scoreInteraction", () => {
  it("returns the expected sub-metric keys", () => {
    const report = scoreInteraction(strongDeck(), "control");
    expect(report.subMetrics.map((m) => m.key)).toEqual([
      "removal.spot",
      "removal.boardwipe",
      "counterspells.count",
      "interaction.coverage",
    ]);
  });

  it("scores a stronger interaction deck higher than a weak one", () => {
    const weak = scoreInteraction(weakDeck(), "control");
    const strong = scoreInteraction(strongDeck(), "control");
    expect(strong.score).toBeGreaterThan(weak.score);
  });

  it("records evidence from representative interaction cards", () => {
    const report = scoreInteraction(strongDeck(), "control");
    expect(report.evidence.some((e) => e.card === "Swords to Plowshares" && e.subMetric === "removal.spot")).toBe(true);
    expect(report.evidence.some((e) => e.card === "Wrath of God" && e.subMetric === "removal.boardwipe")).toBe(true);
    expect(report.evidence.some((e) => e.card === "Counterspell" && e.subMetric === "counterspells.count")).toBe(true);
    expect(report.evidence.some((e) => e.card === "Beast Within" && e.subMetric === "interaction.coverage")).toBe(true);
  });

  it("uses the declared coverage step scoring", () => {
    const report = scoreInteraction(strongDeck(), "control");
    const coverage = report.subMetrics.find((m) => m.key === "interaction.coverage");
    expect(coverage?.raw).toBeGreaterThanOrEqual(3);
    expect([0, 25, 55, 80, 100]).toContain(coverage?.score);
  });

  it("adds a note that full-spec interaction remains deferred", () => {
    const report = scoreInteraction(weakDeck(), "control");
    expect(report.notes).toContain(
      "Instant-speed interaction, free interaction, and stax remain deferred in this MVP slice.",
    );
  });

  it("uses the shared analyzer grade mapping", () => {
    const report = scoreInteraction(strongDeck(), "control");
    expect(["F", "D", "C", "B", "A", "S"]).toContain(report.grade);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
cd server && npm test -- scorer/interaction
```

Expected: FAIL because `server/src/analyzer/scorer/interaction.ts` does not exist yet.

- [ ] **Step 3: Implement the interaction scorer**

Create `server/src/analyzer/scorer/interaction.ts`:

```ts
import type { ResolvedDeck } from "../../types.js";
import { tagCard } from "../tags/index.js";
import type { Archetype, AxisReport, CardEvidence, SubMetric } from "../types.js";
import { gradeFromScore } from "./index.js";

const TARGETS: Record<Archetype, {
  spot: { min: number; ideal: number; max: number };
  wipes: { min: number; ideal: number; max: number };
  counters: { min: number; ideal: number; max: number };
  coverage: { min: number; ideal: number; max: number };
}> = {
  "aggro/voltron": {
    spot: { min: 4, ideal: 6, max: 9 },
    wipes: { min: 0, ideal: 1, max: 3 },
    counters: { min: 0, ideal: 0, max: 2 },
    coverage: { min: 3, ideal: 4, max: 5 },
  },
  "midrange/goodstuff": {
    spot: { min: 6, ideal: 9, max: 13 },
    wipes: { min: 1, ideal: 2, max: 4 },
    counters: { min: 0, ideal: 2, max: 5 },
    coverage: { min: 4, ideal: 5, max: 5 },
  },
  control: {
    spot: { min: 4, ideal: 7, max: 10 },
    wipes: { min: 2, ideal: 4, max: 6 },
    counters: { min: 6, ideal: 10, max: 15 },
    coverage: { min: 4, ideal: 5, max: 5 },
  },
  combo: {
    spot: { min: 3, ideal: 5, max: 8 },
    wipes: { min: 1, ideal: 2, max: 4 },
    counters: { min: 4, ideal: 8, max: 13 },
    coverage: { min: 3, ideal: 4, max: 5 },
  },
  "aristocrats/sacrifice": {
    spot: { min: 4, ideal: 7, max: 10 },
    wipes: { min: 1, ideal: 3, max: 5 },
    counters: { min: 0, ideal: 2, max: 5 },
    coverage: { min: 4, ideal: 5, max: 5 },
  },
  spellslinger: {
    spot: { min: 4, ideal: 7, max: 10 },
    wipes: { min: 1, ideal: 3, max: 5 },
    counters: { min: 4, ideal: 7, max: 12 },
    coverage: { min: 3, ideal: 4, max: 5 },
  },
  "tokens/go-wide": {
    spot: { min: 4, ideal: 6, max: 9 },
    wipes: { min: 0, ideal: 1, max: 3 },
    counters: { min: 0, ideal: 1, max: 4 },
    coverage: { min: 3, ideal: 4, max: 5 },
  },
  "reanimator/graveyard": {
    spot: { min: 3, ideal: 6, max: 9 },
    wipes: { min: 1, ideal: 2, max: 4 },
    counters: { min: 1, ideal: 4, max: 8 },
    coverage: { min: 3, ideal: 4, max: 5 },
  },
  "lands/landfall": {
    spot: { min: 4, ideal: 7, max: 10 },
    wipes: { min: 1, ideal: 3, max: 5 },
    counters: { min: 1, ideal: 3, max: 6 },
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
  const coverageCards = new Set<string>();

  for (const entry of deck.mainboard) {
    const tags = tagCard(entry.card);

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

  const subMetrics: SubMetric[] = [
    {
      key: "removal.spot",
      label: "Spot removal",
      raw: Number(spotRaw.toFixed(2)),
      target: target.spot,
      score: scoreAgainstTarget(spotRaw, target.spot),
      weight: 0.35,
      contributingCards: [...spotCards],
    },
    {
      key: "removal.boardwipe",
      label: "Board wipes",
      raw: Number(wipesRaw.toFixed(2)),
      target: target.wipes,
      score: scoreAgainstTarget(wipesRaw, target.wipes),
      weight: 0.20,
      contributingCards: [...wipeCards],
    },
    {
      key: "counterspells.count",
      label: "Counterspells",
      raw: Number(countersRaw.toFixed(2)),
      target: target.counters,
      score: scoreAgainstTarget(countersRaw, target.counters),
      weight: 0.20,
      contributingCards: [...counterCards],
    },
    {
      key: "interaction.coverage",
      label: "Threat-type coverage",
      raw: coverageRaw,
      target: target.coverage,
      score: scoreCoverage(coverageRaw),
      weight: 0.25,
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
  if (coverageRaw < target.coverage.min) {
    notes.push("Threat-type coverage is below the archetype minimum target.");
  }
  notes.push("Instant-speed interaction, free interaction, and stax remain deferred in this MVP slice.");

  return {
    score,
    grade: gradeFromScore(score),
    subMetrics,
    evidence,
    notes,
  };
}
```

- [ ] **Step 4: Run the interaction scorer tests and build**

Run:

```bash
cd server && npm test -- scorer/interaction && npm run build
```

Expected: PASS.

- [ ] **Step 5: Pause for Dele to commit**

Stop and present:
- Files changed:
  - `server/src/analyzer/scorer/interaction.ts`
  - `server/src/analyzer/scorer/interaction.test.ts`
- Suggested message: `feat(crispi): implement interaction scoring axis mvp`

Wait for Dele before starting Task 4.

---

## Task 4 — Wire `scoreInteraction()` into `scoreDeck()`

**Files:**
- Modify: `server/src/analyzer/scorer/index.ts`
- Modify: `server/src/analyzer/scorer/index.test.ts`

- [ ] **Step 1: Strengthen the top-level scorer test first**

Replace the second test in `server/src/analyzer/scorer/index.test.ts` with:

```ts
  it("keeps the full-report contract while consistency, resilience, and interaction are implemented", () => {
    const report = scoreDeck(makeDeck(), { archetypeOverride: "control" });

    expect(report.axes.consistency.subMetrics.length).toBeGreaterThan(0);
    expect(report.axes.resilience.subMetrics.length).toBeGreaterThan(0);
    expect(report.axes.interaction.subMetrics.length).toBeGreaterThan(0);
    expect(report.axes.speed.score).toBe(0);
    expect(report.overall).toBe(
      Math.round((
        report.axes.consistency.score +
        report.axes.resilience.score +
        report.axes.interaction.score
      ) / 4),
    );
  });
```

Also update the first test’s interaction assertion to:

```ts
    expect(report.axes.interaction.grade).toBeDefined();
```

instead of checking the stub note.

- [ ] **Step 2: Run the scorer-index test to verify it fails**

Run:

```bash
cd server && npm test -- scorer/index
```

Expected: FAIL because `scoreDeck()` still returns a stubbed interaction axis.

- [ ] **Step 3: Wire real interaction scoring into `scoreDeck()`**

Edit `server/src/analyzer/scorer/index.ts`.

Add import:

```ts
import { scoreInteraction } from "./interaction.js";
```

Replace the axis construction section with:

```ts
  const consistency = scoreConsistency(deck, detected.archetype);
  const resilience = scoreResilience(deck, detected.archetype);
  const interaction = scoreInteraction(deck, detected.archetype);
  const speed = makeStubAxis();
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
```

- [ ] **Step 4: Run the focused scorer tests and build**

Run:

```bash
cd server && npm test -- scorer/index && npm test -- scorer/consistency && npm test -- scorer/resilience && npm test -- scorer/interaction && npm run build
```

Expected: PASS.

- [ ] **Step 5: Pause for Dele to commit**

Stop and present:
- Files changed:
  - `server/src/analyzer/scorer/index.ts`
  - `server/src/analyzer/scorer/index.test.ts`
- Suggested message: `feat(crispi): wire interaction axis into scoreDeck`

Wait for Dele before starting Task 5.

---

## Task 5 — Final verification sweep for the backend Interaction MVP slice

**Files:**
- Verify only; no new files required unless fixes are needed.

- [ ] **Step 1: Run the full server test suite**

Run:

```bash
cd server && npm test
```

Expected: all existing route/analyzer tests pass.

- [ ] **Step 2: Run the server build**

Run:

```bash
cd server && npm run build
```

Expected: zero TypeScript errors.

- [ ] **Step 3: Optional manual contract probe**

If you want a manual sanity check, start the built server and POST a resolved-deck JSON body to `/api/deck/score` containing interaction cards such as `Swords to Plowshares`, `Beast Within`, `Wrath of God`, and `Counterspell`.

Expected: HTTP 200 with:
- a non-empty `axes.interaction.subMetrics`
- `axes.speed.score === 0`
- `overall === round((consistency + resilience + interaction) / 4)`
- interaction sub-metric keys:
  - `removal.spot`
  - `removal.boardwipe`
  - `counterspells.count`
  - `interaction.coverage`

- [ ] **Step 4: Pause for Dele to commit**

Stop and present:
- Files changed: all analyzer files touched in Tasks 1–4
- Suggested message: `feat(crispi): add backend interaction scoring mvp slice`

Wait for Dele.

---

## Self-review checklist

- [ ] `tagCard()` remains the shared analyzer tag entrypoint
- [ ] Counterspells contribute to `counterspells.count` in Interaction
- [ ] Counterspells still do **not** contribute to Resilience in this MVP slice
- [ ] `interaction.coverage` uses the agreed step scoring behavior
- [ ] `scoreDeck()` now has real `Consistency` + `Resilience` + `Interaction`, with `Speed` still stubbed
- [ ] `overall` remains the mean of all four axes
- [ ] No route contract changes
- [ ] No new dependencies and no client changes
- [ ] Deferred note for future full-spec Interaction work remains explicit

---

## Execution handoff

Recommended execution mode for this plan: **Inline Execution** via `superpowers:executing-plans`, because the tasks share analyzer types and scoring logic and build directly on the existing backend files.
