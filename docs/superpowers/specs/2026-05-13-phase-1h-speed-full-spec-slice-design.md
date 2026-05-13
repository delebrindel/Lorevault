# Phase 1.H — CRISPI Backend Speed Full-Spec Completion Design

**Date:** 2026-05-13  
**Status:** Draft for review  
**Project:** `Lorevault`  
**Scope:** Backend only

## Summary

Complete the backend `Speed` axis by adding the three deferred Speed metrics on top of the existing MVP implementation:

- `threat.density`
- `wincon.turnEstimate`
- `tutor.speed`

This slice also includes two scoring-hardening extras:

1. a small set of representative deck fixture snapshots for full `CrispiReport` outputs
2. centralized Speed heuristic constants / allowlists so the most subjective Speed rules live in one place

The slice keeps the current `POST /api/deck/score` contract unchanged. After this work, all four CRISPI axes are real in the backend at the planned Phase 1 scope.

## Goals

1. Complete the backend `Speed` axis to the planned Phase 1 full-spec level.
2. Preserve the existing `/api/deck/score` request/response contract.
3. Reuse the current analyzer architecture: focused tag helpers behind `tagCard()`, then a dedicated scorer wired into `scoreDeck()`.
4. Add the deferred Speed metrics conservatively and transparently with explicit `subMetrics`, `evidence`, and `notes`.
5. Harden heuristic evolution with fixture snapshots and centralized constants so future tuning is reviewable and safer.

## Non-goals

This slice does **not** implement:

- route changes
- client/UI work
- corpus or gap-analysis work
- upgrade-engine work
- archetype detector overhaul
- power-level sliders
- Monte Carlo / simulation-based speed modeling
- broad analyzer refactors unrelated to Speed completion and the agreed hardening

## Current baseline

Already implemented in the backend Speed MVP:

- `mana.fast`
- `mana.earlyRamp`
- `curve.avgCMC`
- `curve.lowDrops`

Still deferred and added in this slice:

- `threat.density`
- `wincon.turnEstimate`
- `tutor.speed`

## Architecture

The public analyzer flow remains:

```text
ResolvedDeck
  -> detectArchetype()
  -> tagCard(card)
  -> scoreConsistency(deck, archetype)
  -> scoreResilience(deck, archetype)
  -> scoreInteraction(deck, archetype)
  -> scoreSpeed(deck, archetype)
  -> CrispiReport
```

Internally, extend the existing Speed helper and scorer rather than introducing new public entrypoints.

### Proposed module shape

```text
server/src/analyzer/
├─ tags/
│  ├─ index.ts
│  ├─ index.test.ts
│  ├─ speed.ts                 # extend existing helper
│  └─ speed.test.ts            # extend helper tests
├─ scorer/
│  ├─ speed.ts                 # extend existing scorer
│  ├─ speed.test.ts            # extend scorer tests
│  ├─ speed.constants.ts       # new centralized Speed heuristics/constants
│  ├─ fixtures/                # small resolved-deck fixtures for snapshots
│  └─ snapshots/ or inline snapshots in tests
└─ ...
```

The exact fixture location can follow the repo’s current test conventions, but the fixture and snapshot logic should live close to the scorer tests.

## Hardening extras included in this slice

### 1. Full-report fixture snapshots

Add a small number of representative resolved-deck fixtures and snapshot full `CrispiReport` outputs.

Recommended fixture set:
- a fast aggro/voltron deck shell
- a slower control shell
- a combo-leaning shell
- one midrange shell

The goal is not corpus realism. The goal is stable review coverage for heuristic changes.

#### Why snapshots belong in this slice

Speed heuristics are the noisiest part of CRISPI so far:
- threat tagging is heuristic-heavy
- win-turn estimate is explicitly approximate
- tutor-speed inference can drift subtly

Snapshot diffs make that drift visible and reviewable.

### 2. Centralized Speed constants / allowlists

Move Speed-specific subjective heuristics into a small constants module.

Examples to centralize:
- threat keyword lists / threat multipliers
- tutor-speed weights
- archetype win-turn floors
- any Speed-specific magic numbers used by the scorer
- fast-mana tier constants if the current MVP slice still embeds them in logic that should now be shared

#### Why this belongs in the slice

It keeps the final Speed scorer readable and makes future tuning safer.

## Data model updates

