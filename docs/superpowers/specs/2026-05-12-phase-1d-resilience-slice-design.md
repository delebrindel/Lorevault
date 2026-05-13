# Phase 1.D — CRISPI Backend Resilience Slice Design

**Date:** 2026-05-12  
**Status:** Draft for review  
**Project:** `Lorevault`  
**Scope:** Backend only

## Summary

Add the second real CRISPI backend axis: **Resilience**. This slice extends the existing analyzer backend so `scoreDeck()` returns a real `axes.resilience` report while keeping `Interaction` and `Speed` stubbed.

The slice stays backend-only and preserves the current route contract at `POST /api/deck/score`. It introduces focused resilience-tagging helpers behind the existing `tagCard()` entrypoint, then adds a `scoreResilience()` scorer that uses conservative, testable heuristics.

## Goals

1. Make `axes.resilience` real in the backend analyzer.
2. Keep the current `/api/deck/score` request/response contract unchanged.
3. Reuse the current analyzer structure rather than adding a new route or parallel scoring path.
4. Keep heuristics conservative and explainable through `subMetrics`, `evidence`, and `notes`.
5. Stay backend-only: no client changes, no new dependencies.

## Non-goals

This slice does **not** implement:

- `Interaction`
- `Speed`
- `commander.protection`
- `redundancy.engine`
- graveyard-hate mitigation / anti-hate protection tags
- counterspells as resilience contributions
- scorer result caching
- tag memoization
- UI wiring or visualization work

## Design decisions confirmed in discussion

### Scope choice
Implement the middle-path resilience slice with these real sub-metrics:

- `recursion.count`
- `protection.permanents`
- `protection.spells`
- `boardwipe.survivability`
- `graveyard.exposure`

Keep these deferred/stubbed:

- `commander.protection`
- `redundancy.engine`

### Counterspell rule
For this slice, **counterspells do not count toward `protection.spells`**. They remain deferred to the later Interaction slice.

### Graveyard exposure rule
`graveyard.exposure` uses a **simple flat penalty** once graveyard reliance crosses a threshold. There is no mitigation model in this slice.

### Internal structure choice
Use **focused helper-based resilience tagging** behind `tagCard()` rather than putting all resilience logic directly in the scorer and rather than bloating a single monolithic tag file.

## Architecture

The public analyzer flow remains:

```text
ResolvedDeck
  -> detectArchetype()
  -> tagCard(card)
  -> scoreConsistency(deck, archetype)
  -> scoreResilience(deck, archetype)
  -> CrispiReport
```

Internally, the tag layer gains resilience-focused helpers while preserving the existing `tagCard()` entrypoint.

### Proposed module shape

```text
server/src/analyzer/
├─ tags/
│  ├─ index.ts               # tagCard(card): CardTags
│  ├─ index.test.ts          # existing consistency-oriented tests + any shared tag tests
│  ├─ resilience.ts          # resilience helper detection
│  └─ resilience.test.ts     # recursion/protection/wipe/graveyard reliance tests
└─ scorer/
   ├─ consistency.ts         # existing real axis
   ├─ consistency.test.ts
   ├─ resilience.ts          # new real resilience axis
   ├─ resilience.test.ts
   ├─ index.ts               # scoreDeck(): now wires consistency + resilience
   └─ index.test.ts          # top-level report contract tests
```

## Data model updates

The existing `CardTags` type in `server/src/analyzer/types.ts` is currently consistency-only. This slice extends it with resilience-facing fields.

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

  reasons: string[]
}
```

These remain numeric so the scorer can weight effects conservatively without needing a more complex evidence model.

## Tagging heuristics

All heuristics in this slice must remain deterministic and conservative. If the text is ambiguous, the tagger should prefer false negatives over false positives.

### 1. `recursionScore`

Represents recovery / rebuy effects.

Count positively when oracle text clearly:

- returns a card or permanent from graveyard to hand
- returns a card or permanent from graveyard to battlefield
- recurs itself from the graveyard
- repeatedly rebuys permanents or spells from graveyard

Examples that should score:

- `Sun Titan`
- `Eternal Witness`
- `Reanimate`
- `Victimize`
- `Regrowth`
- permanents with self-recursion language

Conservative rule:
- broad direct recursion to battlefield scores higher than hand-only rebuy
- one-shot rebuy scores lower than repeatable recursion

### 2. `protectionPermanentScore`

Represents resilient board pieces or permanent-based protection.

Count positively when a permanent clearly grants or carries:

- hexproof
- indestructible
- shroud
- ward
- phasing
- regenerate

This includes:

- protective equipment
- protective auras
- permanents that sacrifice to protect the board
- permanents that make the board survive removal

Examples that should score:

- `Darksteel Plate`
- `Lightning Greaves`
- `Swiftfoot Boots`
- `Selfless Spirit`

### 3. `protectionSpellScore`

Represents **non-counter** protective spells only.

Count positively when an instant or sorcery clearly protects your board or key permanents, for example by granting:

- indestructible
- hexproof
- phasing out
- regeneration / shield-like survival language
- prevention of mass destruction in a clearly defensive way

Examples that should score:

- `Heroic Intervention`
- `Teferi's Protection`
- `Tamiyo's Safekeeping`

