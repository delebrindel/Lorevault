# Phase 1.D — CRISPI Backend Resilience Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real backend `Resilience` axis to `scoreDeck()` using focused resilience tagging helpers while keeping `Interaction` and `Speed` stubbed.

**Architecture:** Keep the public analyzer entrypoints unchanged: `tagCard()` remains the shared tag API and `scoreDeck()` remains the top-level scorer. Add a focused `tags/resilience.ts` helper that extends `CardTags` with resilience-facing numeric signals, then implement `scoreResilience()` in `scorer/resilience.ts` and wire it into the existing CRISPI report assembly.

**Tech Stack:** TypeScript ESM, Vitest, existing server analyzer structure, no new dependencies.

**Session checkpoint (2026-05-12):**
- Task 1 completed and committed in `66fb2a8` (`feat(analyzer-tags): add resilience tag helper and CardTags fields`)
- Task 2 completed and committed in `65360e6` (`feat(analyzer-tags): compose resilience signals into tagCard`)
- Task 3 completed and committed in `b55055f` (`feat(crispi): implement resilience scoring axis`)
- Task 4 implementation is done and locally verified, but not committed yet; current staged files are:
  - `server/src/analyzer/scorer/index.ts`
  - `server/src/analyzer/scorer/index.test.ts`
- **Resume point:** Start at **Task 4, Step 5** (commit checkpoint), then continue with **Task 5** final verification.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `server/src/analyzer/types.ts` | Modify | Extend `CardTags` with resilience-facing numeric fields. |
| `server/src/analyzer/tags/resilience.ts` | Create | Focused resilience tag helper for recursion, permanent protection, spell protection, wipe survivability, graveyard reliance. |
| `server/src/analyzer/tags/resilience.test.ts` | Create | Unit tests for resilience helper heuristics. |
| `server/src/analyzer/tags/index.ts` | Modify | Compose the resilience helper into `tagCard()`. |
| `server/src/analyzer/tags/index.test.ts` | Modify | Verify shared `tagCard()` exposes resilience fields and keeps counterspells out of `protection.spells`. |
| `server/src/analyzer/scorer/resilience.ts` | Create | Real `Resilience` axis scorer with archetype targets, evidence, notes, and graveyard exposure penalty. |
| `server/src/analyzer/scorer/resilience.test.ts` | Create | Unit tests for resilience scoring behavior and score ordering. |
| `server/src/analyzer/scorer/index.ts` | Modify | Replace the resilience stub with `scoreResilience()`. |
| `server/src/analyzer/scorer/index.test.ts` | Modify | Verify the top-level report now has real consistency + resilience and updated overall formula. |

---

## Codebase notes (read before Task 1)

Verified from the current repo:

- `server/src/analyzer/tags/index.ts` currently returns only `isLand`, `rampScore`, `drawScore`, `tutorScore`, and `reasons`.
- `server/src/analyzer/types.ts` currently defines `CardTags` without resilience fields, so extending the tag layer must start there.
- `server/src/analyzer/scorer/index.ts` already wires `scoreConsistency()` and still stubs `resilience`, `interaction`, and `speed`.
- `server/src/analyzer/scorer/consistency.ts` already contains a reusable scoring style worth mirroring: piecewise target scoring, weighted mean, evidence arrays, and notes.
- The current tests are server-only and use Vitest; there are no client dependencies in this slice.
- This repo’s instructions require Dele to make commits. Do **not** run `git add` or `git commit`. At each checkpoint, stop and hand off the suggested commit message.

---

## Scoring scope for this slice

### Real in this slice
- `recursion.count`
- `protection.permanents`
- `protection.spells` (**non-counter protective spells only**)
- `boardwipe.survivability`
- `graveyard.exposure` (simple flat penalty once graveyard reliance crosses a threshold)

### Explicitly deferred in this slice
- `commander.protection`
- `redundancy.engine`
- counterspells as resilience contributions
- graveyard-hate mitigation offsets
- route changes
- any client work

### Archetype target table for this slice

