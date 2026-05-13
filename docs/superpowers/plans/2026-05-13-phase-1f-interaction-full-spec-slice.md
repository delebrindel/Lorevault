# Phase 1.F — CRISPI Backend Interaction Full-Spec Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the backend `Interaction` axis by adding `interaction.instantSpeed`, `interaction.free`, and `interaction.stax` while preserving the existing Interaction MVP metrics and keeping `Speed` stubbed.

**Architecture:** Keep the public analyzer entrypoints unchanged: `tagCard()` remains the shared tag API and `scoreDeck()` remains the top-level scorer. Extend the existing `tags/interaction.ts` helper with the deferred Interaction signals, then extend `scorer/interaction.ts` to score all seven Interaction sub-metrics using the same evidence-heavy, target-based style already used by the analyzer. This slice explicitly leaves current `Resilience` behavior unchanged.

**Tech Stack:** TypeScript ESM, Vitest, existing server analyzer structure, no new dependencies.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `server/src/analyzer/types.ts` | Modify | Extend `CardTags` with the three deferred Interaction fields. |
| `server/src/analyzer/tags/interaction.ts` | Modify | Add instant-speed, free-interaction, and stax detection. |
| `server/src/analyzer/tags/interaction.test.ts` | Modify | Add focused tests for the new helper heuristics. |
| `server/src/analyzer/tags/index.ts` | Modify | Compose the additional Interaction fields through `tagCard()`. |
| `server/src/analyzer/tags/index.test.ts` | Modify | Verify `tagCard()` exposes the new Interaction fields without changing Resilience behavior. |
| `server/src/analyzer/scorer/interaction.ts` | Modify | Expand the Interaction scorer to all seven sub-metrics and remove the MVP-only deferred note. |
| `server/src/analyzer/scorer/interaction.test.ts` | Modify | Add tests for ratio scoring, free interaction, stax, and the full key set. |
| `server/src/analyzer/scorer/index.test.ts` | Modify | Optionally strengthen the top-level contract test to expect the full Interaction sub-metric set. |

---

## Codebase notes (read before Task 1)

Verified from the current repo:

- `server/src/analyzer/tags/interaction.ts` already handles `removal.spot`, `removal.boardwipe`, `counterspells.count`, and `interaction.coverage`.
- `server/src/analyzer/types.ts` currently defines `CardTags` with only the MVP Interaction fields.
- `server/src/analyzer/scorer/interaction.ts` currently scores 4 sub-metrics and still emits the MVP-only deferred note.
- `server/src/analyzer/scorer/index.ts` already wires real `scoreInteraction()` into `scoreDeck()`.
- The repo instructions require Dele to make commits. Do **not** run `git add` or `git commit`. At each checkpoint, stop and hand off the suggested commit message.
- This slice must **not** change current Resilience semantics. Counterspells remain Interaction-only in this follow-up.

---

## Scoring scope for this slice

### Already real before this slice
- `removal.spot`
- `removal.boardwipe`
- `counterspells.count`
- `interaction.coverage`

### Added in this slice
- `interaction.instantSpeed`
- `interaction.free`
- `interaction.stax`

### Explicitly deferred after this slice
- any `Speed` axis work
- politics / pillowfort interaction modeling
- targeted hand disruption
- counterspells contributing back into Resilience
- any client work
- any route changes

### Full Interaction weights for this slice

Use these weights inside `server/src/analyzer/scorer/interaction.ts`:

```ts
const WEIGHTS = {
  spot: 0.25,
  wipes: 0.15,
  counters: 0.15,
  instantSpeed: 0.15,
  free: 0.10,
  stax: 0.05,
  coverage: 0.15,
} as const;
```

### Additional target tables for this slice

Add these target entries to `server/src/analyzer/scorer/interaction.ts`:

