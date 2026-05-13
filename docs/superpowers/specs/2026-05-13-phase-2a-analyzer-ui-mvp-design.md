# Phase 2.A — Analyzer UI MVP Design

**Date:** 2026-05-13  
**Status:** Draft for review  
**Project:** `Lorevault`  
**Scope:** Client/UI with existing backend APIs

## Summary

Add the first usable analyzer UI to Lorevault.

This slice introduces a simple **Collection / Analyzer** tab switch in the client, preserves the current collection browser, and adds an Analyzer view that can drive the existing backend pipeline:

- `POST /api/deck/parse`
- `POST /api/deck/resolve`
- `POST /api/deck/score`

The UI MVP is intentionally thin. It covers:
- deck input
- parse → resolve → score flow
- loading and error states
- parsed/resolved deck summary
- detected archetype
- overall CRISPI score
- four axis summary tiles

It explicitly defers axis drill-downs, evidence panels, archetype override, and richer analyzer UX to later slices.

## Goals

1. Add an Analyzer UI without breaking the existing collection browser.
2. Reuse the current backend analyzer route contract as-is.
3. Provide a complete end-to-end user flow from deck input to visible CRISPI results.
4. Keep the first analyzer UI slice small and understandable.
5. Establish a client structure that can be extended later with drill-downs and recommendations.

## Non-goals

This slice does **not** implement:

- axis drill-down tables
- per-card evidence lists in the UI
- archetype override controls
- route-based navigation / vue-router
- Pinia or centralized client state
- recommendation UI
- corpus / gap analysis UI
- client-side persistence / share links
- mobile-specific polish
- collection-aware suggestions
- backend route changes

## Scope choice

This is the **thin UI MVP** approach, not the full analyzer page from the master design.

### Implement in this slice
- top-level Collection / Analyzer tab switch
- analyzer input for:
  - Moxfield URL / ID
  - manual paste
- progressive parse → resolve → score flow
- stage loading states
- inline error states
- parsed deck summary
- resolved deck summary / unresolved count
- detected archetype display
- overall CRISPI score
- four axis summary tiles

### Explicitly defer
- axis expansion / drill-downs
- evidence panels
- notes panels beyond simple summary display
- archetype override dropdown
- recommendation sections

## Architecture

The current app is a single `App.vue` collection page. This slice reorganizes the client into two high-level views with a simple tab switch.

### Proposed structure

```text
client/src/
├─ App.vue
├─ main.ts
├─ style.css
├─ components/
│  ├─ shared/
│  │  └─ NavTabs.vue
│  ├─ collection/
│  │  └─ CollectionView.vue
│  └─ analyzer/
│     ├─ AnalyzerView.vue
│     ├─ DeckInput.vue
│     ├─ ParsedDeckSummary.vue
│     ├─ CrispiDashboard.vue
│     └─ AxisCard.vue
├─ services/
│  └─ analyzer.ts
└─ types/
   ├─ card.ts
   └─ analyzer.ts
```

### High-level responsibilities

- `App.vue`
  - shell only
  - owns current top-level tab selection
  - renders `CollectionView` or `AnalyzerView`

- `CollectionView.vue`
  - contains the current collection-browsing logic migrated out of `App.vue`
  - preserves current behavior

- `AnalyzerView.vue`
  - owns analyzer state and orchestration
  - calls parse → resolve → score in sequence
  - renders the thin analyzer sections progressively

- `DeckInput.vue`
  - source toggle (`manual` vs `moxfield`)
  - payload input area
  - Analyze button

- `ParsedDeckSummary.vue`
  - commander count
  - mainboard count
  - unresolved count / unresolved list summary

- `CrispiDashboard.vue`
  - overall score card
  - four axis tiles
  - detected archetype summary

- `AxisCard.vue`
  - presentational axis tile only
  - no expansion logic in this slice

- `services/analyzer.ts`
  - lightweight fetch wrappers for parse / resolve / score

## Navigation choice

Use a simple **tab switch**, not vue-router.

Why:
- smallest change from the current app
- enough for two top-level views
- easy to refactor later if the UI grows beyond two views

## Data flow

The Analyzer view should drive the backend in three stages:

```text
Deck input
  -> /api/deck/parse
  -> ParsedDeck
  -> /api/deck/resolve
  -> ResolvedDeck
  -> /api/deck/score
  -> CrispiReport
```

### View state model

Inside `AnalyzerView.vue`, keep local reactive state only.

Suggested state shape:

```ts
const source = ref<"manual" | "moxfield">("manual")
const payload = ref("")

const parsedDeck = ref<ParsedDeck | null>(null)
const resolvedDeck = ref<ResolvedDeck | null>(null)
const crispi = ref<CrispiReport | null>(null)

const parseError = ref("")
const resolveError = ref("")
const scoreError = ref("")

const loading = reactive({
  parsing: false,
  resolving: false,
  scoring: false,
})
```

### Flow behavior

When the user clicks **Analyze**:

1. clear previous downstream results/errors
2. call `/api/deck/parse`
3. if parse succeeds, call `/api/deck/resolve`
4. if resolve succeeds, call `/api/deck/score`
5. render progressively as each stage succeeds

This should remain sequential and explicit for the MVP.

## Service contract assumptions

This slice assumes the current backend contracts remain unchanged.

### Parse request

```ts
POST /api/deck/parse
{ source: "manual" | "moxfield", payload: string }
```

### Resolve request

```ts
POST /api/deck/resolve
ParsedDeck
```

### Score request

```ts
POST /api/deck/score
{ deck: SerializedResolvedDeck }
```

