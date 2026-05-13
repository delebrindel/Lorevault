# Phase 1.G — CRISPI Backend Speed MVP Slice Design

**Date:** 2026-05-13  
**Status:** Draft for review  
**Project:** `Lorevault`  
**Scope:** Backend only

## Summary

Add the fourth real CRISPI backend axis: **Speed**.

This slice is intentionally a **Speed MVP**, not the full final Speed implementation. It makes `axes.speed` real in the backend analyzer using a helper-based speed tagging approach and a dedicated `scoreSpeed()` scorer while preserving the current `POST /api/deck/score` contract.

The MVP implements the lowest-risk Speed metrics first:

- `mana.fast`
- `mana.earlyRamp`
- `curve.avgCMC`
- `curve.lowDrops`

It explicitly defers the riskiest heuristics for the later extension slice:

- `threat.density`
- `wincon.turnEstimate`
- `tutor.speed`

## Goals

1. Make `axes.speed` real in the backend analyzer.
2. Preserve the current `/api/deck/score` request/response contract.
3. Reuse the current analyzer structure and scoring style.
4. Add a small dedicated speed tag helper rather than burying Speed heuristics inside the scorer.
5. Keep the MVP conservative and explainable so Speed becomes useful without over-claiming precision.

## Non-goals

This MVP slice does **not** implement:

- `threat.density`
- `wincon.turnEstimate`
- `tutor.speed`
- client/UI work
- route changes
- Monte Carlo / simulation-based speed modeling
- commander-cost cheating models
- power-level sliders
- any changes to existing Consistency / Resilience / Interaction semantics

## Explicit future intent

This slice is **not** the final Speed implementation.

The intended follow-up is a later **Speed extension slice** that adds:

- `threat.density`
- `wincon.turnEstimate`
- `tutor.speed`

The MVP should be implemented so those future additions can layer on cleanly without changing the public scoring route.

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

Internally, add a focused speed tag helper behind `tagCard()`.

### Proposed module shape

```text
server/src/analyzer/
├─ tags/
│  ├─ index.ts
│  ├─ index.test.ts
│  ├─ resilience.ts
│  ├─ interaction.ts
│  ├─ speed.ts              # new MVP speed helper
│  └─ speed.test.ts         # new helper tests
└─ scorer/
   ├─ consistency.ts
   ├─ resilience.ts
   ├─ interaction.ts
   ├─ speed.ts              # new MVP speed scorer
   ├─ speed.test.ts
   ├─ index.ts              # wire real speed axis
   └─ index.test.ts         # update top-level contract tests
```

## Data model updates

Extend `CardTags` with only the fields needed for the Speed MVP helper.

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

  reasons: string[]
}
```

### Field intent

- `fastManaTierScore`: numeric contribution from the explicit fast-mana allowlist/tier table.
- `earlyRampScore`: ramp pieces with effective CMC `<= 2` for the Speed axis.
- `lowDropSpeedScore`: nonland, low-MV cards with CMC `<= 2`, excluding pure ramp-only pieces where practical.

`curve.avgCMC` should stay scorer-driven from the actual deck contents rather than becoming a per-card tag.

## Speed MVP metrics

### 1. `mana.fast`

**Definition:** presence and quality of explicit fast-mana cards from the agreed tier list.

This metric should use a small **name-based allowlist** for this MVP rather than attempting generic oracle-text detection.

#### Fast-mana tiers for this slice

- **S tier**: `Sol Ring`, `Mana Crypt`, `Jeweled Lotus`, `Mana Vault`
- **A tier**: `Chrome Mox`, `Mox Diamond`, `Lotus Petal`, `Ancient Tomb`
- **B tier**: `Grim Monolith`, `City of Traitors`, `Mox Opal`, `Mox Amber`

#### Raw scoring behavior

Use the master spec’s tier score rule:

- `S × 40`
- `A × 20`
- `B × 10`
- cap at `100`

This is a sub-metric where the raw value can already be interpreted as the score input.

#### Archetype targets

Use the master spec fast-mana target bands:

- aggro/voltron: `30 / 50 / 75`
- midrange/goodstuff: `25 / 40 / 60`
- control: `20 / 35 / 55`
- combo: `50 / 70 / 90`
- aristocrats/sacrifice: `25 / 40 / 60`
- spellslinger: `25 / 40 / 60`
- tokens/go-wide: `25 / 40 / 60`
- reanimator/graveyard: `35 / 55 / 75`
- lands/landfall: `20 / 35 / 55`

### 2. `mana.earlyRamp`

**Definition:** ramp pieces with effective CMC `<= 2`.

This is distinct from Consistency’s broader ramp quantity model. Same cards may count in both axes; that overlap is intentional and already justified in the master spec.

#### Conservative rules

Count positively when a card already qualifies as ramp and:
- `cmc <= 2`, or
- it is a zero-cost fast mana piece on the explicit allowlist

Examples that should count:
- `Sol Ring`
- `Arcane Signet`
- `Nature's Lore`
- `Farseek`
- mana dorks at MV 1