```ts
const INSTANT_SPEED_TARGETS: Record<Archetype, { min: number; ideal: number; max: number }> = {
  "aggro/voltron": { min: 20, ideal: 35, max: 50 },
  "midrange/goodstuff": { min: 30, ideal: 45, max: 60 },
  control: { min: 55, ideal: 70, max: 85 },
  combo: { min: 50, ideal: 65, max: 80 },
  "aristocrats/sacrifice": { min: 30, ideal: 45, max: 60 },
  spellslinger: { min: 50, ideal: 65, max: 80 },
  "tokens/go-wide": { min: 25, ideal: 40, max: 55 },
  "reanimator/graveyard": { min: 35, ideal: 50, max: 65 },
  "lands/landfall": { min: 30, ideal: 45, max: 60 },
};

const FREE_TARGETS: Record<Archetype, { min: number; ideal: number; max: number }> = {
  "aggro/voltron": { min: 0, ideal: 1, max: 3 },
  "midrange/goodstuff": { min: 0, ideal: 2, max: 4 },
  control: { min: 2, ideal: 4, max: 7 },
  combo: { min: 2, ideal: 4, max: 7 },
  "aristocrats/sacrifice": { min: 0, ideal: 1, max: 3 },
  spellslinger: { min: 1, ideal: 3, max: 5 },
  "tokens/go-wide": { min: 0, ideal: 1, max: 3 },
  "reanimator/graveyard": { min: 1, ideal: 2, max: 5 },
  "lands/landfall": { min: 0, ideal: 1, max: 3 },
};

const STAX_TARGETS: Record<Archetype, { min: number; ideal: number; max: number }> = {
  "aggro/voltron": { min: 0, ideal: 0, max: 2 },
  "midrange/goodstuff": { min: 0, ideal: 1, max: 3 },
  control: { min: 1, ideal: 2, max: 4 },
  combo: { min: 0, ideal: 1, max: 3 },
  "aristocrats/sacrifice": { min: 0, ideal: 0, max: 2 },
  spellslinger: { min: 0, ideal: 1, max: 3 },
  "tokens/go-wide": { min: 0, ideal: 0, max: 2 },
  "reanimator/graveyard": { min: 0, ideal: 0, max: 2 },
  "lands/landfall": { min: 0, ideal: 1, max: 3 },
};
```

---

## Task 1 — Extend the Interaction tag helper and `CardTags`

**Files:**
- Modify: `server/src/analyzer/types.ts`
- Modify: `server/src/analyzer/tags/interaction.ts`
- Modify: `server/src/analyzer/tags/interaction.test.ts`

- [ ] **Step 1: Add failing helper tests for the new Interaction fields**

Append to `server/src/analyzer/tags/interaction.test.ts`:

```ts
  it("marks instant-speed interaction for instants", () => {
    const tags = detectInteractionTags(makeCard("Counterspell", {
      oracle_text: "Counter target spell.",
    }));
    expect(tags.interactionInstantSpeed).toBeGreaterThan(0);
    expect(tags.reasons).toContain("interaction: instant-speed interaction");
  });

  it("detects flash interaction conservatively", () => {
    const tags = detectInteractionTags(makeCard("Frilled Mystic", {
      type: "Creature",
      type_line: "Creature — Elf Lizard Wizard",
      oracle_text: "Flash\nWhen Frilled Mystic enters, counter target spell.",
    }));
    expect(tags.counterspellScore).toBeGreaterThan(0);
    expect(tags.interactionInstantSpeed).toBeGreaterThan(0);
  });

  it("detects explicit free interaction", () => {
    const tags = detectInteractionTags(makeCard("Force of Will", {
      oracle_text: "You may pay 1 life and exile a blue card from your hand rather than pay this spell's mana cost. Counter target spell.",
    }));
    expect(tags.interactionFreeScore).toBeGreaterThan(0);
    expect(tags.reasons).toContain("interaction: free interaction");
  });

  it("detects explicit stax pieces", () => {
    const tags = detectInteractionTags(makeCard("Rule of Law", {
      type: "Enchantment",
      type_line: "Enchantment",
      oracle_text: "Each player can't cast more than one spell each turn.",
    }));
    expect(tags.interactionStaxScore).toBeGreaterThan(0);
    expect(tags.reasons).toContain("interaction: stax piece");
  });

  it("does not count non-interaction free-cast text", () => {
    const tags = detectInteractionTags(makeCard("Omniscience", {
      type: "Enchantment",
      type_line: "Enchantment",
      oracle_text: "You may cast spells from your hand without paying their mana costs.",
    }));
    expect(tags.interactionFreeScore).toBe(0);
  });

  it("does not count generic utility permanents as stax", () => {
    const tags = detectInteractionTags(makeCard("Rhystic Study", {
      type: "Enchantment",
      type_line: "Enchantment",
      oracle_text: "Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.",
    }));
    expect(tags.interactionStaxScore).toBe(0);
  });
```

- [ ] **Step 2: Run the helper test to verify it fails**

Run:

```bash
cd server && npm test -- analyzer/tags/interaction
```

Expected: FAIL because the new fields and heuristics do not exist yet.