Do **not** count counterspells here.

### 4. `boardwipeSurvivalScore`

Represents the deck's ability to preserve material through sweepers.

Count positively when a card clearly:

- survives most board wipes on its own
- protects multiple permanents from destruction/exile-based sweepers
- can be sacrificed or activated to save the board
- makes the deck materially recover from a wipe immediately

Examples that should score:

- `Selfless Spirit`
- `Heroic Intervention`
- `Teferi's Protection`
- durable indestructible protective permanents

This score is intentionally heuristic, not a literal percentage-of-board simulator.

### 5. `graveyardRelianceScore`

Represents how much the deck exposes itself to graveyard hate.

Count positively when a card clearly:

- reanimates from graveyard
- depends on cards being in graveyard
- repeatedly uses the graveyard as a core resource

Examples:

- `Reanimate`
- `Animate Dead`
- `Victimize`
- strong recursion engines

Simple rule for this slice:
- more graveyard-reliant cards = more exposure
- no mitigation offsets are modeled yet

## Resilience scoring model

`scoreResilience(deck, archetype)` returns a normal `AxisReport`.

### Sub-metrics implemented now

| Key | Label | Raw measurement | Weight |
|---|---|---|---|
| `recursion.count` | Recursion / rebuy | summed `recursionScore` across deck | 0.25 |
| `protection.permanents` | Permanent protection | summed `protectionPermanentScore` across deck | 0.20 |
| `protection.spells` | Protective spells | summed `protectionSpellScore` across deck | 0.15 |
| `boardwipe.survivability` | Wipe survival | summed `boardwipeSurvivalScore` across deck | 0.25 |
| `graveyard.exposure` | Graveyard exposure penalty | high score when reliance is low, lower score when reliance crosses threshold | 0.15 |

Weights intentionally total 1.00 for a clean first slice.

### Archetype targets

Use the full-spec resilience target table where it maps cleanly to this slice:

| Archetype | Recursion | Permanent prot. | Spell prot. | Wipe-surv. % |
|---|---|---|---|---|
| aggro/voltron | 2 / 4 / 7 | 4 / 6 / 9 | 1 / 3 / 5 | 8 / 15 / 25 |
| midrange/goodstuff | 3 / 5 / 8 | 2 / 4 / 6 | 2 / 4 / 6 | 10 / 18 / 28 |
| control | 2 / 4 / 6 | 2 / 4 / 6 | 4 / 7 / 12 | 12 / 20 / 30 |
| combo | 2 / 4 / 6 | 2 / 4 / 6 | 4 / 8 / 14 | 5 / 12 / 22 |
| aristocrats/sacrifice | 4 / 7 / 11 | 2 / 4 / 6 | 1 / 3 / 5 | 15 / 25 / 35 |
| spellslinger | 2 / 4 / 6 | 1 / 3 / 5 | 3 / 6 / 10 | 5 / 10 / 18 |
| tokens/go-wide | 2 / 4 / 7 | 2 / 4 / 6 | 1 / 3 / 5 | 8 / 15 / 25 |
| reanimator/graveyard | 6 / 10 / 14 | 2 / 4 / 6 | 2 / 4 / 6 | 10 / 18 / 28 |
| lands/landfall | 3 / 5 / 8 | 1 / 3 / 5 | 2 / 4 / 6 | 12 / 22 / 32 |

### Scoring curve

Reuse the same piecewise/clamped style as the current consistency scorer:

- `raw = 0` => `0`
- `raw < min` => scales up toward `60`
- `min..ideal` => scales from `60..100`
- `ideal..max` => `100`
- `raw > max` => mild efficiency decay

