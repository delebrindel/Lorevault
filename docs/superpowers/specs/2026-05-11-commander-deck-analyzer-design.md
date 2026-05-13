# Commander Deck Analyzer — Design Spec

**Date:** 2026-05-11
**Status:** Approved design, ready for implementation planning
**Project:** `Lorevault`
**Owner:** Dele

## Summary

A Commander/EDH deck analyzer for **Lorevault** (Hono + Vue 3). Phase 1 ships a transparent, rules-based deck quality scorer (CRISPI: Consistency, Resilience, Interaction, Speed) with full per-card evidence drill-downs. Phases 2 and 3 (corpus-driven gap analysis, library-aware upgrade engine) are designed at high level only and stubbed behind interfaces so Phase 1 ships standalone.

The architecture is **hybrid (Approach C from brainstorming):** a rules-based tagging + scoring core for Phase 1, with corpus-derived calibration and embeddings reserved for later phases. Transparency is a first-class requirement — every score traces to specific cards.

## Phased rollout

| Phase | Scope | Blocking? |
|---|---|---|
| **1.0** | Sections 1–3, 6, 7. Sections 4 & 5 stubbed with null implementations. | None — fully shippable. |
| **1.5** | CRISPI-only upgrade mode (degraded Section 5): owned cards that might help low axes. | Phase 1.0 in production. |
| **2.0** | Section 4: corpus harvester, co-occurrence index, gap analysis. | Open questions in §4 (esp. Moxfield deck-search availability). |
| **3.0** | Section 5 full: corpus-driven upgrade engine. | Phase 2.0 complete. |

## Table of contents

1. Data Layer
2. Deck Input Layer
3. CRISPI Scorer
4. Corpus / Co-occurrence Index *(high-level only)*
5. Library-Aware Upgrade Engine *(high-level only)*
6. UI / Vue Client Design
7. Testing Strategy & Fixtures
8. Open Questions, Risks, Phased Rollout

---

## 1. Data Layer

**Key insight:** `server/src/types.ts` already defines a Scryfall-like `Card` shape used throughout the server. **Project-wide source-of-truth rule:** Moxfield is used for user-owned and deck-container data (collection sync, deck import), while **Scryfall is the canonical source for generic card lookup and card metadata normalization**. Owned cards may still arrive from Moxfield first, but analyzer-facing card resolution should converge on one canonical card-data source.

### Changes vs. existing

1. **Generalize the collection fetch.** The analyzer needs the entire owned set as a lookup, unfiltered, keyed by card name (printings collapse to one Oracle entry).
   - Extract a pure server-side service: `getOwnedLibrary(): Promise<OwnedLibrary>` where `OwnedLibrary = Map<cardName, OwnedCard>`.
   - Existing `POST /api/collection` is refactored to call this service and apply the color filter on top. No client breakage.

2. **Cache the library.** Moxfield is paginated (5000/page, up to 10 pages, ~50k cap) and slow. Collections change rarely.
   - In-memory cache on the server with a 10-minute default TTL and `?refresh=true` bust.
   - No disk persistence yet.

3. **No new npm dependencies.** External HTTP calls to **Scryfall** are allowed and are the preferred source for public card lookup and canonical card metadata. Scryfall is **not** required for owned-library pagination itself; that remains Moxfield-backed.

4. **New shared types** in `server/src/types.ts`:
   ```ts
   interface OwnedCard {
     name: string
     printings: CollectionItem[]
     totalQty: number
   }
   type OwnedLibrary = Map<string, OwnedCard>
   ```

### What does NOT change

- Existing `Card`, `CollectionItem`, `CollectionResponse` types.
- `MOXFIELD_TOKEN` stays server-only.
- Hono route structure (`server/src/routes/*.ts`).
- Vue 3 + Vite client conventions.

### Identity assumption

Card identity = **card name**. Moxfield's response shape we use does not expose Scryfall's `oracle_id`, and printings of the same Oracle card share a name. DFCs (`Front // Back`) and Alchemy (`A-Foo`) are treated as distinct cards because they are mechanically distinct.

---

## 2. Deck Input Layer

Two input paths feed one resolution pipeline.

### Inputs

1. **Moxfield deck URL or ID.** Paste `https://moxfield.com/decks/<id>` or just `<id>`. Server fetches via Moxfield's deck endpoint with the same Bearer token. *(Endpoint URL/shape to be verified at implementation time — see Q2.2.)*
2. **Manual decklist paste.** Textarea, one card per line: `1 Sol Ring`, `Sol Ring`, `1x Sol Ring`. Tolerates `// Commander` headers, `// Sideboard`/`Maybeboard` (ignored), blank lines.

Both paths normalize to:

```ts
interface ParsedDeck {
  source: 'moxfield' | 'manual'
  commander: string[]                              // 1, or 2 if partner/background
  mainboard: { name: string; qty: number }[]
  unresolved: string[]                             // names parser couldn't tokenize
}
```

### Card resolution pipeline

For each name in a `ParsedDeck`, resolve to a full `Card`:

1. **Owned-library lookup first** (free, in-memory `Map<name, OwnedCard>` from §1).
2. **Scryfall named lookup miss path:** use Scryfall as the public card resolver for non-owned cards. Prefer an exact/named lookup first; if needed, fall back to Scryfall's fuzzy name resolution. The result is mapped into the project's shared `Card` shape.
3. **Hard fail:** if both miss, the card lands in `ResolvedDeck.unresolved` and the UI shows it as a warning. The scorer runs on what resolved, with a clear "N/99 cards scored" disclosure.

The resolver is a single server-side service `resolveCard(name: string): Promise<Card | null>`. Lookup order is **owned library first, then Scryfall fallback**. The scorer never knows or cares where the data came from.

### New endpoints

- `POST /api/deck/parse` — body: `{ source: 'moxfield' | 'manual', payload: string }` → `ParsedDeck`. Pure parsing, no resolution. Cheap; safe to debounce-call on keystroke.
- `POST /api/deck/resolve` — body: `ParsedDeck` → `ResolvedDeck { commander: Card[], mainboard: { card: Card; qty: number }[], unresolved: string[], ownedMap: Map<scryfall_id, qty> }`.

Splitting parse from resolve keeps the parser fast and unit-testable, and lets the UI show parser errors before incurring Moxfield round-trips.

### Format scope

Format is **Commander/EDH only** for v1 (singleton, 100 cards, color identity rules). Other formats out of scope; the scorer's heuristics are EDH-tuned and would need separate calibration.

### What this does NOT do

- No deck editing in the app (Phase 3 territory).
- No deck saving server-side. Analysis is recomputed on each submit.
- No legality/banlist checking.
- No cross-provider reconciliation beyond the project's shared `Card` mapper. If Moxfield-owned data and Scryfall metadata differ slightly, the resolver's canonical normalized `Card` wins for analyzer/scoring purposes.

---

## 3. CRISPI Scorer