- [ ] **Step 3: Extend `CardTags` with the deferred Interaction fields**

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
  reasons: string[];
}
```

- [ ] **Step 4: Extend `detectInteractionTags()` with the deferred heuristics**

Edit `server/src/analyzer/tags/interaction.ts`.

Replace the `InteractionTagSlice` interface with:

```ts
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
  interactionInstantSpeed: number;
  interactionFreeScore: number;
  interactionStaxScore: number;
  reasons: string[];
}
```

Add these regexes below the existing ones:

```ts
const FLASH_RE = /\bFlash\b/i;
const FREE_CAST_RE = /without paying (?:its|their|this spell's|that spell's) mana cost/i;
const EXILE_ALT_COST_RE = /exile a .* card from your hand rather than pay/i;
const ZERO_ALT_COST_RE = /pay 0 rather than pay/i;
const COMMANDER_FREE_RE = /if you control a commander, you may cast this spell without paying its mana cost/i;
const RULE_OF_LAW_RE = /can't cast more than one spell each turn/i;
const SEARCH_DENIAL_RE = /if an opponent would search a library/i;
const CAST_RESTRICTION_RE = /opponents can't cast spells from anywhere other than their hands/i;
const UNTAP_DENIAL_RE = /players skip their untap steps/i;
const OPPONENT_TAX_RE = /spells your opponents cast cost .* more to cast/i;
```

Then replace the body of `detectInteractionTags()` with:

```ts
export function detectInteractionTags(card: Card): InteractionTagSlice {
  const oracle = card.oracle_text;
  const typeLine = card.type_line;
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

  let interactionFreeScore = 0;
  if (
    counterspellScore > 0 &&
    (FREE_CAST_RE.test(oracle) || EXILE_ALT_COST_RE.test(oracle) || ZERO_ALT_COST_RE.test(oracle) || COMMANDER_FREE_RE.test(oracle))
  ) {
    interactionFreeScore = 1;
    reasons.push("interaction: free interaction");
  }

  let interactionStaxScore = 0;
  if (
    RULE_OF_LAW_RE.test(oracle) ||
    SEARCH_DENIAL_RE.test(oracle) ||
    CAST_RESTRICTION_RE.test(oracle) ||
    UNTAP_DENIAL_RE.test(oracle) ||
    OPPONENT_TAX_RE.test(oracle)
  ) {
    interactionStaxScore = 1;
    reasons.push("interaction: stax piece");
  }

  const isInstantSpeedInteraction =
    (removalSpotScore > 0 || removalBoardwipeScore > 0 || counterspellScore > 0) &&
    (/\bInstant\b/i.test(typeLine) || FLASH_RE.test(typeLine) || FLASH_RE.test(oracle));

  const interactionInstantSpeed = isInstantSpeedInteraction ? 1 : 0;
  if (interactionInstantSpeed > 0) {
    reasons.push("interaction: instant-speed interaction");
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
    interactionInstantSpeed,
    interactionFreeScore,
    interactionStaxScore,
    reasons,
  };
}
```

- [ ] **Step 5: Run the helper tests and build**

Run:

```bash
cd server && npm test -- analyzer/tags/interaction && npm run build
```

Expected: helper tests pass; build may still fail until `tagCard()` is updated in Task 2.

- [ ] **Step 6: Pause for Dele to commit**

Stop and present:
- Files changed:
  - `server/src/analyzer/types.ts`
  - `server/src/analyzer/tags/interaction.ts`
  - `server/src/analyzer/tags/interaction.test.ts`
- Suggested message: `feat(analyzer-tags): extend interaction helper for full-spec metrics`

Wait for Dele before starting Task 2.

---

## Task 2 — Compose the new Interaction fields through `tagCard()`

**Files:**
- Modify: `server/src/analyzer/tags/index.ts`
- Modify: `server/src/analyzer/tags/index.test.ts`

- [ ] **Step 1: Add failing shared tag tests for the new fields**

Append to `server/src/analyzer/tags/index.test.ts`:

```ts
  it("exposes instant-speed and free interaction fields through tagCard", () => {
    const tags = tagCard(makeCard("Force of Will", {
      type: "Instant",
      type_line: "Instant",
      oracle_text: "You may pay 1 life and exile a blue card from your hand rather than pay this spell's mana cost. Counter target spell.",
    }));
    expect(tags.interactionInstantSpeed).toBeGreaterThan(0);
    expect(tags.interactionFreeScore).toBeGreaterThan(0);
    expect(tags.counterspellScore).toBeGreaterThan(0);
    expect(tags.protectionSpellScore).toBe(0);
  });

  it("exposes stax interaction fields through tagCard", () => {
    const tags = tagCard(makeCard("Rule of Law", {
      type: "Enchantment",
      type_line: "Enchantment",
      oracle_text: "Each player can't cast more than one spell each turn.",
    }));
    expect(tags.interactionStaxScore).toBeGreaterThan(0);
    expect(tags.reasons).toContain("interaction: stax piece");
  });
