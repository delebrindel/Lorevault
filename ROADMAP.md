# Lorevault Roadmap

This roadmap tracks the current project milestone state at a higher level than the implementation plans under `docs/superpowers/`.

## Current state

Lorevault already supports the full backend deck-analysis pipeline up through the currently implemented CRISPI slices:

- collection filtering
- deck parsing
- deck resolution
- deck scoring

### Backend analyzer status

Implemented now:
- `POST /api/deck/parse`
- `POST /api/deck/resolve`
- `POST /api/deck/score`
- CRISPI `Consistency`
- CRISPI `Resilience`

Still stubbed in the backend analyzer:
- CRISPI `Interaction`
- CRISPI `Speed`

Still missing above the backend:
- analyzer UI score views
- evidence drill-down UX
- collection-aware recommendations

## Recently completed milestones

### Done
- phase 1.A data-layer groundwork
- phase 1.B deck resolver workflow
- cross-platform Node smoke runner
- smoke logfile tooling
- phase 1.C backend consistency slice
- phase 1.D backend resilience slice groundwork and scorer wiring

## Next priorities

### 1. Finish the backend CRISPI engine
Build the remaining backend scoring slices so the analyzer contract is complete:

- `Interaction`
- `Speed`

This keeps the backend-first strategy intact and gives the future UI a stable report shape with all four axes implemented.

### 2. Improve analyzer heuristics
Once all four axes exist, deepen the backend model with better analysis quality:

- richer archetype detection
- deeper tag coverage
- clearer evidence generation
- consistency/spec-alignment cleanup where needed

### 3. Add analyzer UI
Expand the client beyond collection browsing so it can:

- submit parse / resolve / score flows
- display CRISPI axis scores
- surface per-card evidence and notes
- expose archetype override controls

### 4. Add collection-aware recommendations
Build recommendation features on top of resolved/scored deck data and the owned collection.

## Longer-term direction

After the backend CRISPI engine and UI are in place, the longer arc remains:

- corpus / co-occurrence analysis
- gap analysis against similar decks
- smarter upgrade recommendations
- broader transparent deck-intelligence features

## Notes

- Detailed execution plans live in `docs/superpowers/plans/`.
- Design/spec docs live in `docs/superpowers/specs/`.
- This file should stay concise and milestone-oriented.
