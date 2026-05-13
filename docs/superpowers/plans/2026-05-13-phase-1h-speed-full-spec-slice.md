# Phase 1.H — CRISPI Backend Speed Full-Spec Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the backend `Speed` axis by adding `threat.density`, `wincon.turnEstimate`, and `tutor.speed`, while also adding fixture snapshots and centralized Speed heuristic constants.

**Architecture:** Keep the public analyzer entrypoints unchanged: `tagCard()` remains the shared tag API and `scoreDeck()` remains the top-level scorer. Extend the existing `tags/speed.ts` helper with conservative threat and tutor-speed signals, add a dedicated `scorer/speed.constants.ts` module for the most subjective Speed heuristics, and extend `scorer/speed.ts` to score all seven Speed sub-metrics. Add a small set of resolved-deck fixtures and snapshot full `CrispiReport` outputs so heuristic drift is visible and reviewable.

**Tech Stack:** TypeScript ESM, Vitest, existing server analyzer structure, no new dependencies.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `server/src/analyzer/types.ts` | Modify | Extend `CardTags` with the deferred Speed helper fields. |
| `server/src/analyzer/tags/speed.ts` | Modify | Add conservative threat-density and tutor-speed detection. |
| `server/src/analyzer/tags/speed.test.ts` | Modify | Add focused tests for the new Speed helper heuristics. |
| `server/src/analyzer/tags/index.ts` | Modify | Compose the new Speed helper fields through `tagCard()`. |
| `server/src/analyzer/tags/index.test.ts` | Modify | Verify `tagCard()` exposes the new Speed fields without regressing current axes. |
| `server/src/analyzer/scorer/speed.constants.ts` | Create | Centralized Speed heuristic constants / allowlists / target helpers. |
| `server/src/analyzer/scorer/speed.ts` | Modify | Extend the Speed scorer to all seven Speed sub-metrics and remove the MVP-only deferred note. |
| `server/src/analyzer/scorer/speed.test.ts` | Modify | Add tests for threat density, turn estimate, tutor speed, and the full key set. |
| `server/src/analyzer/scorer/fixtures/aggro-voltron.resolved.ts` | Create | Representative resolved-deck fixture for full-report snapshot testing. |
| `server/src/analyzer/scorer/fixtures/control.resolved.ts` | Create | Representative resolved-deck fixture for full-report snapshot testing. |
| `server/src/analyzer/scorer/fixtures/combo.resolved.ts` | Create | Representative resolved-deck fixture for full-report snapshot testing. |
| `server/src/analyzer/scorer/report-snapshots.test.ts` | Create | Snapshot full `CrispiReport` outputs for representative deck fixtures. |
| `server/src/analyzer/scorer/index.test.ts` | Modify | Optionally strengthen the top-level contract expectations if needed. |

---

## Codebase notes (read before Task 1)

Verified from the current repo:

- `server/src/analyzer/tags/speed.ts` already handles `fastManaTierScore`, `earlyRampScore`, and `lowDropSpeedScore`.
- `server/src/analyzer/scorer/speed.ts` already scores `mana.fast`, `mana.earlyRamp`, `curve.avgCMC`, and `curve.lowDrops` and still emits the Speed MVP-only deferred note.
- `server/src/analyzer/scorer/index.ts` already wires real `scoreSpeed()` into `scoreDeck()`.
- The repo instructions require Dele to make commits. Do **not** run `git add` or `git commit`. At each checkpoint, stop and hand off the suggested commit message.
- This repo still has the known Vitest quirk where stale `dist/**/*.test.js` files may be picked up during focused runs. Prefer `npm test -- src/...` for red/green cycles when needed.
- Snapshot churn is expected in this slice. Snapshot diffs are part of the review surface, not automatically a bug.

---

## Scoring scope for this slice

### Already real before this slice
- `mana.fast`
- `mana.earlyRamp`
- `curve.avgCMC`
- `curve.lowDrops`

### Added in this slice
- `threat.density`
- `wincon.turnEstimate`
- `tutor.speed`

### Hardening included in this slice
- centralized Speed heuristic constants / allowlists
- representative resolved-deck fixtures
- full `CrispiReport` snapshot tests