```

- [ ] **Step 2: Run the tag test to verify it fails**

Run:

```bash
cd server && npm test -- analyzer/tags/index
```

Expected: FAIL because `tagCard()` does not yet expose the new Interaction fields.

- [ ] **Step 3: Extend the return value in `tagCard()`**

Edit `server/src/analyzer/tags/index.ts`.

Replace the current `return` block with:

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
    reasons: [...reasons, ...resilience.reasons, ...interaction.reasons],
  };
```

- [ ] **Step 4: Run the focused tag tests and build**

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
- Suggested message: `feat(analyzer-tags): expose full-spec interaction fields in tagCard`

Wait for Dele before starting Task 3.

---

## Task 3 — Extend `scoreInteraction()` to full-spec Interaction

**Files:**
- Modify: `server/src/analyzer/scorer/interaction.ts`
- Modify: `server/src/analyzer/scorer/interaction.test.ts`

- [ ] **Step 1: Extend the scorer tests first**

Replace the first test in `server/src/analyzer/scorer/interaction.test.ts` with:

```ts
  it("returns the expected full Interaction sub-metric keys", () => {
    const report = scoreInteraction(strongDeck(), "control");
    expect(report.subMetrics.map((m) => m.key)).toEqual([
      "removal.spot",
      "removal.boardwipe",
      "counterspells.count",
      "interaction.instantSpeed",
      "interaction.free",
      "interaction.stax",
      "interaction.coverage",
    ]);
  });
```

Append these helpers and tests to `server/src/analyzer/scorer/interaction.test.ts`:

```ts
function fullSpecDeck(): ResolvedDeck {
  return {
    commander: [makeCard("Commander")],
    mainboard: [
      { card: land("Island"), qty: 36 },
      { card: makeCard("Swords to Plowshares", {
        oracle_text: "Exile target creature. Its controller gains life equal to its power.",
      }), qty: 1 },
      { card: makeCard("Counterspell", {
        oracle_text: "Counter target spell.",
      }), qty: 1 },
      { card: makeCard("Force of Will", {
        oracle_text: "You may pay 1 life and exile a blue card from your hand rather than pay this spell's mana cost. Counter target spell.",
      }), qty: 1 },
      { card: makeCard("Frilled Mystic", {
        type: "Creature",
        type_line: "Creature — Elf Lizard Wizard",
        oracle_text: "Flash\nWhen Frilled Mystic enters, counter target spell.",
      }), qty: 1 },
      { card: makeCard("Rule of Law", {
        type: "Enchantment",
        type_line: "Enchantment",
        oracle_text: "Each player can't cast more than one spell each turn.",
      }), qty: 1 },
    ],
    unresolved: [],
    ownedMap: new Map(),
  };
}

function sorceryHeavyInteractionDeck(): ResolvedDeck {
  return {
    commander: [makeCard("Commander")],
    mainboard: [
      { card: land("Plains"), qty: 36 },
      { card: makeCard("Vindicate", {
        type: "Sorcery",
        type_line: "Sorcery",
        oracle_text: "Destroy target permanent.",
      }), qty: 1 },
      { card: makeCard("Wrath of God", {
        type: "Sorcery",
        type_line: "Sorcery",
        oracle_text: "Destroy all creatures. They can't be regenerated.",
      }), qty: 1 },
    ],
    unresolved: [],
    ownedMap: new Map(),
  };
}

  it("uses ratio behavior for instant-speed interaction", () => {
    const instantHeavy = scoreInteraction(fullSpecDeck(), "control");
    const sorceryHeavy = scoreInteraction(sorceryHeavyInteractionDeck(), "control");
    const instantMetric = instantHeavy.subMetrics.find((m) => m.key === "interaction.instantSpeed");
    const sorceryMetric = sorceryHeavy.subMetrics.find((m) => m.key === "interaction.instantSpeed");
    expect((instantMetric?.raw ?? 0)).toBeGreaterThan(sorceryMetric?.raw ?? 0);
    expect((instantMetric?.score ?? 0)).toBeGreaterThan(sorceryMetric?.score ?? 0);
  });

  it("records free interaction and stax evidence", () => {
    const report = scoreInteraction(fullSpecDeck(), "control");
    expect(report.evidence.some((e) => e.card === "Force of Will" && e.subMetric === "interaction.free")).toBe(true);
    expect(report.evidence.some((e) => e.card === "Rule of Law" && e.subMetric === "interaction.stax")).toBe(true);
  });

  it("removes the old MVP-only deferred note", () => {
    const report = scoreInteraction(fullSpecDeck(), "control");
    expect(report.notes).not.toContain(
      "Instant-speed interaction, free interaction, and stax remain deferred in this MVP slice.",
    );
  });
```