#### Archetype targets

Use the master spec early-ramp targets:

- aggro/voltron: `6 / 9 / 12`
- midrange/goodstuff: `5 / 8 / 11`
- control: `4 / 7 / 10`
- combo: `7 / 10 / 14`
- aristocrats/sacrifice: `5 / 8 / 11`
- spellslinger: `4 / 7 / 10`
- tokens/go-wide: `5 / 8 / 11`
- reanimator/graveyard: `6 / 9 / 12`
- lands/landfall: `5 / 8 / 11`

### 3. `curve.avgCMC`

**Definition:** mean mana value of nonland cards, scored relative to the archetype’s preferred curve band.

#### Archetype target bands

Use the master spec ranges:

- aggro/voltron: `2.4–2.8`
- midrange/goodstuff: `3.0–3.4`
- control: `2.8–3.2`
- combo: `2.4–2.9`
- aristocrats/sacrifice: `2.6–3.0`
- spellslinger: `2.4–2.8`
- tokens/go-wide: `2.8–3.2`
- reanimator/graveyard: `2.8–3.2`
- lands/landfall: `2.6–3.0`

#### Scoring behavior

Use archetype-relative scoring in the style of the master spec:

- midpoint = center of the target band
- score declines as average CMC moves away from that midpoint
- clamp to `0..100`

The exact formula should stay simple and transparent for the MVP.

### 4. `curve.lowDrops`

**Definition:** density of nonland cards with CMC `<= 2`, excluding pure ramp-only pieces where practical.

This metric is meant to capture a generally low curve, not just ramp density.

#### Conservative rules

Count nonland cards with `cmc <= 2`, but avoid double-crediting obvious pure ramp rocks/dorks when the card is clearly there only for mana acceleration.

A practical MVP rule is:
- if `cmc <= 2`
- and not a land
- and `fastManaTierScore === 0`
- and not an obvious dedicated ramp-only card already captured primarily by early ramp

Examples that should count:
- cheap creatures
- cheap interaction spells
- cheap setup pieces

Examples that should usually not count:
- `Sol Ring`
- `Arcane Signet`
- pure mana dorks used only as ramp signals

#### Archetype targets

Use the master spec low-drop targets:

- aggro/voltron: `18 / 24 / 30`
- midrange/goodstuff: `12 / 16 / 22`
- control: `14 / 18 / 24`
- combo: `14 / 18 / 24`
- aristocrats/sacrifice: `16 / 20 / 26`
- spellslinger: `18 / 24 / 30`
- tokens/go-wide: `12 / 16 / 22`
- reanimator/graveyard: `16 / 20 / 26`
- lands/landfall: `12 / 16 / 22`

## Speed MVP scoring model

`scoreSpeed(deck, archetype)` returns a normal `AxisReport`.

### Sub-metrics implemented now

| Key | Label | Raw measurement | Weight |
|---|---|---|---|
| `mana.fast` | Fast mana | tier-scored fast-mana total | 0.30 |
| `mana.earlyRamp` | Early ramp density | summed early-ramp count | 0.25 |
| `curve.avgCMC` | Average mana value | archetype-relative curve score | 0.25 |
| `curve.lowDrops` | Low-drop density | counted low-drop total | 0.20 |

Weights total `1.00` for the MVP.

### Why these weights

This MVP intentionally leans toward the safest measurable speed signals:
- fast mana
- early deployment ramp
- archetype curve fit
- cheap-card density

The later Speed extension slice can rebalance toward threats and win-turn heuristics once those are implemented.

