# Phase 1.E — CRISPI Backend Interaction MVP Slice Design

**Date:** 2026-05-13  
**Status:** Draft for review  
**Project:** `Lorevault`  
**Scope:** Backend only

## Summary

Add the third real CRISPI backend axis: **Interaction**.

This slice is intentionally an **MVP subset** of the full Interaction spec. It makes `axes.interaction` real in the backend analyzer while keeping `Speed` stubbed. The slice preserves the existing `POST /api/deck/score` contract and follows the same architecture used for the Consistency and Resilience slices: focused tag helpers behind `tagCard()`, then a dedicated scorer wired into `scoreDeck()`.

## Goals

1. Make `axes.interaction` real in the backend analyzer.
2. Preserve the current `/api/deck/score` request/response contract.
3. Reuse the existing analyzer structure and scoring style.
4. Deliver a conservative, testable MVP that is useful now without trying to finish the full Interaction spec in one pass.
5. Leave clear, explicit notes that the long-term target remains the **full Interaction spec**.

## Non-goals

This MVP slice does **not** implement:

- `interaction.instantSpeed`
- `interaction.free`
- `interaction.stax`
- politics / pillowfort interaction modeling
- targeted hand disruption modeling
- any client work
- any route changes
- any `Speed` axis work

## Explicit future intent

This slice is **not** the final Interaction implementation.

The intended follow-up is a later **full-spec Interaction slice** that adds:

- `interaction.instantSpeed`
- `interaction.free`
- `interaction.stax`
- any additional spec-aligned refinements needed to match the Phase 1 analyzer design

The implementation and tests in this MVP should be written so those future additions can be layered in without changing the public scoring route.

## Scope for this MVP

### Real in this slice

- `removal.spot`
- `removal.boardwipe`
- `counterspells.count`
- `interaction.coverage`

### Still deferred after this slice

- `interaction.instantSpeed`
- `interaction.free`
- `interaction.stax`
- `speed` axis entirely

## Architecture

The public analyzer flow remains:

```text
ResolvedDeck
  -> detectArchetype()
  -> tagCard(card)
  -> scoreConsistency(deck, archetype)
  -> scoreResilience(deck, archetype)
  -> scoreInteraction(deck, archetype)
  -> CrispiReport
```

Internally, add a focused interaction tag helper behind the existing `tagCard()` entrypoint.

### Proposed module shape

```text
server/src/analyzer/
├─ tags/
│  ├─ index.ts
│  ├─ index.test.ts
│  ├─ resilience.ts
│  ├─ resilience.test.ts
│  ├─ interaction.ts          # new MVP interaction helper
│  └─ interaction.test.ts     # new helper tests
└─ scorer/
   ├─ consistency.ts
   ├─ resilience.ts
   ├─ interaction.ts          # new MVP interaction axis scorer
   ├─ interaction.test.ts
   ├─ index.ts                # wire real interaction axis
   └─ index.test.ts           # update top-level contract tests
```

## Data model updates

Extend `CardTags` with interaction-facing fields that fit the current numeric tag pattern.

### Proposed additions to `CardTags`

```ts
interface CardTags {
  isLand: boolean
  rampScore: number
  drawScore: number
  tutorScore: number
  recursionScore: number
  protectionPermanentScore: number
  protectionSpellScore: number
  boardwipeSurvivalScore: number
  graveyardRelianceScore: number

  removalSpotScore: number
  removalBoardwipeScore: number
  counterspellScore: number
  interactionCoverage: {
    creature: boolean
    artifact: boolean
    enchantment: boolean
    planeswalker: boolean
    land: boolean
  }

  reasons: string[]
}
```

Numeric scores match the current analyzer style. Coverage stays boolean-per-type so the scorer can compute deck-level threat-type coverage cleanly.

## Tagging heuristics

Heuristics must remain deterministic and conservative. Prefer false negatives over false positives.