### Explicitly deferred after this slice
- route changes
- client/UI work
- archetype detector overhaul
- corpus / gap analysis
- simulation / Monte Carlo speed modeling
- power-level sliders

---

## Task 1 — Extend the Speed helper and `CardTags`

**Files:**
- Modify: `server/src/analyzer/types.ts`
- Modify: `server/src/analyzer/tags/speed.ts`
- Modify: `server/src/analyzer/tags/speed.test.ts`

- [ ] **Step 1: Add failing helper tests for threat and tutor-speed signals**

Append to `server/src/analyzer/tags/speed.test.ts`:

```ts
  it("detects clear finishing or must-answer threats", () => {
    const tags = detectSpeedTags(makeCard("Craterhoof Behemoth", {
      type: "Creature",
      type_line: "Creature — Beast",
      cmc: 8,
      oracle_text: "When Craterhoof Behemoth enters, creatures you control gain trample and get +X/+X until end of turn, where X is the number of creatures you control.",
    }));
    expect(tags.threatDensityScore).toBeGreaterThan(0);
    expect(tags.reasons).toContain("speed: threat density");
  });

  it("gives extra threat weight to commander-damage style closers", () => {
    const tags = detectSpeedTags(makeCard("Blackblade Reforged", {
      type: "Artifact",
      type_line: "Legendary Artifact — Equipment",
      cmc: 2,
      oracle_text: "Equipped creature gets +1/+1 for each land you control.",
    }));
    expect(tags.threatDensityScore).toBeGreaterThan(1);
  });

  it("detects cheap broad tutors as speed-positive", () => {
    const tags = detectSpeedTags(makeCard("Demonic Tutor", {
      type: "Sorcery",
      type_line: "Sorcery",
      cmc: 2,
      oracle_text: "Search your library for a card, put that card into your hand, then shuffle.",
    }));
    expect(tags.tutorSpeedScore).toBeGreaterThan(0);
    expect(tags.reasons).toContain("speed: tutor-speed contribution");
  });

  it("scores slow narrow tutors below cheap broad tutors", () => {
    const broad = detectSpeedTags(makeCard("Demonic Tutor", {
      type: "Sorcery",
      type_line: "Sorcery",
      cmc: 2,
      oracle_text: "Search your library for a card, put that card into your hand, then shuffle.",
    }));
    const narrow = detectSpeedTags(makeCard("Diabolic Tutor", {
      type: "Sorcery",
      type_line: "Sorcery",
      cmc: 4,
      oracle_text: "Search your library for a card, put that card into your hand, then shuffle.",
    }));
    expect(broad.tutorSpeedScore).toBeGreaterThan(narrow.tutorSpeedScore);
  });

  it("does not falsely count generic value cards as speed threats", () => {
    const tags = detectSpeedTags(makeCard("Rhystic Study", {
      type: "Enchantment",
      type_line: "Enchantment",
      cmc: 3,
      oracle_text: "Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.",
    }));
    expect(tags.threatDensityScore).toBe(0);
  });
```

- [ ] **Step 2: Run the helper test to verify it fails**

Run:

```bash
cd server && npm test -- src/analyzer/tags/speed.test.ts
```

Expected: FAIL because the new fields and heuristics do not exist yet.