Use this target table inside `server/src/analyzer/scorer/resilience.ts`:

```ts
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
```

Use a single graveyard reliance threshold for slice 1.D:

```ts
const GRAVEYARD_EXPOSURE_THRESHOLD = 4;
```

Use resilience weights:

```ts
const WEIGHTS = {
  recursion: 0.25,
  permanentProtection: 0.20,
  spellProtection: 0.15,
  wipeSurvival: 0.25,
  graveyardExposure: 0.15,
} as const;
```

---

## Task 1 — Add resilience tag helper + extend `CardTags`

**Status:** Completed and committed in `66fb2a8`.

**Files:**
- Modify: `server/src/analyzer/types.ts`
- Create: `server/src/analyzer/tags/resilience.ts`
- Create: `server/src/analyzer/tags/resilience.test.ts`

- [ ] **Step 1: Write the failing resilience-helper tests**

Create `server/src/analyzer/tags/resilience.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { detectResilienceTags } from "./resilience.js";
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
    type: "Creature",
    type_line: "Creature",
    oracle_text: "",
    mana_cost: "{2}",
    colors: [],
    color_identity: [],
    rarity: "common",
    prices: {},
    ...overrides,
  };
}

describe("detectResilienceTags", () => {
  it("detects battlefield recursion", () => {
    const tags = detectResilienceTags(makeCard("Sun Titan", {
      oracle_text: "Whenever Sun Titan enters or attacks, return target permanent card with mana value 3 or less from your graveyard to the battlefield.",
    }));
    expect(tags.recursionScore).toBeGreaterThan(0);
    expect(tags.reasons).toContain("recursion: battlefield rebuy");
  });

  it("detects permanent-based protection", () => {
    const tags = detectResilienceTags(makeCard("Lightning Greaves", {
      type: "Artifact",
      type_line: "Artifact — Equipment",
      oracle_text: "Equipped creature has haste and shroud.",
    }));
    expect(tags.protectionPermanentScore).toBeGreaterThan(0);
    expect(tags.reasons).toContain("protection: permanent-based protection");
  });

  it("detects non-counter protective spells", () => {
    const tags = detectResilienceTags(makeCard("Heroic Intervention", {
      type: "Instant",
      type_line: "Instant",
      oracle_text: "Permanents you control gain hexproof and indestructible until end of turn.",
    }));
    expect(tags.protectionSpellScore).toBeGreaterThan(0);
    expect(tags.boardwipeSurvivalScore).toBeGreaterThan(0);
    expect(tags.reasons).toContain("protection: spell-based protection");
    expect(tags.reasons).toContain("survival: wipe protection");
  });

  it("tracks graveyard reliance for graveyard-centric spells", () => {
    const tags = detectResilienceTags(makeCard("Reanimate", {
      type: "Sorcery",
      type_line: "Sorcery",
      oracle_text: "Put target creature card from a graveyard onto the battlefield under your control. You lose life equal to its mana value.",
    }));
    expect(tags.recursionScore).toBeGreaterThan(0);
    expect(tags.graveyardRelianceScore).toBeGreaterThan(0);
    expect(tags.reasons).toContain("graveyard: reliance on graveyard resource");
  });

  it("does not count counterspells as protection spells in this slice", () => {
    const tags = detectResilienceTags(makeCard("Counterspell", {
      type: "Instant",
      type_line: "Instant",
      oracle_text: "Counter target spell.",
    }));
    expect(tags.protectionSpellScore).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd server && npm test -- analyzer/tags/resilience
```

Expected: FAIL because `server/src/analyzer/tags/resilience.ts` does not exist yet.

- [ ] **Step 3: Extend `CardTags` for resilience fields**

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
  reasons: string[];
}
```

- [ ] **Step 4: Create the resilience helper implementation**

Create `server/src/analyzer/tags/resilience.ts`:

```ts
import type { Card } from "../../types.js";

export interface ResilienceTagSlice {
  recursionScore: number;
  protectionPermanentScore: number;
  protectionSpellScore: number;
  boardwipeSurvivalScore: number;
  graveyardRelianceScore: number;
  reasons: string[];
}