The UI should not attempt to reshape the analyzer contract beyond the small `Map`/object serialization already implied by the current backend API.

## UI sections in the MVP

### 1. Top-level tabs

At the top of the app:
- `Collection`
- `Analyzer`

Collection remains the default tab so current behavior is preserved.

### 2. Analyzer input section

`DeckInput.vue` should provide:
- a source toggle for `manual` vs `moxfield`
- a single input/textarea region appropriate to the source
- an Analyze button

#### UX rules
- disable Analyze while any analyzer stage is running
- require non-empty payload before submission
- keep wording simple and explicit

Suggested labels:
- source tabs: `Moxfield` / `Manual Paste`
- button: `Analyze Deck`

### 3. Parsed deck summary

After parse succeeds, show:
- commander names
- mainboard count
- unresolved count

If unresolved cards exist, show a small warning block with the first few names and a count summary.

### 4. Resolved deck summary

After resolve succeeds, show:
- resolved commander names
- resolved mainboard count
- unresolved count
- owned-map summary only if already easy to render; otherwise omit in MVP

### 5. Analyzer result summary

After score succeeds, show:
- detected archetype
- overall CRISPI score and grade
- four axis tiles:
  - Consistency
  - Resilience
  - Interaction
  - Speed

Each tile should show at least:
- axis label
- score
- grade

No click-to-expand behavior yet.

## Error handling

Errors should be inline and stage-specific.

### Rules
- parse failure stops the flow before resolve/score
- resolve failure stops before score
- score failure only affects the final stage
- do not hide earlier successful sections when a later stage fails

### Suggested UX
- parse error under input area
- resolve error under parsed summary
- score error under resolved summary

### Messaging approach
Use backend error text when present. Fall back to:
- `Parse request failed (status)`
- `Resolve request failed (status)`
- `Score request failed (status)`

## Loading behavior

Each stage should have its own loading flag.

Suggested visible states:
- `Parsing...`
- `Resolving...`
- `Scoring...`

The Analyzer view should make it visually obvious where the user is in the pipeline.

## Styling approach

Reuse existing `client/src/style.css` tokens and visual language.

### Axis color mapping
Keep the design’s declared axis colors:
- Consistency = green
- Resilience = blue
- Interaction = red
- Speed = amber

### General style guidance
- do not introduce a component library
- preserve the current dark theme and simple bordered cards/buttons
- prefer a vertical single-page analyzer layout inside the Analyzer tab

## Types and service wrappers

### Client-side analyzer types
Add a small `client/src/types/analyzer.ts` file for the UI-facing types needed by the analyzer flow.

This should include client copies of the minimal shapes needed for:
- `ParsedDeck`
- serialized `ResolvedDeck`
- `CrispiReport`
- axis report / sub-metric summaries as needed by the dashboard

Keep these minimal. Do not mirror every backend type unless needed by the UI.

### Service wrapper
Add `client/src/services/analyzer.ts` with small functions such as:

```ts
parseDeck(input)
resolveDeck(parsed)
scoreDeck(resolved)
```

This keeps fetch details out of components.

## Migration of current collection UI

The current collection logic should move from `App.vue` into `CollectionView.vue` with no intended behavior change.

This is a focused extraction, not a redesign.

Expected migrated pieces:
- selected color state
- colorless toggle state
- collection fetch logic
- result rendering
- toast usage

## Testing strategy

### Client build verification
At minimum, verify:
- `cd client && npm run build`

### Manual verification targets
For this MVP, manual testing is important:

1. Collection tab still works exactly as before.
2. Analyzer tab accepts manual paste input and completes parse → resolve → score.
3. Analyzer tab accepts Moxfield input and completes parse → resolve → score.
4. Stage-specific errors display inline.
5. Analyzer results show overall score, archetype, and all four axis tiles.

### Optional component tests
If lightweight Vue component tests are already easy to add, they can cover small rendering/state cases, but they are not required for this MVP if they would add tooling overhead.

## File plan

Expected files to modify/create:

- Modify: `client/src/App.vue`
- Create: `client/src/components/shared/NavTabs.vue`
- Create: `client/src/components/collection/CollectionView.vue`
- Create: `client/src/components/analyzer/AnalyzerView.vue`
- Create: `client/src/components/analyzer/DeckInput.vue`
- Create: `client/src/components/analyzer/ParsedDeckSummary.vue`
- Create: `client/src/components/analyzer/CrispiDashboard.vue`
- Create: `client/src/components/analyzer/AxisCard.vue`
- Create: `client/src/services/analyzer.ts`
- Create: `client/src/types/analyzer.ts`
- Possibly modify: `client/src/style.css`

## Risks and limits

1. **Type duplication** — backend analyzer types and client UI types may drift if copied too broadly.
2. **Sequential latency** — parse → resolve → score may feel slow, but that is acceptable for the MVP.
3. **Error-state complexity** — progressive rendering can get messy if not kept simple.
4. **No drill-down yet** — users will see scores before seeing per-card evidence.
5. **No router** — acceptable now, but should be revisited if more top-level views appear.

## Rollout result

After this slice, Lorevault will have:
- existing collection browser preserved
- first usable analyzer UI
- end-to-end visible CRISPI scoring in the client

That creates a clean next UI follow-up for:
- axis drill-downs
- evidence panels
- archetype override
- richer analyzer UX

## Self-review

- No placeholders remain.
- Scope is focused to a thin analyzer UI MVP.
- Collection behavior is preserved via extraction rather than redesign.
- Tab-switch architecture is explicit.
- Route contract remains unchanged.
- Deferred UI features are clearly called out.