Extend `CardTags` with only the additional fields needed for the deferred Speed metrics.

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
  interactionInstantSpeed: number
  interactionFreeScore: number
  interactionStaxScore: number
  fastManaTierScore: number
  earlyRampScore: number
  lowDropSpeedScore: number

  threatDensityScore: number
  tutorSpeedScore: number

  reasons: string[]
}
```

### Field intent

- `threatDensityScore`: conservative per-card signal for cards that materially contribute to closing the game or demand answers fast.
- `tutorSpeedScore`: per-card contribution for tutors that accelerate access to win pieces or fast mana.

`wincon.turnEstimate` should stay primarily scorer-driven from deck-level characteristics rather than becoming a pure per-card tag.

## Deferred Speed metrics added in this slice

### 1. `threat.density`

**Definition:** density of cards that materially pressure the table, represent credible closing speed, or force answers quickly.

This is the riskiest tag family in Speed, so the implementation must stay conservative.

#### What should count

Examples that should score:
- explicit large finishers
- commander-damage / voltron pressure pieces
- obvious must-answer engines that rapidly convert into wins or overwhelming advantage
- highly efficient payoff creatures/spells that materially shorten the clock

#### Conservative rules

Prefer false negatives.

A card should count only when it clearly looks like one of:
- finisher / lethal-pressure card
- must-answer threat
- commander-damage speed enabler

The first slice should avoid claiming that every generically strong value engine is a speed threat.

#### Raw scoring behavior

Use a simple count-based model first, with modest extra weight for cards that clearly look like immediate closing pressure.

The master spec says “immediate damage/lethal threats ×1.5.” That should remain the governing rule.

#### Archetype targets

Use the master spec threat targets:

- aggro/voltron: `8 / 12 / 16`
- midrange/goodstuff: `6 / 9 / 13`
- control: `3 / 5 / 8`
- combo: `2 / 4 / 7`
- aristocrats/sacrifice: `5 / 8 / 12`
- spellslinger: `4 / 7 / 11`
- tokens/go-wide: `6 / 9 / 13`
- reanimator/graveyard: `4 / 7 / 11`
- lands/landfall: `4 / 7 / 11`

### 2. `wincon.turnEstimate`

**Definition:** heuristic estimate of the deck’s credible goldfish turn.

This remains explicitly approximate and directional.

#### Slice behavior

Use a simplified version of the master spec idea:

- start from commander CMC and/or primary threat profile
- improve the estimate with fast mana / early ramp / low drops / tutor speed
- clamp to an archetype floor
- score the resulting turn against archetype expectations

#### Archetype floors / targets

Use the master spec turn bands:

- aggro/voltron: `T6 / T5 / T4`
- midrange/goodstuff: `T8 / T7 / T6`
- control: `T10 / T9 / T7`
- combo: `T6 / T5 / T3`
- aristocrats/sacrifice: `T8 / T7 / T5`
- spellslinger: `T8 / T7 / T5`
- tokens/go-wide: `T8 / T7 / T6`
- reanimator/graveyard: `T6 / T5 / T4`
- lands/landfall: `T9 / T8 / T6`

#### Transparency rule

The scorer must make it obvious this is heuristic. Notes and evidence should reflect that it is an estimate, not a simulation.

### 3. `tutor.speed`

**Definition:** tutors that accelerate speed by helping the deck find fast mana or win-pressure pieces earlier.

#### Conservative rules

Do not try to model exact fetched-card identity perfectly.

For this slice, a tutor should contribute when it is:
- broad enough to find speed-relevant pieces
- cheap enough to actually accelerate the deck’s plan

Broad cheap tutors should contribute more than slow expensive narrow tutors.

#### Scoring approach

Use a simple weighted contribution based on:
- tutor breadth
- tutor mana value
- whether it can plausibly find fast mana or threats

This should stay intentionally lighter-weight than the other Speed metrics.

## Updated full Speed scoring model

After this slice, `scoreSpeed(deck, archetype)` should return these sub-metrics:

| Key | Label | Raw measurement | Weight |
|---|---|---|---|
| `mana.fast` | Fast mana | tier-scored fast-mana total | 0.20 |
| `mana.earlyRamp` | Early ramp density | early-ramp count | 0.15 |
| `curve.avgCMC` | Average mana value | archetype-relative curve score | 0.15 |
| `curve.lowDrops` | Low-drop density | low-drop count | 0.10 |
| `threat.density` | Threat density | conservative weighted threat count | 0.20 |
| `wincon.turnEstimate` | Estimated goldfish turn | heuristic turn estimate scored vs archetype targets | 0.15 |
| `tutor.speed` | Tutor speed contribution | weighted tutor-speed contribution | 0.05 |

These weights match the master analyzer spec and total `1.00`.

## Tagging heuristics

### Extend `tags/speed.ts`

Keep the current helper behavior for MVP fields unchanged, then add:

#### `threatDensityScore`

Mark positive only for clearly speed-relevant threats.

Use centralized constant tables / keyword groups so the logic remains explicit and tunable.

Possible categories:
- `finisher`
- `must-answer`
- `commander-damage`

The first full-spec slice should keep this small and conservative.

#### `tutorSpeedScore`

Mark positive for tutors that plausibly accelerate the deck’s clock.

Use centralized weights for:
- broad tutor
- narrow tutor
- mana value adjustment
- explicit ability to find artifacts / creatures / any card

## Centralized constants module

Introduce a dedicated Speed constants module.

### Recommended contents

- fast-mana tiers
- threat keyword / name heuristics
- tutor-speed weights
- archetype win-turn floor/target table
- any shared score coefficients used only by Speed

### Design rule

The constants module should contain the most subjective and tunable values. The scorer should mostly orchestrate them, not bury them inline.

## Evidence generation

Continue using short, stable reasons.

Examples:
- `speed: fast mana`
- `speed: early ramp`
- `speed: low drop`
- `speed: threat density`
- `speed: tutor-speed contribution`
- `speed: win-turn estimate support`

For `wincon.turnEstimate`, evidence should remain explanatory rather than pretending to be exact card-level causality.

## Notes generation

Expected notes include:
- `Threat density is below the aggro/voltron minimum target.`
- `Estimated goldfish turn is slower than the combo target band.`
- `Tutor-speed contribution is below the spellslinger minimum target.`

The current MVP-only deferred note should be removed once these metrics are implemented.

## Fixture snapshot strategy

### Recommended fixture count

Add 3–4 representative resolved-deck fixtures, enough to capture meaningful heuristic variation without overbuilding.

### What to snapshot

Snapshot the full `CrispiReport`, not just the Speed axis.

Why:
- preserves transparency for full-report drift
- makes cross-axis side effects visible
- matches the master analyzer design’s stated review surface idea

### Review expectation

Heuristic changes are allowed to break snapshots. The diff is the review surface, not necessarily a bug.

## Testing strategy

### Tag-level tests

Extend `server/src/analyzer/tags/speed.test.ts` to verify:

1. explicit threats are detected conservatively
2. cheap broad tutors contribute to tutor-speed
3. obvious non-threat value cards do not falsely score as threats
4. obvious slow tutors score lower than cheap broad tutors

### Scorer-level tests

Extend `server/src/analyzer/scorer/speed.test.ts` to verify:

1. all seven Speed sub-metric keys are returned
2. stronger full-spec speed decks score above weaker ones
3. threat density contributes to score ordering
4. turn-estimate scoring differs across archetypes / deck profiles
5. tutor-speed contribution is recognized
6. the old MVP-only deferred note is gone
7. returned grade stays within the shared analyzer grade set

### Snapshot tests

Add fixture-driven tests that snapshot full `CrispiReport` outputs for the chosen representative decks.

### Top-level scorer tests

Update `server/src/analyzer/scorer/index.test.ts` if needed so it verifies all four axes remain real and the overall formula remains unchanged.

## File plan

Expected files to modify/create:

- Modify: `server/src/analyzer/types.ts`
- Modify: `server/src/analyzer/tags/speed.ts`
- Modify: `server/src/analyzer/tags/speed.test.ts`
- Modify: `server/src/analyzer/tags/index.ts`
- Modify: `server/src/analyzer/tags/index.test.ts`
- Create: `server/src/analyzer/scorer/speed.constants.ts`
- Modify: `server/src/analyzer/scorer/speed.ts`
- Modify: `server/src/analyzer/scorer/speed.test.ts`
- Create: Speed fixture files near scorer tests
- Create/modify: snapshot tests for full `CrispiReport`
- Possibly modify: `server/src/analyzer/scorer/index.test.ts`

No route changes are required.

## Risks and limits

1. **Threat tagging fragility** — this is the riskiest tag family in the analyzer.
2. **Turn-estimate subjectivity** — useful, but never truly predictive.
3. **Tutor-speed ambiguity** — tutors are easy to over-credit.
4. **Snapshot churn** — expected and acceptable, but needs disciplined review.
5. **Scope creep temptation** — avoid mixing in unrelated analyzer redesign while touching the speed layer.

## Rollout result

After this slice, backend CRISPI coverage becomes:

- `Consistency`: real
- `Resilience`: real
- `Interaction`: real
- `Speed`: real, full-spec for Phase 1 backend scope

That completes the backend CRISPI axis set for Phase 1.

## Self-review

- No placeholders remain.
- Scope is focused to one backend slice plus the two agreed hardening extras.
- The current Speed MVP behavior is preserved and extended rather than replaced arbitrarily.
- Fixture snapshots and centralized constants are explicit and scoped.
- Route contract remains unchanged.
- No client work or new dependencies are included.