## Tagging heuristics

### `tags/speed.ts`

Implement a focused helper that:

1. checks a fast-mana allowlist by card name
2. detects early ramp using existing ramp semantics plus `cmc <= 2`
3. detects low-drop speed cards conservatively using `cmc <= 2` and exclusions for obvious pure-ramp pieces

#### Why helper-based instead of scorer-driven-only

- keeps fast-mana logic out of the scorer
- makes evidence reasons stable per card
- aligns with the tag-helper pattern already used for Resilience and Interaction

#### Expected stable reasons

Examples:
- `speed: fast mana`
- `speed: early ramp`
- `speed: low drop`

## Evidence generation

The Speed scorer should emit `CardEvidence` entries in the same style as the other axes.

Examples:
- `Sol Ring` -> `mana.fast`
- `Arcane Signet` -> `mana.earlyRamp`
- `Esper Sentinel` -> `curve.lowDrops`

`curve.avgCMC` is a deck-level derived metric, so it may have few or no direct per-card evidence items. That is acceptable as long as the sub-metric itself is transparent about the raw average.

## Notes generation

Expected notes include:
- `Fast mana is below the combo minimum target.`
- `Early ramp density is below the midrange/goodstuff minimum target.`
- `Average mana value is outside the control target band.`
- `Low-drop density is below the aggro/voltron minimum target.`
- `Threat density, win-turn estimate, and tutor-speed remain deferred in this Speed MVP slice.`

That final note is intentional so the report explains that Speed is real but still incomplete relative to the later extension slice.

## Testing strategy

### Tag-level tests

Add focused Speed tag tests that verify:

1. explicit fast-mana cards are detected by the allowlist/tier table
2. early ramp pieces are detected at CMC `<= 2`
3. low-drop non-ramp cards are detected
4. obvious pure-ramp cards do not double-count as low-drop speed cards where excluded
5. non-speed utility cards do not falsely count as fast mana

### Shared `tagCard()` tests

Update `server/src/analyzer/tags/index.test.ts` to verify the new Speed fields are composed into `tagCard()` output.

### Scorer-level tests

Add `server/src/analyzer/scorer/speed.test.ts` to verify:

1. expected Speed sub-metric keys are returned
2. stronger speed decks score above weaker ones
3. fast mana contributes strongly to the score
4. average CMC scoring is archetype-relative and stays within the shared grade model
5. notes mention deferred MVP omissions where expected

### Top-level scorer tests

Update `server/src/analyzer/scorer/index.test.ts` so it verifies:
- all four CRISPI axes are now real
- `overall === round((consistency + resilience + interaction + speed) / 4)`

## File plan

Expected files to modify/create:

- Modify: `server/src/analyzer/types.ts`
- Create: `server/src/analyzer/tags/speed.ts`
- Create: `server/src/analyzer/tags/speed.test.ts`
- Modify: `server/src/analyzer/tags/index.ts`
- Modify: `server/src/analyzer/tags/index.test.ts`
- Create: `server/src/analyzer/scorer/speed.ts`
- Create: `server/src/analyzer/scorer/speed.test.ts`
- Modify: `server/src/analyzer/scorer/index.ts`
- Modify: `server/src/analyzer/scorer/index.test.ts`

No route changes are required.

## Risks and limits

1. **Allowlist maintenance** — fast mana is intentionally name-based for safety, but the list is opinionated.
2. **Low-drop exclusions** — distinguishing cheap setup pieces from pure ramp is heuristic.
3. **Curve simplicity** — average CMC alone does not capture true deck speed, but is acceptable in the MVP.
4. **No win-turn estimate** — Speed will be useful but still incomplete.
5. **Cross-axis overlap** — early ramp overlaps Consistency by design and should remain explicit, not hidden.

## Rollout result

After this slice, backend CRISPI coverage becomes:

- `Consistency`: real
- `Resilience`: real
- `Interaction`: real
- `Speed`: real (MVP subset)

That leaves a clean next step: the Speed extension slice.

## Self-review

- No placeholders remain.
- Scope is focused to one backend slice.
- The MVP/full-extension boundary is explicit.
- Helper-based Speed tagging is explicit.
- Route contract remains unchanged.
- No client work or new dependencies are included.
