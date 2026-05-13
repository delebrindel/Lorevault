# Phase 1.F — CRISPI Backend Interaction Full-Spec Completion Design

**Date:** 2026-05-13  
**Status:** Draft for review  
**Project:** `Lorevault`  
**Scope:** Backend only

## Summary

Complete the backend `Interaction` axis by adding the three deferred Interaction metrics on top of the existing MVP implementation:

- `interaction.instantSpeed`
- `interaction.free`
- `interaction.stax`

This slice keeps the current `POST /api/deck/score` contract unchanged, preserves the existing Interaction MVP metrics, and leaves current `Resilience` behavior unchanged. After this slice, `Consistency`, `Resilience`, and `Interaction` are all real backend axes, while `Speed` remains stubbed for the next slice.

## Goals

1. Complete the backend Interaction axis to the planned Phase 1 full-spec level.
2. Preserve the existing `/api/deck/score` request/response contract.
3. Reuse the current analyzer architecture: focused tag helpers behind `tagCard()`, then a dedicated scorer wired into `scoreDeck()`.
4. Add the new metrics conservatively and transparently with explicit `subMetrics`, `evidence`, and `notes`.
5. Keep the already-shipped Interaction MVP behavior stable while layering in the deferred metrics.

## Non-goals

This slice does **not** implement:

- any `Speed` axis work
- politics / pillowfort interaction modeling
- targeted hand disruption modeling
- route changes
- client/UI work
- analyzer snapshot infrastructure
- changing the current Resilience implementation
- counterspells contributing back into `Resilience.protection.spells`

## Explicit behavior guardrail

This slice intentionally **does not reopen Resilience**.

The full analyzer master spec discusses counterspells as a possible cross-axis double-count with Resilience, but this slice does **not** change that. Counterspells remain part of `Interaction` only for now. Any future cross-axis adjustment must be a separate, explicit follow-up.

## Current baseline

Already implemented in the backend:

- `removal.spot`
- `removal.boardwipe`
- `counterspells.count`
- `interaction.coverage`

Still deferred and added in this slice:

- `interaction.instantSpeed`
- `interaction.free`
- `interaction.stax`

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

Internally, extend the existing Interaction helper and scorer rather than introducing new public entrypoints.

### Proposed module shape

```text
server/src/analyzer/
├─ tags/
│  ├─ index.ts
│  ├─ index.test.ts
│  ├─ resilience.ts
│  ├─ resilience.test.ts
│  ├─ interaction.ts        # extend existing helper
│  └─ interaction.test.ts   # extend helper tests
└─ scorer/
   ├─ consistency.ts
   ├─ resilience.ts
   ├─ interaction.ts        # extend existing scorer
   ├─ interaction.test.ts   # extend scorer tests
   ├─ index.ts
   └─ index.test.ts         # update top-level contract tests if needed
```

## Data model updates