This keeps scoring behavior consistent across implemented axes.

### Graveyard exposure behavior

Unlike the full design spec's conditional-inverted model, this slice uses a simpler backend-safe rule:

- compute total `graveyardRelianceScore`
- if reliance is **below threshold**, `graveyard.exposure` receives a full/high score
- if reliance is **above threshold**, `graveyard.exposure` receives a fixed penalty-shaped lower score

This is intentionally simple and explainable. It does not attempt to model hate resilience.

## Evidence generation

The resilience scorer emits `CardEvidence` entries using the same style as consistency.

Examples:

- `Sun Titan` -> `recursion.count`
- `Eternal Witness` -> `recursion.count`
- `Lightning Greaves` -> `protection.permanents`
- `Darksteel Plate` -> `protection.permanents`
- `Heroic Intervention` -> `protection.spells`
- `Selfless Spirit` -> `boardwipe.survivability`
- `Reanimate` -> `graveyard.exposure` (negative pressure / reliance evidence)

Evidence reasons should stay short and use stable prefixes, e.g.:

- `recursion: battlefield rebuy`
- `protection: permanent-based protection`
- `protection: spell-based protection`
- `survival: wipe protection`
- `graveyard: reliance on graveyard resource`

## Notes generation

The resilience axis should add notes when it undershoots important targets, for example:

- `Recursion is below the control minimum target.`
- `Permanent-based protection is below the voltron minimum target.`
- `Protective spell density is below the combo minimum target.`
- `Boardwipe survivability is below the midrange/goodstuff minimum target.`
- `This deck shows meaningful graveyard reliance and may be exposed to graveyard hate.`

## Testing strategy

### Tag-level tests

Add focused resilience tag tests that verify:

1. recursion cards are detected
2. protective permanents are detected
3. non-counter protective spells are detected
4. wipe-survival cards are detected
5. graveyard-reliant cards contribute reliance
6. counterspells do **not** count as `protection.spells`

### Scorer-level tests

Add `server/src/analyzer/scorer/resilience.test.ts` to verify:

1. expected sub-metric keys are returned
2. stronger resilience deck scores above weaker resilience deck
3. evidence contains representative cards
4. graveyard-heavy deck is penalized by `graveyard.exposure`
5. returned grade stays within the shared analyzer grade set

### Top-level scorer tests

Update `server/src/analyzer/scorer/index.test.ts` so it verifies:

- `axes.consistency` remains real
- `axes.resilience` is now real
- `axes.interaction` and `axes.speed` remain stubbed
- `overall === round((consistency.score + resilience.score) / 4)`

## File plan

Expected files to modify/create:

- Modify: `server/src/analyzer/types.ts`
- Modify: `server/src/analyzer/tags/index.ts`
- Modify: `server/src/analyzer/tags/index.test.ts`
- Create: `server/src/analyzer/tags/resilience.ts`
- Create: `server/src/analyzer/tags/resilience.test.ts`
- Create: `server/src/analyzer/scorer/resilience.ts`
- Create: `server/src/analyzer/scorer/resilience.test.ts`
- Modify: `server/src/analyzer/scorer/index.ts`
- Modify: `server/src/analyzer/scorer/index.test.ts`

No route changes are required for this slice unless a bug is discovered during implementation.

## Risks and limits

1. **Regex fragility** — resilience text is varied; conservative matching is safer than over-tagging.
2. **Overlap between sub-metrics** — one card may contribute to both permanent protection and wipe survivability. This is acceptable if evidence is explicit.
3. **Simple graveyard penalty** — this intentionally under-models nuanced graveyard decks, but keeps the slice understandable.
4. **No engine redundancy yet** — some resilient archetypes will still under-score until the later slice adds redundancy logic.
5. **No commander-specific protection model** — decks centered on commander recast resilience remain partially under-modeled.

## Rollout result

After this slice, backend CRISPI coverage becomes:

- `Consistency`: real
- `Resilience`: real
- `Interaction`: stubbed
- `Speed`: stubbed

That is enough to continue backend-first iteration without changing the client contract.

## Self-review

- No placeholders remain.
- Scope is limited to a single backend slice.
- Counterspells are explicitly excluded from resilience for this slice.
- Graveyard exposure behavior is explicitly simplified from the larger analyzer spec.
- Route contract remains unchanged.