`CRISPI = (Consistency + Resilience + Interaction + Speed) / 4`. All four axes are scored 0–100, transparency-first: every number drills down to the cards that produced it.

### 3.0 Architecture frame

#### Scoring shape

```ts
interface CrispiReport {
  overall: number                    // 0–100, mean of 4 axes
  axes: {
    consistency: AxisReport
    resilience:  AxisReport
    interaction: AxisReport
    speed:       AxisReport
  }
  deckMeta: {
    commander: string[]
    archetype: Archetype
    colorIdentity: MtgColor[]
    cardCount: number
    unresolvedCount: number
  }
  generatedAt: string                // ISO timestamp
}

interface AxisReport {
  score: number                      // 0–100
  grade: 'F'|'D'|'C'|'B'|'A'|'S'
  subMetrics: SubMetric[]
  evidence: CardEvidence[]
  notes: string[]                    // human-readable callouts
}

interface SubMetric {
  key: string
  label: string
  raw: number
  target: { min: number; ideal: number; max: number }
  score: number                      // 0–100
  weight: number                     // contribution to axis score
  contributingCards: string[]
}

interface CardEvidence {
  card: string
  axis: 'C'|'R'|'I'|'S'
  subMetric: string
  contribution: number               // points this card pushed the axis
  reason: string
}
```

#### Tagging layer

Each card gets typed tags derived from `oracle_text` + `type_line` + `mana_cost`. Tags are computed **once per card**, cached by `scryfall_id`, then consumed by every axis. Pure functions, deterministic, testable.

Tag families: `ramp.*`, `draw.*`, `tutor.*`, `removal.*`, `interaction.counterspell`, `interaction.free`, `recursion.*`, `protection.*`, `threat.*`, `stax.*`, `commander.tax-mitigation`, `graveyard.hate.*`. Final per-axis lists in 3.1–3.4.

This is **Approach C (hybrid):** rules-based tags = the core; corpus calibration (Phase 2) refines per-archetype thresholds; embeddings reserved for cards the tagger can't classify (deferred).

#### Archetype detection

Input to the scorer, not an axis. v1 set:

`aggro/voltron`, `midrange/goodstuff`, `control`, `combo`, `aristocrats/sacrifice`, `spellslinger`, `tokens/go-wide`, `reanimator/graveyard`, `lands/landfall`.

Two signals:
1. **Commander hint table** (`commander-overrides.json`) — known commanders → default archetype.
2. **Tag-density heuristic** for unknown commanders.

Returns `{ archetype, confidence, reasons[] }`. UI exposes a manual override dropdown; override always wins.

#### Composition flow

```
ResolvedDeck
   ↓
detectArchetype()                                    → Archetype (+ user override)
   ↓
tagCard() per card, memoized by scryfall_id
   ↓
consistency.score / resilience.score /
interaction.score / speed.score                     (parallel; pure functions)
   ↓
CrispiReport { overall, axes, deckMeta, generatedAt }
```

All four axis scorers run independently. Cross-axis card double-counting is handled at the `CardEvidence` layer (one entry per axis per card), not by axes calling each other.

#### New endpoint

- `POST /api/deck/score` — body: `{ deck: ResolvedDeck, archetypeOverride?: Archetype }` → `CrispiReport`.

#### Caching

- **Tag results** cached in-memory by `scryfall_id` for server lifetime. ~30k Oracle cards × small struct = trivial RAM.
- **CrispiReport** cached by `hash(resolvedDeck + archetypeOverride)`, 5-min TTL.

#### Module layout

```
server/src/analyzer/
├─ tags/
│  ├─ index.ts              # tagCard(card): CardTags
│  ├─ ramp.ts
│  ├─ draw.ts
│  ├─ tutor.ts
│  ├─ removal.ts
│  ├─ counterspell.ts
│  ├─ recursion.ts
│  ├─ protection.ts
│  ├─ threat.ts
│  ├─ stax.ts
│  └─ data/
│     ├─ fast-mana-tiers.json
│     ├─ commander-overrides.json
│     └─ keyword-patterns.json
├─ archetype/
│  ├─ detect.ts
│  └─ thresholds.ts         # per-archetype target tables (3.1–3.4)
├─ scorer/
│  ├─ index.ts              # scoreDeck(resolvedDeck): CrispiReport
│  ├─ consistency.ts
│  ├─ resilience.ts
│  ├─ interaction.ts
│  ├─ speed.ts
│  └─ curves.ts             # piecewise scoring functions, shared
└─ types.ts                 # CrispiReport, AxisReport, SubMetric, CardEvidence, CardTags, Archetype
```

#### Out of scope for v1 of the scorer

- Mana-base quality beyond color sources (fetch density, dual-land tier, untapped ratio) — v1.1.
- Synergy/combo detection — corpus territory; Phase 2.
- Mulligan/opening-hand Monte Carlo — v2.

---

### 3.1 Consistency

**Definition.** How reliably the deck does its thing across many games. Will I hit my land drops? Will I see my engine? Is the hand keepable? Consistency is the *floor* of deck quality.

#### Sub-metrics

| Key | Label | Raw measurement | Weight |
|---|---|---|---|
| `ramp.count` | Ramp pieces | `ramp.land` ∪ `ramp.rock` ∪ `ramp.dork` ∪ `ramp.cost-reducer`, CMC ≤ 3 | 0.20 |
| `draw.density` | Card-draw density | `draw.cantrip` ∪ `draw.engine` ∪ `draw.wheel` (engines ×2) | 0.25 |
| `tutor.count` | Tutors | `tutor.*` (unconditional ×1.5, narrow ×1.0, land-only ×0.5) | 0.10 |
| `manabase.size` | Land count | `type_line` contains `Land` | 0.20 |
| `manabase.colorSources` | Color sources | Per color in identity: lands/rocks/dorks producing it. Score = min across colors / target | 0.15 |
| `curve.shape` | Mana curve health | Distribution of nonland CMC vs. archetype-expected curve; chi-square-like distance | 0.10 |

Sub-metric scores 0–100; axis score = weighted mean.

#### Targets per archetype

| Archetype | Lands | Ramp | Draw | Tutors | Avg CMC ideal |
|---|---|---|---|---|---|
| aggro/voltron | 34 / 36 / 38 | 8 / 10 / 12 | 8 / 10 / 13 | 0 / 2 / 5 | 2.6 |
| midrange | 36 / 38 / 40 | 10 / 12 / 14 | 10 / 12 / 15 | 2 / 4 / 7 | 3.2 |
| control | 36 / 38 / 41 | 8 / 10 / 12 | 12 / 15 / 18 | 3 / 5 / 8 | 3.0 |
| combo | 32 / 34 / 37 | 10 / 13 / 16 | 12 / 15 / 18 | 6 / 9 / 12 | 2.8 |
| aristocrats | 35 / 37 / 39 | 10 / 12 / 14 | 10 / 12 / 15 | 2 / 4 / 7 | 2.9 |
| spellslinger | 36 / 38 / 40 | 10 / 12 / 14 | 12 / 15 / 18 | 3 / 5 / 8 | 2.7 |
| tokens | 36 / 38 / 40 | 10 / 12 / 14 | 9 / 11 / 14 | 1 / 3 / 6 | 3.0 |
| reanimator | 35 / 37 / 39 | 9 / 11 / 13 | 10 / 13 / 16 | 4 / 6 / 9 | 3.0 |
| lands/landfall | 40 / 43 / 46 | 12 / 15 / 18 | 9 / 11 / 14 | 1 / 3 / 6 | 2.8 |