### 1. `removalSpotScore`

Represents single-target or narrowly targeted answers.

Count positively when oracle text clearly removes, destroys, exiles, bounces, or otherwise neutralizes one or more opposing permanents.

Examples that should score:
- `Swords to Plowshares`
- `Beast Within`
- `Generous Gift`
- `Anguished Unmaking`
- `Return to Dust` (conservative handling if wording is clearly targeted)

Conservative rules:
- narrow single-type removal scores lower
- flexible catch-all/modal removal scores higher
- self-sacrifice or self-bounce cards that do not answer opponents' threats do not count

### 2. `removalBoardwipeScore`

Represents sweepers that answer broad boards.

Count positively when oracle text clearly destroys, exiles, bounces, or sweeps multiple permanents broadly enough to function as a board wipe.

Examples that should score:
- `Wrath of God`
- `Damnation`
- `Farewell`
- `Cyclonic Rift` overload text

Conservative rules:
- only broad sweepers count
- small-damage or conditional mini-sweepers should be excluded unless the wording is clearly board-wide and reliable

### 3. `counterspellScore`

Represents counterspells for the Interaction axis.

Count positively when oracle text clearly counters spells.

Examples that should score:
- `Counterspell`
- `Swan Song`
- `Arcane Denial`
- `Negate`

Conservative rules:
- broad hard counters score highest
- soft or conditional counters score lower
- very narrow counters score lower still

### 4. `interactionCoverage`

Tracks what permanent types a card can answer.

Coverage types for this slice:
- creature
- artifact
- enchantment
- planeswalker
- land

Examples:
- `Swords to Plowshares` -> creature
- `Naturalize` -> artifact + enchantment
- `Beast Within` -> creature + artifact + enchantment + planeswalker + land
- `Wrath of God` -> creature
- `Farewell` -> creature + artifact + enchantment

Conservative rules:
- only count types clearly answerable from oracle text
- do not infer implied coverage from vague wording
- count board wipes toward coverage for the permanent types they clearly hit

## Counterspell rule for this MVP

For this slice, **counterspells count in Interaction** via `counterspells.count`.

Do **not** modify the existing Resilience behavior in this slice. The recent Resilience MVP explicitly excluded counterspells from `protection.spells`, and that behavior should remain unchanged unless a future follow-up deliberately revisits cross-axis double-counting.

## Interaction scoring model

`scoreInteraction(deck, archetype)` returns a normal `AxisReport`.

### Sub-metrics implemented now

| Key | Label | Raw measurement | Weight |
|---|---|---|---|
| `removal.spot` | Spot removal | summed `removalSpotScore` across deck | 0.35 |
| `removal.boardwipe` | Board wipes | summed `removalBoardwipeScore` across deck | 0.20 |
| `counterspells.count` | Counterspells | summed `counterspellScore` across deck | 0.20 |
| `interaction.coverage` | Threat-type coverage | covered permanent types / 5, using step scoring | 0.25 |

Weights total 1.00 for the MVP.

## Archetype targets for this MVP

Use the full-spec target table where it applies cleanly to the implemented metrics.

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

## Scoring behavior

### Count-based metrics

For `removal.spot`, `removal.boardwipe`, and `counterspells.count`, reuse the existing piecewise/clamped scoring style already used in the current analyzer:

- `raw = 0` -> `0`
- `raw < min` -> scale toward `60`
- `min..ideal` -> scale `60..100`
- `ideal..max` -> `100`
- `raw > max` -> mild efficiency decay

### Coverage metric

Use the declared step-function behavior from the full analyzer spec:

- `5/5 -> 100`
- `4/5 -> 80`
- `3/5 -> 55`
- `2/5 -> 25`
- `<=1/5 -> 0`

The `raw` coverage value for reporting should be the number of covered permanent types from `0..5`.

## Evidence generation

Emit `CardEvidence` in the same style as the existing axes.