Extend `CardTags` with only the additional fields needed for the deferred Interaction metrics.

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

  reasons: string[]
}
```

### Field intent

- `interactionInstantSpeed`: per-card participation weight used in the numerator/denominator calculation for the deck-level instant-speed ratio.
- `interactionFreeScore`: numeric signal for clearly free or alternate-cost interaction.
- `interactionStaxScore`: numeric signal for resource denial / tax / lock interaction pieces.

## Interaction metrics added in this slice

### 1. `interaction.instantSpeed`

**Definition:** proportion of the deck’s interaction that can be used at instant speed or effectively on opponents’ turns.

This is a **ratio metric**, not a raw count.

#### Raw calculation

- Denominator: total interaction cards that contribute to the axis overall
  - spot removal
  - board wipes
  - counterspells
  - free interaction
  - stax pieces only if they are instant-speed or flash-applicable (rare; be conservative)
- Numerator: interaction cards that are clearly usable at instant speed
  - `type_line` includes `Instant`
  - `oracle_text` or structure clearly indicates `Flash`
  - clearly reactive free interaction usable in response windows

#### Scoring behavior

Use an archetype-relative target table based on the existing master spec percentages:

- aggro/voltron: `20 / 35 / 50`
- midrange/goodstuff: `30 / 45 / 60`
- control: `55 / 70 / 85`
- combo: `50 / 65 / 80`
- aristocrats/sacrifice: `30 / 45 / 60`
- spellslinger: `50 / 65 / 80`
- tokens/go-wide: `25 / 40 / 55`
- reanimator/graveyard: `35 / 50 / 65`
- lands/landfall: `30 / 45 / 60`

The `raw` field reported in the sub-metric should be the percentage `0..100`, rounded to a sensible integer.

#### Conservative rules

- `Instant` counts.
- `Flash` counts.
- Sorceries do not count.
- Permanents count only if there is clear flash / opponents’ turn usability.
- Do not infer “playable later” as instant-speed.

### 2. `interaction.free`

**Definition:** interaction that can be cast or used for zero effective mana via explicit alternate-cost language.

Examples that should count:
- `Force of Will`
- `Fierce Guardianship`
- `Pact of Negation`
- `Deflecting Swat`

#### Detection rules

Count only obvious alternate-cost interaction text such as:
- `without paying its mana cost`
- `pay 0`
- `you may exile a ... card from your hand rather than pay`
- explicit commander-control alternate cost patterns when the card is still clearly interaction

#### Scoring behavior

Use the full-spec archetype targets:

- aggro/voltron: `0 / 1 / 3`
- midrange/goodstuff: `0 / 2 / 4`
- control: `2 / 4 / 7`
- combo: `2 / 4 / 7`
- aristocrats/sacrifice: `0 / 1 / 3`
- spellslinger: `1 / 3 / 5`
- tokens/go-wide: `0 / 1 / 3`
- reanimator/graveyard: `1 / 2 / 5`
- lands/landfall: `0 / 1 / 3`

Use the same piecewise/clamped scoring style already used by the analyzer.

### 3. `interaction.stax`

**Definition:** interaction that constrains opponents’ resources, actions, tutoring, or casting patterns through tax / denial / rule-setting effects.

Examples that should count:
- `Rule of Law`
- `Drannith Magistrate`
- `Aven Mindcensor`
- `Stasis`

#### Detection rules

Only count clearly disruptive tax/denial/lock language. Prefer false negatives.

Patterns to count conservatively include effects that:
- limit spells per turn
- prevent casting from certain zones
- restrict searching libraries
- tax spell casting or attacks in a clearly disruptive way
- deny untapping or create obvious lock pressure

#### Scoring behavior

This sub-metric exists in the full analyzer spec with a low weight because raw counts understate actual impact. For this slice, keep the scoring conservative and count-based rather than trying to simulate lock severity.

Recommended archetype targets for the slice:

- aggro/voltron: `0 / 0 / 2`
- midrange/goodstuff: `0 / 1 / 3`
- control: `1 / 2 / 4`
- combo: `0 / 1 / 3`
- aristocrats/sacrifice: `0 / 0 / 2`
- spellslinger: `0 / 1 / 3`
- tokens/go-wide: `0 / 0 / 2`
- reanimator/graveyard: `0 / 0 / 2`
- lands/landfall: `0 / 1 / 3`

This is a practical slice-level target table, not a claim that stax is perfectly modeled by counts.

## Updated full Interaction scoring model

After this slice, `scoreInteraction(deck, archetype)` should return these sub-metrics:

| Key | Label | Raw measurement | Weight |
|---|---|---|---|
| `removal.spot` | Spot removal | summed `removalSpotScore` | 0.25 |
| `removal.boardwipe` | Board wipes | summed `removalBoardwipeScore` | 0.15 |
| `counterspells.count` | Counterspells | summed `counterspellScore` | 0.15 |
| `interaction.instantSpeed` | Instant-speed ratio | deck-level ratio, reported as percentage | 0.15 |
| `interaction.free` | Free interaction | summed `interactionFreeScore` | 0.10 |
| `interaction.stax` | Stax / denial | summed `interactionStaxScore` | 0.05 |
| `interaction.coverage` | Threat-type coverage | covered permanent types / 5 | 0.15 |

These weights match the master analyzer spec and total `1.00`.

## Tagging heuristics

### Extend `tags/interaction.ts`

Keep the current helper behavior for MVP fields unchanged, then add:

#### `interactionInstantSpeed`

Mark positive when a card is itself interaction and is clearly available at instant speed:
- `Instant` interaction -> positive
- permanents/spells with `Flash` that also carry interaction effects -> positive
- do not mark static stax permanents as instant-speed just because they affect opponents later

#### `interactionFreeScore`

Mark positive only for clearly free interaction. Do not count generic cost reducers or cards that merely become cheaper under board state unless the card text explicitly gives the alternate cost.

#### `interactionStaxScore`

Mark positive only for explicit tax/denial/lock pieces. Prefer a narrow regex set and stable evidence reasons.

## Evidence generation

Continue using short, stable reasons. New reasons should be added in the same style as existing axes.

Examples:
- `interaction: instant-speed interaction`
- `interaction: free interaction`
- `interaction: stax piece`

The scorer should emit evidence entries for:
- cards contributing to the ratio numerator for `interaction.instantSpeed`
- cards contributing to `interaction.free`
- cards contributing to `interaction.stax`

For the ratio metric, evidence should still be per-card and transparent even though the final sub-metric is a deck-level percentage.

## Notes generation

Expected notes include:
- `Instant-speed interaction is below the control minimum target.`
- `Free interaction density is below the combo minimum target.`
- `Stax / denial density is below the control minimum target.`

Remove the current MVP-only deferred note once these metrics are implemented.

## Testing strategy

### Tag-level tests

Extend `server/src/analyzer/tags/interaction.test.ts` to verify:

1. instant-speed interaction is detected for instants
2. flash interaction is detected conservatively
3. explicit free interaction is detected
4. explicit stax / denial cards are detected
5. non-interaction free-cast text does not falsely count
6. non-stax utility permanents do not falsely count as stax

### Shared `tagCard()` tests

Extend `server/src/analyzer/tags/index.test.ts` to verify the new interaction fields are composed into `tagCard()` output while preserving current Resilience behavior.

### Scorer-level tests

Extend `server/src/analyzer/scorer/interaction.test.ts` to verify:

1. all seven Interaction sub-metric keys are returned
2. stronger full-spec interaction decks score above weaker ones
3. `interaction.instantSpeed` uses ratio behavior rather than raw count behavior
4. `interaction.free` recognizes clearly free interaction cards
5. `interaction.stax` recognizes obvious denial pieces
6. the old MVP-only deferred note is gone
7. returned grade stays within the shared analyzer grade set

### Top-level scorer tests

Update `server/src/analyzer/scorer/index.test.ts` if needed so it verifies:
- `Consistency` remains real
- `Resilience` remains real
- `Interaction` is fully real for Phase 1 scope
- `Speed` remains stubbed
- `overall === round((consistency + resilience + interaction) / 4)` while `speed` stays zero

## File plan

Expected files to modify:

- Modify: `server/src/analyzer/types.ts`
- Modify: `server/src/analyzer/tags/interaction.ts`
- Modify: `server/src/analyzer/tags/interaction.test.ts`
- Modify: `server/src/analyzer/tags/index.ts`
- Modify: `server/src/analyzer/tags/index.test.ts`
- Modify: `server/src/analyzer/scorer/interaction.ts`
- Modify: `server/src/analyzer/scorer/interaction.test.ts`
- Possibly modify: `server/src/analyzer/scorer/index.test.ts`

No route changes are required.

## Risks and limits

1. **Regex fragility** — free-cast and stax text are easy to over-match.
2. **Ratio pitfalls** — `interaction.instantSpeed` must use a clear denominator or scores become noisy.
3. **Stax under-modeling** — counts still understate lock-piece impact, but that is acceptable for this slice.
4. **Cross-axis temptation** — do not let this slice silently alter Resilience semantics.
5. **Evidence duplication** — ratio and per-card evidence can be noisy if emitted carelessly.

## Rollout result

After this slice, backend CRISPI coverage becomes:

- `Consistency`: real
- `Resilience`: real
- `Interaction`: real, full-spec for Phase 1 backend scope
- `Speed`: stubbed

That leaves a clean next step: the Speed slice.

## Self-review

- No placeholders remain.
- Scope is focused to one backend slice.
- The current Resilience behavior is explicitly preserved.
- The three deferred Interaction metrics are clearly defined.
- Route contract remains unchanged.
- No client work or new dependencies are included.