Color-source target per color in identity: `min 14 / ideal 18 / max 25` for 2-color, scaled `ideal ≈ 60 / numColors` for higher counts.

#### Scoring curve (piecewise, clamped 0–100)

```
score(raw, {min, ideal, max}) =
  if raw < min:           linear from 0 (raw=0) to 60 (raw=min)
  if min ≤ raw ≤ ideal:   linear from 60 to 100
  if ideal < raw ≤ max:   100 (flat)
  if raw > max:           linear decay from 100 (raw=max) to 60 (raw=max+50% headroom)
```

Undershooting punished hard; overshooting mildly punished (slot inefficiency). The 60-floor at `min` means hitting the minimum is a passing grade.

#### Tags consumed

`ramp.*`, `draw.*`, `tutor.*`. Plus structural reads: `type_line` (lands), `mana_cost` (CMC), `oracle_text` color-production regex (`Add {W/U/B/R/G}`, `Add one mana of any color`).

#### Known limitations

- **Quality vs. quantity.** 12 ramp at CMC 4 scores like 12 ramp at CMC 2 on `ramp.count`; `curve.shape` partially compensates.
- **Engine vs. cantrip** is fuzzy. Heuristic: `"draw a card"` + recurring trigger → engine. Edge cases visible in evidence panel.
- **Land tutors** (Three Visits, Cultivate) count as `ramp.land`, not `tutor.*` — by design; they function as ramp in EDH.
- **Companions/partners/backgrounds** counted as in-deck; access cost ignored. Refine later.
- **Mana base quality** beyond color counts deferred to v1.1.

---

### 3.2 Resilience

**Definition.** How well the deck recovers from disruption and survives the table's interaction. Resilience is the *ceiling-protector* — why a powerful deck doesn't fold to one Bojuka Bog.

#### Sub-metrics

| Key | Label | Raw measurement | Weight |
|---|---|---|---|
| `recursion.count` | Recursion / rebuy | `recursion.graveyard` ∪ `recursion.exile` ∪ `recursion.bounce-self` | 0.20 |
| `protection.permanents` | Permanent protection | Hexproof / indestructible / shroud / ward / phasing for your stuff (incl. equipment/auras) | 0.15 |
| `protection.spells` | Spell protection | Counterspells + Veil of Summer / Silence / Heroic Intervention / Dauntless Escort | 0.10 |
| `commander.protection` | Commander tax mitigation | Command Beacon-likes, cost-cheats, equipment that protects commander | 0.10 |
| `redundancy.engine` | Engine redundancy | For top 2 detected engine tags: copies/effects available | 0.20 |
| `graveyard.exposure` | Graveyard reliance penalty | If `recursion.count + reanimator > threshold`: how much graveyard hate the deck has (low score = high exposure) | 0.10 |
| `boardwipe.survivability` | Wipe survivability | % of nonland permanents that are indestructible / hexproof from sorceries / regenerate / recur themselves; plus Teferi's Protection-likes | 0.15 |

#### Targets per archetype

| Archetype | Recursion | Permanent prot. | Spell prot. | Engine redund. | Wipe-surv. % |
|---|---|---|---|---|---|
| aggro/voltron | 2 / 4 / 7 | 4 / 6 / 9 | 1 / 3 / 5 | 2 / 4 / 6 | 8 / 15 / 25 |
| midrange | 3 / 5 / 8 | 2 / 4 / 6 | 2 / 4 / 6 | 3 / 5 / 8 | 10 / 18 / 28 |
| control | 2 / 4 / 6 | 2 / 4 / 6 | 4 / 7 / 12 | 3 / 5 / 8 | 12 / 20 / 30 |
| combo | 2 / 4 / 6 | 2 / 4 / 6 | 4 / 8 / 14 | 4 / 6 / 9 | 5 / 12 / 22 |
| aristocrats | 4 / 7 / 11 | 2 / 4 / 6 | 1 / 3 / 5 | 5 / 8 / 12 | 15 / 25 / 35 |
| spellslinger | 2 / 4 / 6 | 1 / 3 / 5 | 3 / 6 / 10 | 3 / 5 / 8 | 5 / 10 / 18 |
| tokens | 2 / 4 / 7 | 2 / 4 / 6 | 1 / 3 / 5 | 4 / 6 / 9 | 8 / 15 / 25 |
| reanimator | 6 / 10 / 14 | 2 / 4 / 6 | 2 / 4 / 6 | 4 / 7 / 10 | 10 / 18 / 28 |
| lands/landfall | 3 / 5 / 8 | 1 / 3 / 5 | 2 / 4 / 6 | 3 / 5 / 8 | 12 / 22 / 32 |

Reanimator demands the highest recursion *and* triggers the graveyard-exposure penalty hardest with no hate-protection.

#### Scoring curve

Same piecewise as 3.1 with two axis-specific tweaks:

1. **`graveyard.exposure` is conditional-inverted.** Contributes only if `recursion.count > 8` or commander has `reanimator.*` flag. Below threshold: dropped from weighted mean, other weights re-normalize. Above threshold: `score = 100 - (reliance × exposure_factor)` clamped 0–100.
2. **`redundancy.engine` is multi-target.** Archetype detector identifies top 2 functional engines (e.g. for aristocrats: `sacrifice-outlet`, `death-trigger-payoff`). Sub-metric scores each separately, averages. Both weak → bad score even if one is strong.

#### Tags consumed

`recursion.*`, `protection.*` (`protection.hexproof`, `protection.indestructible`, `protection.shroud`, `protection.ward`, `protection.phasing`, `protection.regenerate`), `interaction.counterspell` (shared with §3.3), `equipment.protective`, `aura.protective`, `commander.tax-mitigation`, `graveyard.hate.protective` (Riftsweeper-likes that protect *against* exile). Structural reads of `type_line` for permanent counts.

#### Known limitations

- **Engine detection is fuzzy.** For ambiguous decks the report says "no clear engine detected" and weights redundancy lower instead of guessing.
- **Counterspells double-count** between `protection.spells` (here) and `counterspells.count` (§3.3). Intentional; documented in evidence.
- **Wipe-survival % treats all permanents equally.** CMC-weighted scoring is a v1.1 refinement.
- **No "rebuild speed" model.** Resilience measures *whether* you recover, not *how fast*.
- **Hand disruption** isn't covered; uncommon enough in EDH to defer.