- [ ] **Step 3: Extend `CardTags` with the deferred Speed fields**

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
  threatDensityScore: number;
  tutorSpeedScore: number;
  reasons: string[];
}
```

- [ ] **Step 4: Extend the Speed helper implementation**

Edit `server/src/analyzer/tags/speed.ts`.

Replace the `SpeedTagSlice` interface with:

```ts
export interface SpeedTagSlice {
  fastManaTierScore: number;
  earlyRampScore: number;
  lowDropSpeedScore: number;
  threatDensityScore: number;
  tutorSpeedScore: number;
  reasons: string[];
}
```

Add these regexes below the existing ones:

```ts
const TUTOR_ANY_RE = /search your library for a card/i;
const TUTOR_NARROW_RE = /search your library for (an? )?(artifact|creature|enchantment|instant|sorcery) card/i;
const FINISHER_RE = /(creatures you control gain trample and get \+X\/\+X|double strike|extra combat|infect|commander damage)/i;
const MUST_ANSWER_RE = /(whenever .* deals combat damage to a player|at the beginning of combat on your turn)/i;
const VOLTRON_PRESSURE_RE = /(equipped creature gets \+1\/\+1 for each land you control|equipped creature has double strike|equipped creature gets \+\d+\/\+\d+)/i;
```

Then replace the body of `detectSpeedTags()` with:

```ts
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

  let threatDensityScore = 0;
  if (FINISHER_RE.test(card.oracle_text)) {
    threatDensityScore = 1.5;
    reasons.push("speed: threat density");
  } else if (VOLTRON_PRESSURE_RE.test(card.oracle_text)) {
    threatDensityScore = 1.25;
    reasons.push("speed: threat density");
  } else if (MUST_ANSWER_RE.test(card.oracle_text)) {
    threatDensityScore = 1;
    reasons.push("speed: threat density");
  }

  let tutorSpeedScore = 0;
  if (TUTOR_ANY_RE.test(card.oracle_text)) {
    tutorSpeedScore = card.cmc <= 2 ? 1 : 0.6;
    reasons.push("speed: tutor-speed contribution");
  } else if (TUTOR_NARROW_RE.test(card.oracle_text)) {
    tutorSpeedScore = card.cmc <= 2 ? 0.75 : 0.4;
    reasons.push("speed: tutor-speed contribution");
  }

  return {
    fastManaTierScore,
    earlyRampScore,
    lowDropSpeedScore,
    threatDensityScore,
    tutorSpeedScore,
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
- Suggested message: `feat(analyzer-tags): extend speed helper for full-spec metrics`

Wait for Dele before starting Task 2.

---

## Task 2 — Compose the new Speed fields through `tagCard()`

**Files:**
- Modify: `server/src/analyzer/tags/index.ts`
- Modify: `server/src/analyzer/tags/index.test.ts`

- [ ] **Step 1: Add failing shared tag tests for the new Speed fields**

Append to `server/src/analyzer/tags/index.test.ts`:

```ts
  it("exposes threat and tutor-speed fields through tagCard", () => {
    const threat = tagCard(makeCard("Craterhoof Behemoth", {
      type: "Creature",
      type_line: "Creature — Beast",
      cmc: 8,
      oracle_text: "When Craterhoof Behemoth enters, creatures you control gain trample and get +X/+X until end of turn, where X is the number of creatures you control.",
    }));
    const tutor = tagCard(makeCard("Demonic Tutor", {
      type: "Sorcery",
      type_line: "Sorcery",
      cmc: 2,
      oracle_text: "Search your library for a card, put that card into your hand, then shuffle.",
    }));
    expect(threat.threatDensityScore).toBeGreaterThan(0);
    expect(tutor.tutorSpeedScore).toBeGreaterThan(0);
    expect(tutor.reasons).toContain("speed: tutor-speed contribution");
  });
```

- [ ] **Step 2: Run the shared tag test to verify it fails**

Run:

```bash
cd server && npm test -- src/analyzer/tags/index.test.ts
```

Expected: FAIL because `tagCard()` does not yet expose the new Speed fields.

- [ ] **Step 3: Extend the `tagCard()` return shape**

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
    fastManaTierScore: speed.fastManaTierScore,
    earlyRampScore: speed.earlyRampScore,
    lowDropSpeedScore: speed.lowDropSpeedScore,
    threatDensityScore: speed.threatDensityScore,
    tutorSpeedScore: speed.tutorSpeedScore,
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
- Suggested message: `feat(analyzer-tags): expose full-spec speed fields in tagCard`

Wait for Dele before starting Task 3.

---

## Task 3 — Add centralized Speed constants and extend `scoreSpeed()`

**Files:**
- Create: `server/src/analyzer/scorer/speed.constants.ts`
- Modify: `server/src/analyzer/scorer/speed.ts`
- Modify: `server/src/analyzer/scorer/speed.test.ts`

- [ ] **Step 1: Extend the scorer tests first**

Replace the first test in `server/src/analyzer/scorer/speed.test.ts` with:

```ts
  it("returns the expected full Speed sub-metric keys", () => {
    const report = scoreSpeed(strongDeck(), "aggro/voltron");
    expect(report.subMetrics.map((m) => m.key)).toEqual([
      "mana.fast",
      "mana.earlyRamp",
      "curve.avgCMC",
      "curve.lowDrops",
      "threat.density",
      "wincon.turnEstimate",
      "tutor.speed",
    ]);
  });
```

Append these helpers and tests to `server/src/analyzer/scorer/speed.test.ts`:

```ts
function fullSpecDeck(): ResolvedDeck {
  return {
    commander: [makeCard("Commander", { type: "Creature", type_line: "Legendary Creature", cmc: 3 })],
    mainboard: [
      { card: land("Plains"), qty: 36 },
      { card: makeCard("Sol Ring", { cmc: 1, oracle_text: "{T}: Add {C}{C}." }), qty: 1 },
      { card: makeCard("Demonic Tutor", {
        type: "Sorcery",
        type_line: "Sorcery",
        cmc: 2,
        oracle_text: "Search your library for a card, put that card into your hand, then shuffle.",
      }), qty: 1 },
      { card: makeCard("Blackblade Reforged", {
        type: "Artifact",
        type_line: "Legendary Artifact — Equipment",
        cmc: 2,
        oracle_text: "Equipped creature gets +1/+1 for each land you control.",
      }), qty: 1 },
      { card: makeCard("Craterhoof Behemoth", {
        type: "Creature",
        type_line: "Creature — Beast",
        cmc: 8,
        oracle_text: "When Craterhoof Behemoth enters, creatures you control gain trample and get +X/+X until end of turn, where X is the number of creatures you control.",
      }), qty: 1 },
    ],
    unresolved: [],
    ownedMap: new Map(),
  };
}

function slowerDeck(): ResolvedDeck {
  return {
    commander: [makeCard("Commander", { type: "Creature", type_line: "Legendary Creature", cmc: 6 })],
    mainboard: [
      { card: land("Plains"), qty: 36 },
      { card: makeCard("Diabolic Tutor", {
        type: "Sorcery",
        type_line: "Sorcery",
        cmc: 4,
        oracle_text: "Search your library for a card, put that card into your hand, then shuffle.",
      }), qty: 1 },
      { card: makeCard("Big Creature", { type: "Creature", type_line: "Creature", cmc: 7 }), qty: 4 },
    ],
    unresolved: [],
    ownedMap: new Map(),
  };
}

  it("records threat and tutor-speed evidence", () => {
    const report = scoreSpeed(fullSpecDeck(), "aggro/voltron");
    expect(report.evidence.some((e) => e.card === "Craterhoof Behemoth" && e.subMetric === "threat.density")).toBe(true);
    expect(report.evidence.some((e) => e.card === "Demonic Tutor" && e.subMetric === "tutor.speed")).toBe(true);
  });

  it("estimates a faster win turn for the faster deck profile", () => {
    const faster = scoreSpeed(fullSpecDeck(), "aggro/voltron");
    const slower = scoreSpeed(slowerDeck(), "aggro/voltron");
    const fasterMetric = faster.subMetrics.find((m) => m.key === "wincon.turnEstimate");
    const slowerMetric = slower.subMetrics.find((m) => m.key === "wincon.turnEstimate");
    expect((fasterMetric?.score ?? 0)).toBeGreaterThan(slowerMetric?.score ?? 0);
  });

  it("removes the old Speed MVP-only deferred note", () => {
    const report = scoreSpeed(fullSpecDeck(), "aggro/voltron");
    expect(report.notes).not.toContain(
      "Threat density, win-turn estimate, and tutor-speed remain deferred in this Speed MVP slice.",
    );
  });
```

- [ ] **Step 2: Run the Speed scorer test to verify it fails**

Run:

```bash
cd server && npm test -- src/analyzer/scorer/speed.test.ts
```

Expected: FAIL because the scorer still returns only the Speed MVP sub-metrics and deferred note.

- [ ] **Step 3: Create centralized Speed constants**

Create `server/src/analyzer/scorer/speed.constants.ts`:

```ts
import type { Archetype } from "../types.js";

export const THREAT_FINISHER_RE = /(creatures you control gain trample and get \+X\/\+X|double strike|extra combat|infect|commander damage)/i;
export const THREAT_VOLTRON_RE = /(equipped creature gets \+1\/\+1 for each land you control|equipped creature has double strike|equipped creature gets \+\d+\/\+\d+)/i;
export const THREAT_MUST_ANSWER_RE = /(whenever .* deals combat damage to a player|at the beginning of combat on your turn)/i;

export const WIN_TURN_TARGETS: Record<Archetype, { min: number; ideal: number; max: number }> = {
  "aggro/voltron": { min: 6, ideal: 5, max: 4 },
  "midrange/goodstuff": { min: 8, ideal: 7, max: 6 },
  control: { min: 10, ideal: 9, max: 7 },
  combo: { min: 6, ideal: 5, max: 3 },
  "aristocrats/sacrifice": { min: 8, ideal: 7, max: 5 },
  spellslinger: { min: 8, ideal: 7, max: 5 },
  "tokens/go-wide": { min: 8, ideal: 7, max: 6 },
  "reanimator/graveyard": { min: 6, ideal: 5, max: 4 },
  "lands/landfall": { min: 9, ideal: 8, max: 6 },
};

export const TUTOR_SPEED_WEIGHTS = {
  broadCheap: 1,
  broadSlow: 0.6,
  narrowCheap: 0.75,
  narrowSlow: 0.4,
} as const;
```

- [ ] **Step 4: Extend `scoreSpeed()` to full-spec Speed**

Edit `server/src/analyzer/scorer/speed.ts`.

Add imports:

```ts
import { WIN_TURN_TARGETS } from "./speed.constants.js";
```

Extend the target declaration near the top to include `threatDensity`, `winconTurn`, and `tutorSpeed`:

```ts
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
```

Add this helper below `scoreAverageCmc()`:

```ts
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
```

Then replace `scoreSpeed()` with:

```ts
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
```

- [ ] **Step 5: Run the focused Speed scorer test and build**

Run:

```bash
cd server && npm test -- src/analyzer/scorer/speed.test.ts && npm run build
```

Expected: PASS.

- [ ] **Step 6: Pause for Dele to commit**

Stop and present:
- Files changed:
  - `server/src/analyzer/scorer/speed.constants.ts`
  - `server/src/analyzer/scorer/speed.ts`
  - `server/src/analyzer/scorer/speed.test.ts`
- Suggested message: `feat(crispi): complete full-spec speed scoring`

Wait for Dele before starting Task 4.

---

## Task 4 — Add representative deck fixtures and full-report snapshots

**Files:**
- Create: `server/src/analyzer/scorer/fixtures/aggro-voltron.resolved.ts`
- Create: `server/src/analyzer/scorer/fixtures/control.resolved.ts`
- Create: `server/src/analyzer/scorer/fixtures/combo.resolved.ts`
- Create: `server/src/analyzer/scorer/report-snapshots.test.ts`

- [ ] **Step 1: Add the failing snapshot test first**

Create `server/src/analyzer/scorer/report-snapshots.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { scoreDeck } from "./index.js";
import { aggroVoltronFixture } from "./fixtures/aggro-voltron.resolved.js";
import { controlFixture } from "./fixtures/control.resolved.js";
import { comboFixture } from "./fixtures/combo.resolved.js";

describe("CrispiReport snapshots", () => {
  it("scores the aggro/voltron fixture", () => {
    expect(scoreDeck(aggroVoltronFixture, { archetypeOverride: "aggro/voltron" })).toMatchSnapshot();
  });

  it("scores the control fixture", () => {
    expect(scoreDeck(controlFixture, { archetypeOverride: "control" })).toMatchSnapshot();
  });

  it("scores the combo fixture", () => {
    expect(scoreDeck(comboFixture, { archetypeOverride: "combo" })).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Run the snapshot test to verify it fails**

Run:

```bash
cd server && npm test -- src/analyzer/scorer/report-snapshots.test.ts
```

Expected: FAIL because the fixture modules do not exist yet.

- [ ] **Step 3: Create the representative resolved-deck fixtures**

Create `server/src/analyzer/scorer/fixtures/aggro-voltron.resolved.ts`:

```ts
import type { Card, ResolvedDeck } from "../../../types.js";

function makeCard(name: string, overrides: Partial<Card> = {}): Card {
  return {
    id: name,
    uniqueCardId: `${name}-oracle`,
    scryfall_id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-sf`,
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
    color_identity: ["W"],
    rarity: "common",
    prices: {},
    ...overrides,
  };
}

function land(name: string): Card {
  return makeCard(name, { cmc: 0, type: "Land", type_line: "Basic Land — Plains", oracle_text: "{T}: Add {W}." });
}

export const aggroVoltronFixture: ResolvedDeck = {
  commander: [makeCard("Commander", { cmc: 3, type: "Creature", type_line: "Legendary Creature", color_identity: ["W", "R"] })],
  mainboard: [
    { card: land("Plains"), qty: 35 },
    { card: makeCard("Sol Ring", { cmc: 1, type: "Artifact", type_line: "Artifact", oracle_text: "{T}: Add {C}{C}." }), qty: 1 },
    { card: makeCard("Blackblade Reforged", { cmc: 2, type: "Artifact", type_line: "Legendary Artifact — Equipment", oracle_text: "Equipped creature gets +1/+1 for each land you control." }), qty: 1 },
    { card: makeCard("Swords to Plowshares", { cmc: 1, type: "Instant", type_line: "Instant", oracle_text: "Exile target creature. Its controller gains life equal to its power." }), qty: 1 },
  ],
  unresolved: [],
  ownedMap: new Map(),
};
```

Create `server/src/analyzer/scorer/fixtures/control.resolved.ts`:

```ts
import type { Card, ResolvedDeck } from "../../../types.js";

function makeCard(name: string, overrides: Partial<Card> = {}): Card {
  return {
    id: name,
    uniqueCardId: `${name}-oracle`,
    scryfall_id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-sf`,
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
    color_identity: ["U"],
    rarity: "common",
    prices: {},
    ...overrides,
  };
}

function land(name: string): Card {
  return makeCard(name, { cmc: 0, type: "Land", type_line: "Basic Land — Island", oracle_text: "{T}: Add {U}." });
}

export const controlFixture: ResolvedDeck = {
  commander: [makeCard("Commander", { cmc: 5, type: "Creature", type_line: "Legendary Creature", color_identity: ["U", "W"] })],
  mainboard: [
    { card: land("Island"), qty: 35 },
    { card: makeCard("Counterspell", { cmc: 2, oracle_text: "Counter target spell." }), qty: 1 },
    { card: makeCard("Force of Will", { cmc: 5, oracle_text: "You may pay 1 life and exile a blue card from your hand rather than pay this spell's mana cost. Counter target spell." }), qty: 1 },
    { card: makeCard("Wrath of God", { cmc: 4, type: "Sorcery", type_line: "Sorcery", oracle_text: "Destroy all creatures. They can't be regenerated." }), qty: 1 },
    { card: makeCard("Rule of Law", { cmc: 3, type: "Enchantment", type_line: "Enchantment", oracle_text: "Each player can't cast more than one spell each turn." }), qty: 1 },
  ],
  unresolved: [],
  ownedMap: new Map(),
};
```

Create `server/src/analyzer/scorer/fixtures/combo.resolved.ts`:

```ts
import type { Card, ResolvedDeck } from "../../../types.js";

function makeCard(name: string, overrides: Partial<Card> = {}): Card {
  return {
    id: name,
    uniqueCardId: `${name}-oracle`,
    scryfall_id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-sf`,
    set: "set",
    set_name: "Set",
    name,
    cn: "1",
    layout: "normal",
    cmc: 2,
    type: "Sorcery",
    type_line: "Sorcery",
    oracle_text: "",
    mana_cost: "{2}",
    colors: [],
    color_identity: ["B", "U"],
    rarity: "common",
    prices: {},
    ...overrides,
  };
}

function land(name: string): Card {
  return makeCard(name, { cmc: 0, type: "Land", type_line: "Basic Land — Swamp", oracle_text: "{T}: Add {B}." });
}

export const comboFixture: ResolvedDeck = {
  commander: [makeCard("Commander", { cmc: 3, type: "Creature", type_line: "Legendary Creature", color_identity: ["U", "B"] })],
  mainboard: [
    { card: land("Swamp"), qty: 35 },
    { card: makeCard("Mana Vault", { cmc: 1, type: "Artifact", type_line: "Artifact", oracle_text: "{T}: Add {C}{C}{C}." }), qty: 1 },
    { card: makeCard("Demonic Tutor", { cmc: 2, oracle_text: "Search your library for a card, put that card into your hand, then shuffle." }), qty: 1 },
    { card: makeCard("Craterhoof Behemoth", { cmc: 8, type: "Creature", type_line: "Creature — Beast", oracle_text: "When Craterhoof Behemoth enters, creatures you control gain trample and get +X/+X until end of turn, where X is the number of creatures you control." }), qty: 1 },
  ],
  unresolved: [],
  ownedMap: new Map(),
};
```

- [ ] **Step 4: Run the snapshot test to generate and verify snapshots**

Run:

```bash
cd server && npm test -- src/analyzer/scorer/report-snapshots.test.ts
```

Expected: PASS and snapshot file created.

- [ ] **Step 5: Pause for Dele to commit**

Stop and present:
- Files changed:
  - `server/src/analyzer/scorer/fixtures/aggro-voltron.resolved.ts`
  - `server/src/analyzer/scorer/fixtures/control.resolved.ts`
  - `server/src/analyzer/scorer/fixtures/combo.resolved.ts`
  - `server/src/analyzer/scorer/report-snapshots.test.ts`
  - generated snapshot file(s)
- Suggested message: `test(analyzer): add crispi report fixtures and snapshots`

Wait for Dele before starting Task 5.

---

## Task 5 — Final verification sweep for full-spec Speed

**Files:**
- Possibly modify: `server/src/analyzer/scorer/index.test.ts`
- Verify only otherwise

- [ ] **Step 1: Update the top-level scorer test if needed**

If `server/src/analyzer/scorer/index.test.ts` still expects only the Speed MVP keys, replace the Speed expectation with:

```ts
    expect(report.axes.speed.subMetrics.map((m) => m.key)).toEqual([
      "mana.fast",
      "mana.earlyRamp",
      "curve.avgCMC",
      "curve.lowDrops",
      "threat.density",
      "wincon.turnEstimate",
      "tutor.speed",
    ]);
```

- [ ] **Step 2: Run the focused scorer-index test**

Run:

```bash
cd server && npm test -- src/analyzer/scorer/index.test.ts
```

Expected: PASS.

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

If you want a manual sanity check, start the built server and POST a resolved-deck JSON body to `/api/deck/score` containing cards such as `Sol Ring`, `Demonic Tutor`, `Craterhoof Behemoth`, and one or two cheap low-drop cards.

Expected: HTTP 200 with:
- `axes.speed.subMetrics` containing all 7 Speed keys
- `overall === round((consistency + resilience + interaction + speed) / 4)`
- no Speed MVP-only deferred note on the Speed axis

- [ ] **Step 6: Pause for Dele to commit**

Stop and present:
- Files changed:
  - all Speed full-spec files from Tasks 1–4
  - `server/src/analyzer/scorer/index.test.ts` if updated
- Suggested message: `feat(crispi): finish backend speed full-spec slice`

Wait for Dele.

---

## Self-review checklist

- [ ] `tagCard()` remains the shared analyzer tag entrypoint
- [ ] Speed MVP behavior is preserved and extended, not replaced haphazardly
- [ ] `threat.density` stays conservative and prefers false negatives
- [ ] `wincon.turnEstimate` remains explicit about being heuristic
- [ ] `tutor.speed` stays lightweight and does not over-model fetched-card identity
- [ ] Speed heuristic constants are centralized in one module
- [ ] representative full-report snapshots exist for heuristic-review coverage
- [ ] the old Speed MVP-only deferred note is removed
- [ ] `scoreDeck()` still has real `Consistency` + `Resilience` + `Interaction` + `Speed`
- [ ] `overall` remains the mean of all four axes
- [ ] No route contract changes
- [ ] No new dependencies and no client changes

---

## Execution handoff

Recommended execution mode for this plan: **Inline Execution** via `superpowers:executing-plans`, because the full-spec Speed fields, constants, and snapshot tests build directly on the current Speed MVP files and follow the same checkpoint pattern as the recent CRISPI slices.