- [ ] **Step 2: Run the scorer test to verify it fails**

Run:

```bash
cd server && npm test -- scorer/interaction
```

Expected: FAIL because the scorer still returns only the MVP sub-metrics and deferred note.

- [ ] **Step 3: Extend `scoreInteraction()` to score all seven metrics**

Edit `server/src/analyzer/scorer/interaction.ts`.

1. Extend the target declaration near the top to include `instantSpeed`, `free`, and `stax`:

```ts
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
```

2. Keep `scoreAgainstTarget()` and `scoreCoverage()` as-is.

3. Replace `scoreInteraction()` with:

```ts
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
```

- [ ] **Step 4: Run the focused Interaction scorer test and build**

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
- Suggested message: `feat(crispi): complete full-spec interaction scoring`

Wait for Dele before starting Task 4.

---

## Task 4 — Strengthen the top-level Interaction contract and verify the slice

**Files:**
- Modify: `server/src/analyzer/scorer/index.test.ts`

- [ ] **Step 1: Strengthen the top-level scorer test**

Replace the second test in `server/src/analyzer/scorer/index.test.ts` with:

```ts
  it("keeps the full-report contract while consistency, resilience, and full-spec interaction are implemented", () => {
    const report = scoreDeck(makeDeck(), { archetypeOverride: "control" });

    expect(report.axes.consistency.subMetrics.length).toBeGreaterThan(0);
    expect(report.axes.resilience.subMetrics.length).toBeGreaterThan(0);
    expect(report.axes.interaction.subMetrics.map((m) => m.key)).toEqual([
      "removal.spot",
      "removal.boardwipe",
      "counterspells.count",
      "interaction.instantSpeed",
      "interaction.free",
      "interaction.stax",
      "interaction.coverage",
    ]);
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

- [ ] **Step 2: Run the scorer-index test**

Run:

```bash
cd server && npm test -- scorer/index
```

Expected: PASS if Task 3 is complete.

- [ ] **Step 3: Run the full server test suite**

Run:

```bash
cd server && npm test
```

Expected: all server tests pass.

- [ ] **Step 4: Run the server build**

Run:

```bash
cd server && npm run build
```

Expected: zero TypeScript errors.

- [ ] **Step 5: Optional manual contract probe**

If you want a manual sanity check, start the built server and POST a resolved-deck JSON body to `/api/deck/score` containing cards like `Counterspell`, `Force of Will`, `Frilled Mystic`, and `Rule of Law`.

Expected: HTTP 200 with:
- `axes.interaction.subMetrics` containing all 7 Interaction keys
- `axes.speed.score === 0`
- `overall === round((consistency + resilience + interaction) / 4)`
- no MVP-only deferred note on the Interaction axis

- [ ] **Step 6: Pause for Dele to commit**

Stop and present:
- Files changed:
  - `server/src/analyzer/scorer/index.test.ts`
  - all earlier Interaction full-spec files from Tasks 1–3
- Suggested message: `feat(crispi): finish backend interaction full-spec slice`

Wait for Dele.

---

## Self-review checklist

- [ ] `tagCard()` remains the shared analyzer tag entrypoint
- [ ] Resilience behavior remains unchanged in this slice
- [ ] Counterspells still do **not** contribute to `Resilience.protection.spells`
- [ ] `interaction.instantSpeed` is scored as a ratio, not a raw count
- [ ] `interaction.free` only counts explicit free/alternate-cost interaction
- [ ] `interaction.stax` stays conservative and does not over-count utility permanents
- [ ] the old MVP-only deferred note is removed from the Interaction axis
- [ ] `scoreDeck()` still has real `Consistency` + `Resilience` + `Interaction`, with `Speed` stubbed
- [ ] `overall` remains the mean of all four axes
- [ ] No route contract changes
- [ ] No new dependencies and no client changes

---

## Execution handoff

Recommended execution mode for this plan: **Inline Execution** via `superpowers:executing-plans`, because the deferred Interaction fields build directly on the existing helper and scorer files and do not benefit from separate-session decomposition.