---

### 3.3 Interaction

**Definition.** How well the deck affects opponents' game state. In multiplayer EDH this matters more than 1v1: you need flexible, repeatable answers to many threats from many angles.

#### Sub-metrics

| Key | Label | Raw measurement | Weight |
|---|---|---|---|
| `removal.spot` | Spot removal | `removal.spot.creature` ∪ `removal.spot.artifact` ∪ `removal.spot.enchantment` ∪ `removal.spot.planeswalker`. Modal/catch-all (Anguished Unmaking, Generous Gift) ×1.5 | 0.25 |
| `removal.boardwipe` | Board wipes | `removal.board-wipe` (sweepers hitting ≥2 permanent types) | 0.15 |
| `counterspells.count` | Counterspells | `interaction.counterspell`. Hard ×1.0, soft/conditional ×0.6, "counter target X" narrow ×0.4 | 0.15 |
| `interaction.instantSpeed` | Instant-speed ratio | (Instants + flash + opp-turn-usable activated) / total interaction. Score = ratio mapped to 0–100 | 0.15 |
| `interaction.free` | Free interaction | Alt-cost ≤ 0 mana on your turn or opp turn (Force of Will, Fierce Guardianship, Pact of Negation, Deflecting Swat) | 0.10 |
| `interaction.stax` | Stax / resource denial | `stax.tax` ∪ `stax.lock` ∪ `stax.denial` (Rule of Law, Stasis, Drannith Magistrate, Aven Mindcensor) | 0.05 |
| `interaction.coverage` | Threat-type coverage | Of 5 permanent types (creature, artifact, enchantment, planeswalker, land): how many can the deck answer? Score = covered/5 × 100 | 0.15 |

#### Targets per archetype

| Archetype | Spot | Wipes | Counters | Inst-speed % | Free | Coverage |
|---|---|---|---|---|---|---|
| aggro/voltron | 4 / 6 / 9 | 0 / 1 / 3 | 0 / 0 / 2 | 20 / 35 / 50 | 0 / 1 / 3 | 3 / 4 / 5 |
| midrange | 6 / 9 / 13 | 1 / 2 / 4 | 0 / 2 / 5 | 30 / 45 / 60 | 0 / 2 / 4 | 4 / 5 / 5 |
| control | 4 / 7 / 10 | 2 / 4 / 6 | 6 / 10 / 15 | 55 / 70 / 85 | 2 / 4 / 7 | 4 / 5 / 5 |
| combo | 3 / 5 / 8 | 1 / 2 / 4 | 4 / 8 / 13 | 50 / 65 / 80 | 2 / 4 / 7 | 3 / 4 / 5 |
| aristocrats | 4 / 7 / 10 | 1 / 3 / 5 | 0 / 2 / 5 | 30 / 45 / 60 | 0 / 1 / 3 | 4 / 5 / 5 |
| spellslinger | 4 / 7 / 10 | 1 / 3 / 5 | 4 / 7 / 12 | 50 / 65 / 80 | 1 / 3 / 5 | 3 / 4 / 5 |
| tokens | 4 / 6 / 9 | 0 / 1 / 3 | 0 / 1 / 4 | 25 / 40 / 55 | 0 / 1 / 3 | 3 / 4 / 5 |
| reanimator | 3 / 6 / 9 | 1 / 2 / 4 | 1 / 4 / 8 | 35 / 50 / 65 | 1 / 2 / 5 | 3 / 4 / 5 |
| lands/landfall | 4 / 7 / 10 | 1 / 3 / 5 | 1 / 3 / 6 | 30 / 45 / 60 | 0 / 1 / 3 | 4 / 5 / 5 |