const COUNTERSPELL_RE = /counter target/i;
const BATTLEFIELD_RECURSION_RE = /(?:return|put) target .* from (?:your|a) graveyard to|(?:return|put) .* from (?:your|a) graveyard onto the battlefield/i;
const HAND_RECURSION_RE = /return target .* from your graveyard to your hand|return .* from your graveyard to your hand/i;
const PROTECTION_KEYWORD_RE = /\b(hexproof|indestructible|shroud|ward|phasing|phase out|regenerate)\b/i;
const TEAM_PROTECTION_RE = /(permanents|creatures) you control gain .*?(hexproof|indestructible)|phase out|regenerate each creature you control/i;
const SAC_PROTECTION_RE = /sacrifice .*: .*creatures you control gain indestructible/i;
const GRAVEYARD_RELIANCE_RE = /from (?:your|a) graveyard|in your graveyard/i;

export function detectResilienceTags(card: Card): ResilienceTagSlice {
  const reasons: string[] = [];
  const oracle = card.oracle_text;
  const typeLine = card.type_line;
  const isSpell = /\bInstant\b|\bSorcery\b/i.test(typeLine);
  const isPermanent = !isSpell;

  let recursionScore = 0;
  if (BATTLEFIELD_RECURSION_RE.test(oracle)) {
    recursionScore = 1.5;
    reasons.push("recursion: battlefield rebuy");
  } else if (HAND_RECURSION_RE.test(oracle)) {
    recursionScore = 1;
    reasons.push("recursion: hand rebuy");
  }

  let protectionPermanentScore = 0;
  if (isPermanent && (PROTECTION_KEYWORD_RE.test(oracle) || PROTECTION_KEYWORD_RE.test(typeLine))) {
    protectionPermanentScore = 1;
    reasons.push("protection: permanent-based protection");
  }
  if (isPermanent && SAC_PROTECTION_RE.test(oracle)) {
    protectionPermanentScore = Math.max(protectionPermanentScore, 1.5);
    if (!reasons.includes("protection: permanent-based protection")) {
      reasons.push("protection: permanent-based protection");
    }
  }

  let protectionSpellScore = 0;
  if (isSpell && !COUNTERSPELL_RE.test(oracle) && TEAM_PROTECTION_RE.test(oracle)) {
    protectionSpellScore = 1.5;
    reasons.push("protection: spell-based protection");
  } else if (
    isSpell &&
    !COUNTERSPELL_RE.test(oracle) &&
    PROTECTION_KEYWORD_RE.test(oracle) &&
    /you control|target permanent you control|target creature you control/i.test(oracle)
  ) {
    protectionSpellScore = 1;
    reasons.push("protection: spell-based protection");
  }

  let boardwipeSurvivalScore = 0;
  if (TEAM_PROTECTION_RE.test(oracle) || SAC_PROTECTION_RE.test(oracle)) {
    boardwipeSurvivalScore = 1.5;
    reasons.push("survival: wipe protection");
  } else if (isPermanent && /\bindestructible\b/i.test(oracle)) {
    boardwipeSurvivalScore = 1;
    reasons.push("survival: self survives wipes");
  }

  let graveyardRelianceScore = 0;
  if (GRAVEYARD_RELIANCE_RE.test(oracle)) {
    graveyardRelianceScore = recursionScore > 0 ? 1.5 : 1;
    reasons.push("graveyard: reliance on graveyard resource");
  }

  return {
    recursionScore,
    protectionPermanentScore,
    protectionSpellScore,
    boardwipeSurvivalScore,
    graveyardRelianceScore,
    reasons,
  };
}
```

- [ ] **Step 5: Run the helper tests and build**

Run:

```bash
cd server && npm test -- analyzer/tags/resilience && npm run build
```

Expected: PASS.

- [ ] **Step 6: Pause for Dele to commit**

Stop and present:
- Files changed:
  - `server/src/analyzer/types.ts`
  - `server/src/analyzer/tags/resilience.ts`
  - `server/src/analyzer/tags/resilience.test.ts`
- Suggested message: `feat(analyzer-tags): add resilience tag helper and CardTags fields`

Wait for Dele before starting Task 2.

---

## Task 2 — Wire resilience tags through `tagCard()`

**Status:** Completed and committed in `65360e6`.

**Files:**
- Modify: `server/src/analyzer/tags/index.ts`
- Modify: `server/src/analyzer/tags/index.test.ts`

- [ ] **Step 1: Add failing integration tests for `tagCard()`**

Append to `server/src/analyzer/tags/index.test.ts`:

```ts
  it("merges resilience helper signals into tagCard output", () => {
    const tags = tagCard(makeCard("Heroic Intervention", {
      type: "Instant",
      type_line: "Instant",
      oracle_text: "Permanents you control gain hexproof and indestructible until end of turn.",
    }));
    expect(tags.protectionSpellScore).toBeGreaterThan(0);
    expect(tags.boardwipeSurvivalScore).toBeGreaterThan(0);
    expect(tags.reasons).toContain("protection: spell-based protection");
  });

  it("still keeps counterspells out of protection.spells", () => {
    const tags = tagCard(makeCard("Counterspell", {
      type: "Instant",
      type_line: "Instant",
      oracle_text: "Counter target spell.",
    }));
    expect(tags.protectionSpellScore).toBe(0);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
cd server && npm test -- analyzer/tags/index
```

Expected: FAIL because `tagCard()` does not yet expose the new resilience fields.

- [ ] **Step 3: Compose the resilience helper in `tagCard()`**

Edit `server/src/analyzer/tags/index.ts`.

Add import:

```ts
import { detectResilienceTags } from "./resilience.js";
```

Then replace the function body with:

```ts
export function tagCard(card: Card): CardTags {
  const reasons: string[] = [];
  const oracle = card.oracle_text;
  const isLand = /\bLand\b/i.test(card.type_line);
  const resilience = detectResilienceTags(card);

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
    reasons: [...reasons, ...resilience.reasons],
  };
}
```

- [ ] **Step 4: Run the tag tests and build**

Run:

```bash
cd server && npm test -- analyzer/tags/index && npm test -- analyzer/tags/resilience && npm run build
```

Expected: PASS.

- [ ] **Step 5: Pause for Dele to commit**

Stop and present:
- Files changed:
  - `server/src/analyzer/tags/index.ts`
  - `server/src/analyzer/tags/index.test.ts`
- Suggested message: `feat(analyzer-tags): compose resilience signals into tagCard`

Wait for Dele before starting Task 3.

---

## Task 3 — Implement `scoreResilience()`

**Status:** Completed and committed in `b55055f`.

**Files:**
- Create: `server/src/analyzer/scorer/resilience.ts`
- Create: `server/src/analyzer/scorer/resilience.test.ts`

- [ ] **Step 1: Write the failing resilience-scorer tests**

Create `server/src/analyzer/scorer/resilience.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { scoreResilience } from "./resilience.js";
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
    type: "Creature",
    type_line: "Creature",
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
      { card: makeCard("Vanilla Creature", { oracle_text: "" }), qty: 10 },
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
      { card: makeCard("Sun Titan", {
        cmc: 6,
        oracle_text: "Whenever Sun Titan enters or attacks, return target permanent card with mana value 3 or less from your graveyard to the battlefield.",
      }), qty: 1 },
      { card: makeCard("Eternal Witness", {
        cmc: 3,
        oracle_text: "When Eternal Witness enters, you may return target card from your graveyard to your hand.",
      }), qty: 1 },
      { card: makeCard("Lightning Greaves", {
        type: "Artifact",
        type_line: "Artifact — Equipment",
        oracle_text: "Equipped creature has haste and shroud.",
      }), qty: 1 },
      { card: makeCard("Heroic Intervention", {
        type: "Instant",
        type_line: "Instant",
        oracle_text: "Permanents you control gain hexproof and indestructible until end of turn.",
      }), qty: 1 },
      { card: makeCard("Selfless Spirit", {
        oracle_text: "Sacrifice Selfless Spirit: Creatures you control gain indestructible until end of turn.",
      }), qty: 1 },
    ],
    unresolved: [],
    ownedMap: new Map(),
  };
}