Examples:
- `Swords to Plowshares` -> `removal.spot`
- `Wrath of God` -> `removal.boardwipe`
- `Counterspell` -> `counterspells.count`
- `Beast Within` -> `interaction.coverage`

Evidence reasons should stay short and stable, for example:
- `interaction: spot removal`
- `interaction: board wipe`
- `interaction: counterspell`
- `interaction: coverage against creature`
- `interaction: coverage against artifact`

## Notes generation

Add notes when important targets are missed, for example:
- `Spot removal is below the control minimum target.`
- `Board wipe density is below the midrange/goodstuff minimum target.`
- `Counterspell density is below the combo minimum target.`
- `Threat-type coverage is below the archetype minimum target.`
- `Instant-speed interaction, free interaction, and stax remain deferred in this MVP slice.`

That final note is intentional so the report explains why Interaction is real but still incomplete relative to the long-term spec.

## Testing strategy

### Tag-level tests

Add focused interaction tag tests that verify:

1. targeted creature removal is detected
2. modal catch-all removal is detected and covers multiple permanent types
3. board wipes are detected
4. counterspells are detected with conservative weighting distinctions where practical
5. interaction coverage is tracked by permanent type
6. non-interaction utility cards do not falsely score as removal or counters

### Shared `tagCard()` tests

Update `server/src/analyzer/tags/index.test.ts` to verify the new interaction fields are composed into `tagCard()` output.

### Scorer-level tests

Add `server/src/analyzer/scorer/interaction.test.ts` to verify:

1. expected sub-metric keys are returned
2. stronger interaction decks score above weaker ones
3. evidence includes representative spot removal, board wipe, counterspell, and coverage cards
4. coverage scoring reflects the expected step behavior
5. returned grade stays within the shared analyzer grade set
6. notes mention deferred MVP omissions where expected

### Top-level scorer tests

Update `server/src/analyzer/scorer/index.test.ts` so it verifies:

- `Consistency` remains real
- `Resilience` remains real
- `Interaction` is now real
- `Speed` remains stubbed
- `overall === round((consistency + resilience + interaction) / 4)` while `speed` stays at zero

## File plan

Expected files to modify/create:

- Modify: `server/src/analyzer/types.ts`
- Create: `server/src/analyzer/tags/interaction.ts`
- Create: `server/src/analyzer/tags/interaction.test.ts`
- Modify: `server/src/analyzer/tags/index.ts`
- Modify: `server/src/analyzer/tags/index.test.ts`
- Create: `server/src/analyzer/scorer/interaction.ts`
- Create: `server/src/analyzer/scorer/interaction.test.ts`
- Modify: `server/src/analyzer/scorer/index.ts`
- Modify: `server/src/analyzer/scorer/index.test.ts`

No route changes are required for this slice unless a bug is discovered.

## Risks and limits

1. **Regex fragility** — removal text varies a lot; conservative matching is safer.
2. **Coverage ambiguity** — some modal text is broad but not universal; the helper should only count explicit permanent types.
3. **Counterspell weighting nuance** — hard vs soft vs narrow counters should stay simple in the MVP.
4. **Incomplete axis by design** — Interaction will be useful but intentionally not full-spec yet.
5. **Cross-axis future work** — full-spec counterspell double-counting with Resilience is explicitly deferred, not forgotten.

## Rollout result

After this slice, backend CRISPI coverage becomes:

- `Consistency`: real
- `Resilience`: real
- `Interaction`: real (MVP subset)
- `Speed`: stubbed

That should be enough to continue backend-first iteration while making explicit that Interaction still has a planned full-spec follow-up.

## Self-review

- No placeholders remain.
- Scope is focused to one backend slice.
- The MVP/full-spec boundary is explicit.
- Counterspells are intentionally counted in Interaction without changing current Resilience behavior.
- Route contract remains unchanged.
- No client work or new dependencies are included.