Notes:
- Aggro/voltron has near-zero counter expectation (color identity often can't run them).
- Control's free-interaction ideal is highest — holding mana while developing requires it.
- Coverage's `ideal = 5/5` for most archetypes: missing answers to enchantments in EDH (Smothering Tithe, Rhystic Study) is near-fatal.

#### Scoring curves

Two axis-specific behaviors:

1. **`interaction.coverage` is a step function.** `5/5 → 100`, `4/5 → 80`, `3/5 → 55`, `2/5 → 25`, `≤1/5 → 0`. Coverage is binary per type; the cliff in scoring reflects that.
2. **`interaction.instantSpeed` is a ratio, not a count.** A deck with 3/4 instant interaction (75%) outscores 5/15 (33%) on this sub-metric, even though raw count is lower. Raw count already feeds `removal.spot` etc.

#### Tags consumed

`removal.spot.*`, `removal.board-wipe`, `interaction.counterspell` (shared with §3.2), `interaction.free` (alt-cost detector: oracle text matches `you may cast .* without paying`, `pay 0`, `exile a [color] card from your hand rather than pay`), `stax.*`, `interaction.land-disruption`. Structural reads: `type_line` for `Instant`, `oracle_text` for `Flash`.

#### Cross-axis double-counting (declared)

- **Counterspells** count toward Resilience (`protection.spells`) AND Interaction (`counterspells.count`). They genuinely serve both roles.
- **Modal removal** gets ×1.5 in `removal.spot` AND counts toward `interaction.coverage` for every type it can hit.

Evidence panel surfaces both contributions per card.

#### Known limitations

- **Stax is undervalued by counts.** One Winter Orb warps games more than five spot-removal spells. v1 doesn't model asymmetric impact; Phase 2 corpus can identify lock pieces empirically.
- **Free-cost detection is regex-fragile.** Daze and Misdirection match correctly; Snapcaster doesn't (correctly). Expect 1–2 false positives per deck.
- **Targeted hand attack** uncommon in EDH; not modeled.
- **Politics / pillowfort** (Propaganda, Ghostly Prison) not classed as Interaction here. Defer to v1.1.
- **Threat assessment is absent.** Static analyzer can't know which opponent threats deserve removal. Right scope.

---

### 3.4 Speed

**Definition.** How fast the deck can credibly threaten to win or close out a game. The *clock* axis. High Speed dictates pace; low Speed needs Interaction + Resilience to survive long enough to execute.

#### Sub-metrics

| Key | Label | Raw measurement | Weight |
|---|---|---|---|
| `mana.fast` | Fast mana | `ramp.fast` cards (Sol Ring, Mana Crypt, Vault, Jeweled Lotus, Chrome Mox, Mox Diamond, Lotus Petal, Grim Monolith, Ancient Tomb, City of Traitors). Tier-scored S/A/B | 0.20 |
| `mana.earlyRamp` | Early ramp density | Ramp pieces with effective CMC ≤ 2. Distinct from §3.1's `ramp.count` (CMC ≤ 3) | 0.15 |
| `curve.avgCMC` | Average mana value | Mean nonland CMC, archetype-relative | 0.15 |
| `curve.lowDrops` | Low-drop density | Nonland cards with CMC ≤ 2 (excluding pure ramp) | 0.10 |
| `threat.density` | Threat density | `threat.*` tagged cards. Immediate damage/lethal threats ×1.5 | 0.20 |
| `wincon.turnEstimate` | Estimated goldfish win turn | Heuristic; see scoring section | 0.15 |
| `tutor.speed` | Tutor speed contribution | Tutors finding wincons or fast mana, weighted by fetched CMC | 0.05 |

#### Targets per archetype

| Archetype | Fast-mana score | Early ramp ≤2 | Avg CMC | Low-drops | Threats | Goldfish T |
|---|---|---|---|---|---|---|
| aggro/voltron | 30 / 50 / 75 | 6 / 9 / 12 | 2.4–2.8 | 18 / 24 / 30 | 8 / 12 / 16 | T6 / T5 / T4 |
| midrange | 25 / 40 / 60 | 5 / 8 / 11 | 3.0–3.4 | 12 / 16 / 22 | 6 / 9 / 13 | T8 / T7 / T6 |
| control | 20 / 35 / 55 | 4 / 7 / 10 | 2.8–3.2 | 14 / 18 / 24 | 3 / 5 / 8 | T10 / T9 / T7 |
| combo | 50 / 70 / 90 | 7 / 10 / 14 | 2.4–2.9 | 14 / 18 / 24 | 2 / 4 / 7 | T6 / T5 / T3 |
| aristocrats | 25 / 40 / 60 | 5 / 8 / 11 | 2.6–3.0 | 16 / 20 / 26 | 5 / 8 / 12 | T8 / T7 / T5 |
| spellslinger | 25 / 40 / 60 | 4 / 7 / 10 | 2.4–2.8 | 18 / 24 / 30 | 4 / 7 / 11 | T8 / T7 / T5 |
| tokens | 25 / 40 / 60 | 5 / 8 / 11 | 2.8–3.2 | 12 / 16 / 22 | 6 / 9 / 13 | T8 / T7 / T6 |
| reanimator | 35 / 55 / 75 | 6 / 9 / 12 | 2.8–3.2 | 16 / 20 / 26 | 4 / 7 / 11 | T6 / T5 / T4 |
| lands/landfall | 20 / 35 / 55 | 5 / 8 / 11 | 2.6–3.0 | 12 / 16 / 22 | 4 / 7 / 11 | T9 / T8 / T6 |

Combo demands the highest fast-mana and earliest goldfish turn — a "combo deck" goldfishing T8 is just slow midrange. Control's fast-mana ideal is moderate (it wants ramp to *hold up answers*, not deploy threats). Voltron beats combo on `low-drops` and `threat.density` (commander + equipment + protection is a wide low curve).

Goldfish turn reads as `worst-acceptable / target / best-attainable`. T3 is cEDH; casual decks aren't punished for not hitting it.

#### Scoring curves

Three Speed-specific behaviors:

1. **`mana.fast` is tier-scored.** S = Sol Ring, Mana Crypt, Jeweled Lotus, Mana Vault. A = Chrome Mox, Mox Diamond, Lotus Petal, Ancient Tomb. B = Grim Monolith, City of Traitors, Mox Opal, Mox Amber. Score = `S×40 + A×20 + B×10`, capped at 100. Diminishing returns past 3 fast-mana sources (can't keep 7 with 5).
2. **`wincon.turnEstimate` is heuristic, declared as such.** `estimatedTurn = max(commanderCMC - rampScore, primaryWinconCMC - tutorSpeed, 4)` with archetype floor (combo T3, midrange T6). Output shown with confidence band ("estimated T6 ± 1"). Most fragile sub-metric; transparency is the mitigation.
3. **`curve.avgCMC` uses archetype-relative scoring.** `score = 100 - |avgCMC - archetypeIdealMidpoint| × penaltyFactor`, clamped 0–100.

#### Tags consumed

`ramp.fast` (with tier subdivision in `fast-mana-tiers.json`), `ramp.land/rock/dork/cost-reducer` (filtered CMC ≤ 2 for `mana.earlyRamp`), `threat.finisher`, `threat.must-answer`, `threat.commander-damage`, `tutor.*` (filtered by what they fetch). Structural: `cmc`, commander cast cost from parsed deck.

#### Interaction with Consistency (declared)

`mana.earlyRamp` is a strict subset of §3.1's `ramp.count`. Same cards count toward both axes. Justification: ramp's *quantity* is Consistency, ramp's *speed* is Speed. Documented in evidence.

#### Known limitations

- **Goldfish turn is a fiction.** Real games have interaction, mulligans, color-screw. Estimate is directional, not predictive. UI frames it as such.
- **No simulation.** Proper Speed needs Monte Carlo. v1 is heuristic; v2 can run actual goldfish simulations.
- **Threat tagging is the riskiest tag family.** Smothering Tithe is a threat, but the tagger sees "create Treasure" not "wins in 3 turns." Heuristic uses oracle patterns + CMC-impact ratios; expect false negatives. Manual override per card is the escape hatch (post-v1).
- **Fast-mana tier list is opinionated.** Lives as PR-able JSON in `fast-mana-tiers.json`.
- **No "fast for the format you play in" knob.** Casual T7 = "very fast"; cEDH T4 = average. Power-level slider is v1.1.
- **Commander-cost cheating** (Animar, Yidris cascade, Kenrith activated) not modeled. Cards taken at face cost.

---

## 4. Corpus / Co-occurrence Index *(high-level only)*

**Scope of this section:** name components, declare open questions, commit to *interfaces* not *implementations*. Detailed design happens in a Phase 2 design pass after Phase 1 ships.

### Purpose

Enable **gap analysis**: "Decks similar to yours commonly run cards X, Y, Z that you don't." Bridge between Phase 1 (your deck in isolation) and Phase 3 (upgrade suggestions filtered by ownership).

### Components (named, not specified)

1. **Corpus harvester** — periodically pulls a sample of public Commander decks from Moxfield, filtered by commander.
2. **Co-occurrence index** — per commander/archetype: `Map<cardName, { inclusionRate: number, sampleSize: number }>`.
3. **Gap analyzer** — `analyzeGaps(resolvedDeck, corpus): GapReport`. Surfaces high-inclusion missing cards, ranked by `(inclusionRate × archetypeRelevance × CRISPIaxisImpact)`.
4. **Refresh scheduler** — keeps corpus fresh without hammering Moxfield. Cadence TBD.
5. **Storage layer** — corpus needs persistence; format/engine TBD.

### Interfaces this section commits to

```ts
interface CorpusService {
  getInclusionRates(commander: string, archetype?: Archetype): Promise<InclusionTable | null>
  getSimilarDecks(commander: string, limit: number): Promise<DeckSummary[]>
  metadata(commander: string): Promise<{ sampleSize: number; lastRefreshed: string } | null>
}

interface GapReport {
  gaps: GapItem[]                  // ranked, missing high-inclusion cards
  overInclusions: GapItem[]        // cards in your deck rarely run elsewhere — examine
  corpusMeta: { sampleSize: number; lastRefreshed: string; archetype: Archetype }
}

interface GapItem {
  card: Card                       // resolved via §2's resolver
  inclusionRate: number
  rationale: string                // "78% of Atraxa decks run this; absent from yours"
  estimatedAxisImpact: Partial<Record<'C'|'R'|'I'|'S', number>>
}
```

Phase 1 ships with a **null implementation** of `CorpusService` (returns `null` everywhere). UI checks for null and hides gap-analysis sections. Phase 2 changes only the implementation.

### Open questions (deferred to Phase 2 design pass)

1. **Does Moxfield expose public deck-search-by-commander?** Unknown. If no: scrape (fragile, ToS), use EDHREC API (popularity-weighted, different data), or skip Phase 2.
2. **Sample size per commander.** 100? 1000? Long-tail commanders may have <10 public decks.
3. **Storage engine.** SQLite (simple, single-file deploy)? JSON per commander? Postgres (overkill v1)?
4. **Refresh cadence + delta detection.** Full weekly is expensive; incremental needs Moxfield to expose creation timestamps in search.
5. **Archetype-conditional vs. commander-conditional rates.** `Edric goodstuff` ≠ `Edric spellslinger`; combining dilutes signal. Splitting requires running our archetype detector at corpus scale.
6. **Privacy / ToS.** Public decks are public, but harvesting at scale may violate Moxfield ToS. Read before Phase 2 implementation.
7. **Cold-start for unknown commanders.** Niche commander → no corpus. Fallback: aggregate across same-archetype regardless of commander? Acceptable proxy or misleading?

### Phase 1 implementation impact

- Define `CorpusService` interface in `server/src/types.ts` and a null implementation in `server/src/analyzer/corpus/null.ts`. Wire the analyzer to consume it.
- Don't build harvester, index, or storage. Don't add their dependencies.
- UI design (§6) treats gap-analysis panels as conditional — hidden when corpus is null.

---

## 5. Library-Aware Upgrade Engine *(high-level only)*

Same scope discipline as §4: named components, committed interfaces, deferred details.

### Purpose

Take a `GapReport` and filter/rank by what you own. Output: "These N cards your binder already contains would meaningfully improve this deck."

### Phase ordering

Phase 3 has a **hard dependency on Phase 2** (no corpus → no gaps). However, a **degenerate "Phase 1.5" path** exists: surface owned cards that the CRISPI scorer flags as boosting under-performing axes ("Resilience score is 38; your binder has 6 untapped recursion pieces not in this deck"). Weaker than corpus-driven, but useful and corpus-free.

### Components (named, not specified)

1. **Owned-card matcher** — given a candidate, look up in `OwnedLibrary` (§1).
2. **Color-identity filter** — drop candidates exceeding the deck's commander identity.
3. **Slot-impact estimator** — for each owned candidate, estimate what it would replace and the projected CRISPI delta. Re-runs the scorer with the swap. Expensive; cache aggressively.
4. **Upgrade ranker** — orders by `(estimatedAxisImpact × inclusionRate × ownershipPriority)`. Ownership priority is a tiebreaker, not a primary signal.
5. **Bundle suggester** (stretch) — groups synergistic upgrades.

### Interfaces this section commits to

```ts
interface UpgradeEngine {
  suggestUpgrades(
    deck: ResolvedDeck,
    crispi: CrispiReport,
    gaps: GapReport | null,                 // null → degraded mode (CRISPI-only)
    library: OwnedLibrary
  ): Promise<UpgradeReport>
}

interface UpgradeReport {
  mode: 'corpus-driven' | 'crispi-only'
  suggestions: UpgradeSuggestion[]
  meta: { librarySize: number; candidatesConsidered: number; candidatesOwned: number }
}

interface UpgradeSuggestion {
  card: Card
  ownedQty: number
  printings: CollectionItem[]
  proposedReplacement?: { card: Card; reason: string }
  estimatedDelta: { overall: number; perAxis: Partial<Record<'C'|'R'|'I'|'S', number>> }
  rationale: string
  confidence: 'high' | 'medium' | 'low'
}
```

### Open questions (deferred to Phase 3 design pass)

1. **Slot replacement is hard.** "Add this" easy; "replace what?" is the actual deckbuilding problem. Scorer can suggest weakest-by-tag-density; users will disagree. Escape hatch: show suggestion as additive only, let user pick the cut.
2. **Multi-copy semantics.** Commander is singleton. Owning 4 Sol Rings doesn't help one deck. Ownership priority should be a tiebreaker, not over-weight quantity.
3. **Sleeved-in-other-decks awareness.** If a card is already in another deck, suggesting it here is misleading. Requires deck tracking — out of scope until requested. Phase 3 v1 assumes binder ≈ available.
4. **Price filtering.** UI filter, not server concern.
5. **Re-scoring cost.** Per-suggestion CRISPI delta means N scorer runs per analysis. Profile in Phase 3.
6. **The "weak owned card" recommendation problem.** Owning ≠ good. Filtering by corpus inclusion (Phase 2) is the natural quality gate; Phase 1.5 lacks it. In `crispi-only` mode: be conservative, surface fewer high-confidence suggestions.

### Phase 1 implementation impact

- Define `UpgradeEngine` interface and null implementation. Same pattern as §4.
- The CRISPI-only "Phase 1.5" mode is a realistic v1 stretch goal once Phase 1 is solid.

---

## 6. UI / Vue Client Design

### Navigation

Existing app is a single view (collection browser). Add a top-level switch:

```
┌─────────────────────────────────────────────────────────┐
│ Lorevault        [ Collection ]  [ Analyzer ]           │
├─────────────────────────────────────────────────────────┤
│  (current view)                                          │
└─────────────────────────────────────────────────────────┘
```

Implementation: a single `currentView` ref in `App.vue`, two child components. **No vue-router yet** — adds dependency for marginal value in a 2-view app. Migrate when a third view or deep-linking arrives.

### Analyzer view — single scrolling page, progressive sections

```
┌── 1. Deck Input ─────────────────────────────────────────┐
│ [ Moxfield URL ]  [ Manual Paste ]    ← tab switch       │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ moxfield.com/decks/abc123  or  abc123                │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                [Analyze] │
└──────────────────────────────────────────────────────────┘

┌── 2. Parsed Deck ────────────────────────────[collapse]──┐
│ Commander: Atraxa, Praetors' Voice                       │
│ Mainboard: 99 cards   Unresolved: 0                      │
│ ▸ Show full list                                         │
└──────────────────────────────────────────────────────────┘

┌── 3. Archetype ──────────────────────────────────────────┐
│ Detected: Midrange / Goodstuff   (confidence: medium)    │
│ Override: [ Midrange / Goodstuff ▾ ]                     │
│ Reasons: high tag-density in counterspells (8) and       │
│          spot removal (11), no clear engine cluster      │
└──────────────────────────────────────────────────────────┘

┌── 4. CRISPI Score ───────────────────────────────────────┐
│        ┌──────────┐                                      │
│        │    74    │  Overall                             │
│        │   B+     │                                      │
│        └──────────┘                                      │
│                                                          │
│   ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐            │
│   │  82 A  │ │  61 C+ │ │  78 B+ │ │  75 B  │            │
│   │ Consis.│ │ Resil. │ │ Inter. │ │ Speed  │            │
│   └────────┘ └────────┘ └────────┘ └────────┘            │
│       ▾         ▾         ▾         ▾                    │
│   click any tile to drill down                           │
└──────────────────────────────────────────────────────────┘

┌── 5. Axis Drill-Down (when a tile is clicked) ───────────┐
│ Resilience — 61 (C+)                                     │
│  Sub-metric            Raw   Target   Score   Weight     │
│  ──────────────────────────────────────────────────────  │
│  Recursion              4    3/5/8     74%    20%        │
│  Permanent protection   2    2/4/6     60%    15%        │
│  Spell protection       3    2/4/6     85%    10%        │
│  Commander tax mit.     0    1/2/4      0%    10%   ⚠   │
│  Engine redundancy      4    3/5/8     74%    20%        │
│  Wipe survivability    11%   10/18/28  62%    15%        │
│                                                          │
│  Notes:                                                  │
│  • No commander-tax mitigation detected — Atraxa costs   │
│    {G}{W}{U}{B}; consider Command Beacon                 │
│  • Engine redundancy strong on +1/+1 counter payoffs     │
│                                                          │
│  Contributing cards (expand)                             │
│  ▸ Recursion (4):   Eternal Witness, Sun Titan, …        │
│  ▸ Protection (2):  Heroic Intervention, Teferi's Prot.  │
│  ▸ Engine (4):      Doubling Season, Pir, Hardened Sc.   │
└──────────────────────────────────────────────────────────┘

┌── 6. Gap Analysis ───────────────────────────────────────┐
│  (hidden in Phase 1 — corpus service is null)            │
└──────────────────────────────────────────────────────────┘

┌── 7. Owned Upgrades ─────────────────────────────────────┐
│  (hidden in Phase 1 — upgrade engine is null)            │
└──────────────────────────────────────────────────────────┘
```

Sections 6 and 7 render only when their backing service returns non-null. Phase 2 lights up §6, Phase 3 lights up §7. **No UI rework needed when those phases ship.**

### Component layout

```
client/src/components/
├─ analyzer/
│  ├─ AnalyzerView.vue          # top-level container, owns analyzer state
│  ├─ DeckInput.vue             # tabs: URL / paste, calls /api/deck/parse
│  ├─ ParsedDeckSummary.vue     # commander + counts + unresolved warnings
│  ├─ ArchetypePicker.vue       # detected + override dropdown
│  ├─ CrispiDashboard.vue       # 4 tiles + overall
│  ├─ AxisCard.vue              # one tile, click → emits expand
│  ├─ AxisDrillDown.vue         # sub-metric table + evidence
│  ├─ EvidenceList.vue          # collapsible card lists per sub-metric
│  ├─ GapAnalysis.vue           # Phase 2 — exists but renders null in P1
│  └─ UpgradeSuggestions.vue    # Phase 3 — same
├─ collection/
│  ├─ CollectionView.vue        # current App.vue logic moved here
│  ├─ ColorSelector.vue         # (existing)
│  └─ CardList.vue              # (existing)
└─ shared/
   ├─ NavTabs.vue
   └─ CardChip.vue              # small reusable card pill
```

`App.vue` becomes a thin shell: `NavTabs` + `<component :is="currentView">`. Existing collection logic moves to `CollectionView.vue` — pure refactor, no behavior change.

### State management

Each view owns local state via `ref`/`reactive`. **No Pinia/Vuex** for v1.

Within `AnalyzerView.vue`:
```ts
const deckInput = ref<{ source; payload } | null>(null)
const parsedDeck = ref<ParsedDeck | null>(null)
const resolvedDeck = ref<ResolvedDeck | null>(null)
const archetype = ref<Archetype | null>(null)
const crispi = ref<CrispiReport | null>(null)
const expandedAxis = ref<'C'|'R'|'I'|'S' | null>(null)
const loading = ref<{ parsing; resolving; scoring }>(/* … */)
```

Progressive flow: `parse → setParsedDeck → resolve → setResolvedDeck → score → setCrispi`. Each stage has its own spinner. Errors halt downstream stages and surface inline.

### Visual / styling

Reuse existing `client/src/style.css` conventions. Color-code axis tiles consistently:

- Consistency = green
- Resilience = blue
- Interaction = red
- Speed = amber

Letter grades from score: `S 95+ / A 85+ / B 70+ / C 55+ / D 40+ / F <40`. Same scale across overall + axes.

### Mobile / responsive

Out of scope for v1.

### Persistence / sharing

URL-based deck-state-as-link deferred. Phase 1 = ephemeral analysis; refresh = re-submit.

### Error UX

- Parse errors: inline under textarea, line-numbered.
- Resolve errors (Moxfield down, card not found): inline warning per card; analysis proceeds with what resolved.
- Score errors: shouldn't happen (pure functions); if they do, full-page error with report link.

---

## 7. Testing Strategy & Fixtures

### Test layers

| Layer | Tool | Scope | When |
|---|---|---|---|
| Unit — pure functions | Vitest (already in project, see `collection.test.ts`) | Tag functions, scoring curves, parsers, archetype detector | On save / pre-commit |
| Integration — service composition | Vitest + mocked fetch | `/api/deck/parse`, `/resolve`, `/score` end-to-end with stubbed Moxfield | Pre-push |
| Fixture-based — real decks | Vitest snapshot tests | Full `CrispiReport` for curated real decks | Pre-push |
| Manual — exploratory | Browser, your library | UI flows, edge-case decks | Per release |

No Playwright/Cypress yet. Reconsider when UI grows.

### Fixtures

Three sets in `server/src/analyzer/__fixtures__/`:

**1. Card fixtures (`cards/`)** — JSON `Card` objects, hand-curated, 30–50 cards covering every tag family:
- `sol-ring.json` (fast mana S-tier)
- `counterspell.json` (counterspell + spell protection — double-tag check)
- `eternal-witness.json` (recursion baseline)
- `cyclonic-rift.json` (asymmetric wipe — stresses removal vs. wipe classification)
- `bojuka-bog.json` (graveyard hate, also a land)
- `sleight-of-hand.json` (multiple printings — printing-merge logic)
- … etc.

**2. Deck fixtures (`decks/`)** — full resolved 100-card decks, one per archetype:
- `atraxa-superfriends.json` (midrange/goodstuff)
- `krenko-mob-boss.json` (tokens/aggro)
- `meren-aristocrats.json` (aristocrats/reanimator hybrid — stresses archetype detector)
- `urza-combo.json` (combo, high fast-mana density)
- `omnath-landfall.json` (lands)
- `edric-spellslinger.json` (spellslinger, low CMC)
- ~9 decks total. Sourced from real Moxfield public decks; commit the resolved JSON, not the URL (decks change/disappear).

**3. Library fixture (`library/`)** — derived from Dele's collection:
- One-time conversion script (throwaway, not committed): pull the live collection via Moxfield, output `your-library.json` as `OwnedLibrary`.
- Commit the resolved JSON. Use as realistic library for upgrade-engine tests later.
- Manual review before commit; should be just card names + counts.

### What gets snapshot-tested

For each deck fixture, snapshot the full `CrispiReport`. When tagger heuristics change, snapshots intentionally break — the diff *is* the review surface. Reviewer reads "Atraxa Resilience went from 61 → 73 because we added Sun Titan to recursion tags" and approves or rejects.

### What does NOT get tested

- **The Moxfield API itself.** Mock it.
- **Exact threshold tables** — they're config; they'll be tuned. Test that scoring functions respect the table, not specific numeric thresholds.
- **UI rendering pixel-perfectly.** Vue component tests for logic only.
- **Performance.** Until something is measurably slow, don't write perf tests.

### Coverage targets

- Tag functions: 100% branch coverage (small pure functions; cheap; catches off-by-ones).
- Scoring curves: 100% — every piecewise branch.
- Archetype detector: each archetype has at least one positive fixture and one near-miss negative fixture.
- Everything else: no target. Coverage as a number is noise.

### Test data refresh

Static. Drifts annually or when a tagger change surfaces fixture inaccuracy. Stability beats freshness for tests.

### CI

Existing project uses Vitest. **Do not add new CI infra in Phase 1.**

---

## 8. Open Questions, Risks, Phased Rollout

### Phased rollout summary

| Phase | Scope | Ships | Blocking? |
|---|---|---|---|
| **1.0** | Sections 1–3, 6, 7. Sections 4 & 5 stubbed with null implementations behind interfaces. | Working analyzer: paste/import deck → CRISPI score with full transparency. Collection browser unchanged. | None — fully shippable. |
| **1.5** | CRISPI-only upgrade mode (§5 degraded path): "your library has these cards that might help your low axes." No corpus needed. | Owned-card suggestions ranked by axis-impact heuristic. | Phase 1.0 in production long enough to trust CRISPI output. |
| **2.0** | Section 4 implementation: corpus harvester, co-occurrence index, gap analysis. Requires its own design pass. | "Decks like yours run X" reports. | Hard-blocked on §4 open questions, esp. Moxfield deck-search availability. |
| **3.0** | Section 5 full: corpus-driven upgrade engine with slot-replacement suggestions. | "Add this from your binder, cut this from your deck." | Hard-blocked on Phase 2.0. |

### Open questions, by section

**Section 1** — None blocking. Card identity = card name; revisit only if false-positive merges show up in fixture testing.

**Section 2**
- Q2.1: **Scryfall-to-project `Card` mapping contract** — define the exact field mapping and defaults required to map Scryfall card responses into the shared `Card` shape used by the server.
- Q2.2: Moxfield deck-by-id endpoint URL/shape — assumed to exist with same Bearer auth, **must verify before Phase 1 implementation**.

**Section 3**
- Q3.1: Tagger false-positive rate likely 5–15% on edge cases. Mitigation: evidence panel surfaces; tagger config files are PR-able.
- Q3.2: Goldfish-turn estimator is heuristic; expect user pushback ("my deck doesn't actually win on T6"). UI framing as "estimated" is the only honest mitigation.
- Q3.3: Archetype detection confidence will be low for goodstuff/midrange decks — by their nature they don't cluster. Manual override is the safety valve.
- Q3.4: Threshold tables are opinionated baselines without empirical grounding. Phase 2 corpus will eventually let us derive them; until then they're our best guess in PR-friendly config.

**Section 4** — All 7 questions deferred; deferred is the design decision.

**Section 5** — All 6 questions deferred; same.

**Section 6**
- Q6.1: No deep links / URL state for analyses in v1. Users will request this. Plan for vue-router migration when it surfaces.
- Q6.2: Mobile unsupported. Documented gap.

**Section 7**
- Q7.1: Snapshot tests will break frequently during early development. Expect noise; trust the process.

### Top risks (impact × likelihood)

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Moxfield rotates auth or rate-limits us | High — analyzer dies | Medium | Token in env, cache aggressively, "manual paste only" fallback if API fails |
| Scryfall response shape does not perfectly match the current shared `Card` type | Medium | Medium | Introduce a single mapper/normalizer and test it heavily with fixtures |
| Tagger heuristics misclassify enough cards that scores feel wrong | High — credibility loss | Medium-High | Evidence panel, manual tag override at card level (post-v1), conservative thresholds |
| Threshold tables don't match user's meta (cEDH vs. casual) | Medium — scores feel off | High | Document as known; Phase 2 corpus + power-level slider in v1.1 |
| Moxfield ToS prohibits deck-corpus harvesting | High — Phase 2 blocked | Unknown | Read ToS before Phase 2. Phase 1 ships regardless |
| Performance — full scoring on 100-card deck takes >2s | Medium — sluggish UX | Low (tagging is microseconds, no IO post-resolve) | Measure first, optimize only if needed |
| User's library JSON fixture leaks personal info | Low | Low | Manual review before commit; just card names |
| Section 6 UI grows beyond two views, need vue-router late | Low — easy refactor | Medium | Accept; refactor when needed |
| Snapshot test churn paralyzes development | Low | Medium | Discipline: review snapshots intentionally; never blanket-update |

### Decisions deliberately deferred (not risks — choices)

- Mana-base quality scoring beyond color counts — v1.1
- Power-level / bracket selector to shift all thresholds globally — v1.1
- Politics / pillowfort sub-metric in Interaction — v1.1
- Multi-format support (60-card formats) — out of scope indefinitely
- Mulligan / opening-hand Monte Carlo simulation — v2
- Custom user archetypes — out of scope unless requested

### What Phase 1 explicitly promises

A user can:
1. Paste a Moxfield deck URL or a manual decklist.
2. See it parsed, with unresolved-card warnings.
3. See an auto-detected archetype and override it.
4. See a CRISPI score (overall + 4 axes + grades).
5. Drill into any axis and see every sub-metric, target, score, and contributing card.
6. Trust that every number on screen is traceable to specific cards.

Nothing more. No gap analysis, no upgrade suggestions, no deck saving, no sharing. Smallest version that delivers the core value of *transparent deck quality scoring*.