function graveyardHeavyDeck(): ResolvedDeck {
  return {
    commander: [makeCard("Commander")],
    mainboard: [
      { card: land("Swamp"), qty: 36 },
      { card: makeCard("Reanimate", {
        type: "Sorcery",
        type_line: "Sorcery",
        oracle_text: "Put target creature card from a graveyard onto the battlefield under your control. You lose life equal to its mana value.",
      }), qty: 2 },
      { card: makeCard("Victimize", {
        type: "Sorcery",
        type_line: "Sorcery",
        oracle_text: "Choose two target creature cards in your graveyard. Sacrifice a creature. If you do, return the chosen cards to the battlefield tapped.",
      }), qty: 2 },
      { card: makeCard("Animate Dead", {
        type: "Enchantment",
        type_line: "Enchantment — Aura",
        oracle_text: "When Animate Dead enters, if it's on the battlefield, it loses enchant creature card in a graveyard and gains enchant creature put onto the battlefield with Animate Dead. Return enchanted creature card to the battlefield under your control.",
      }), qty: 1 },
    ],
    unresolved: [],
    ownedMap: new Map(),
  };
}

describe("scoreResilience", () => {
  it("returns the expected sub-metric keys", () => {
    const report = scoreResilience(strongDeck(), "midrange/goodstuff");
    expect(report.subMetrics.map((m) => m.key)).toEqual([
      "recursion.count",
      "protection.permanents",
      "protection.spells",
      "boardwipe.survivability",
      "graveyard.exposure",
    ]);
  });

  it("scores a stronger resilience deck higher than a weak one", () => {
    const weak = scoreResilience(weakDeck(), "midrange/goodstuff");
    const strong = scoreResilience(strongDeck(), "midrange/goodstuff");
    expect(strong.score).toBeGreaterThan(weak.score);
  });

  it("records evidence from representative resilience cards", () => {
    const report = scoreResilience(strongDeck(), "midrange/goodstuff");
    expect(report.evidence.some((e) => e.card === "Sun Titan" && e.subMetric === "recursion.count")).toBe(true);
    expect(report.evidence.some((e) => e.card === "Lightning Greaves" && e.subMetric === "protection.permanents")).toBe(true);
    expect(report.evidence.some((e) => e.card === "Heroic Intervention" && e.subMetric === "protection.spells")).toBe(true);
    expect(report.evidence.some((e) => e.card === "Selfless Spirit" && e.subMetric === "boardwipe.survivability")).toBe(true);
  });

  it("penalizes graveyard-heavy decks on graveyard exposure", () => {
    const report = scoreResilience(graveyardHeavyDeck(), "reanimator/graveyard");
    const exposure = report.subMetrics.find((m) => m.key === "graveyard.exposure");
    expect(exposure?.score).toBeLessThan(100);
  });

  it("uses the shared analyzer grade mapping", () => {
    const report = scoreResilience(strongDeck(), "midrange/goodstuff");
    expect(["F", "D", "C", "B", "A", "S"]).toContain(report.grade);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
cd server && npm test -- scorer/resilience
```

Expected: FAIL because `server/src/analyzer/scorer/resilience.ts` does not exist yet.

- [ ] **Step 3: Implement the resilience scorer**

Create `server/src/analyzer/scorer/resilience.ts`:

```ts
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
```

- [ ] **Step 4: Run the resilience scorer tests and build**

Run:

```bash
cd server && npm test -- scorer/resilience && npm run build
```

Expected: PASS.

- [ ] **Step 5: Pause for Dele to commit**

Stop and present:
- Files changed:
  - `server/src/analyzer/scorer/resilience.ts`
  - `server/src/analyzer/scorer/resilience.test.ts`
- Suggested message: `feat(crispi): implement resilience scoring axis`

Wait for Dele before starting Task 4.

---

## Task 4 — Wire `scoreResilience()` into `scoreDeck()`

**Status:** Implemented and locally verified; staged but not committed. Resume from Step 5.

**Files:**
- Modify: `server/src/analyzer/scorer/index.ts`
- Modify: `server/src/analyzer/scorer/index.test.ts`

- [ ] **Step 1: Strengthen the top-level scorer test first**

Replace the second test in `server/src/analyzer/scorer/index.test.ts` with:

```ts
  it("keeps the full-report contract while consistency and resilience are implemented", () => {
    const report = scoreDeck(makeDeck(), { archetypeOverride: "control" });

    expect(report.axes.consistency.subMetrics.length).toBeGreaterThan(0);
    expect(report.axes.resilience.subMetrics.length).toBeGreaterThan(0);
    expect(report.axes.interaction.score).toBe(0);
    expect(report.axes.speed.score).toBe(0);
    expect(report.overall).toBe(
      Math.round((report.axes.consistency.score + report.axes.resilience.score) / 4),
    );
  });
```

Also update the first test’s resilience assertion to:

```ts
    expect(report.axes.resilience.grade).toBeDefined();
```

instead of checking the stub note.

- [ ] **Step 2: Run the scorer-index test to verify it fails**

Run:

```bash
cd server && npm test -- scorer/index
```

Expected: FAIL because `scoreDeck()` still returns a stubbed resilience axis.

- [ ] **Step 3: Wire real resilience scoring into `scoreDeck()`**

Edit `server/src/analyzer/scorer/index.ts`.

Add import:

```ts
import { scoreResilience } from "./resilience.js";
```

Replace the axis construction section with:

```ts
  const consistency = scoreConsistency(deck, detected.archetype);
  const resilience = scoreResilience(deck, detected.archetype);
  const interaction = makeStubAxis();
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
```

- [ ] **Step 4: Run the focused scorer tests and build**

Run:

```bash
cd server && npm test -- scorer/index && npm test -- scorer/consistency && npm test -- scorer/resilience && npm run build
```

Expected: PASS.

- [ ] **Step 5: Pause for Dele to commit**

Stop and present:
- Files changed:
  - `server/src/analyzer/scorer/index.ts`
  - `server/src/analyzer/scorer/index.test.ts`
- Suggested message: `feat(crispi): wire resilience axis into scoreDeck`

Wait for Dele before starting Task 5.

---

## Task 5 — Final verification sweep for the backend resilience slice

**Status:** Pending.

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

If you want a manual sanity check, start the built server and POST a resolved-deck JSON body to `/api/deck/score` containing one or two resilience cards such as `Heroic Intervention`, `Lightning Greaves`, and `Sun Titan`.

Expected: HTTP 200 with:
- a non-empty `axes.resilience.subMetrics`
- `axes.interaction.score === 0`
- `axes.speed.score === 0`
- `overall === round((consistency + resilience) / 4)`

- [ ] **Step 4: Pause for Dele to commit**

Stop and present:
- Files changed: all analyzer files touched in Tasks 1–4
- Suggested message: `feat(crispi): add backend resilience scoring slice`

Wait for Dele.

---

## Self-review checklist

- [ ] `tagCard()` remains the shared analyzer tag entrypoint
- [ ] Counterspells do **not** contribute to `protection.spells` in this slice
- [ ] `graveyard.exposure` uses the agreed simple threshold penalty, not the full future mitigation model
- [ ] `scoreDeck()` now has real `Consistency` + `Resilience`, with `Interaction` and `Speed` still stubbed
- [ ] `overall` remains the mean of all four axes
- [ ] No route contract changes
- [ ] No new dependencies and no client changes

---

## Execution handoff

Recommended execution mode for this plan: **Inline Execution** via `superpowers:executing-plans`, because the tasks share types and build directly on the existing analyzer files.
