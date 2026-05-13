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
- CRISPI `Interaction`
- CRISPI `Speed`
- representative backend scorer fixtures and snapshots

Still missing above the backend:
- analyzer UI score views
- evidence drill-down UX
- archetype override UX
- collection-aware recommendations

## Recently completed milestones

### Done
- phase 1.A data-layer groundwork
- phase 1.B deck resolver workflow
- cross-platform Node smoke runner
- smoke logfile tooling
- phase 1.C backend consistency slice
- phase 1.D backend resilience slice
- phase 1.E backend interaction MVP slice
- phase 1.F backend interaction full-spec completion
- phase 1.G backend speed MVP slice
- phase 1.H backend speed full-spec completion + scorer hardening

## Next priorities

### 1. Add the Analyzer UI MVP
Expand the client beyond collection browsing so it can:

- switch between `Collection` and `Analyzer`
- submit parse / resolve / score flows
- display overall CRISPI score + 4 axis tiles
- show parsed/resolved deck summary and detected archetype

This is the next planned slice and now sits on top of a complete backend CRISPI contract.

### 2. Add analyzer drill-down UX
After the thin UI MVP lands, deepen the analyzer interface with:

- axis drill-down tables
- per-card evidence views
- notes UX
- archetype override controls

### 3. Improve analyzer heuristics
Now that all four axes exist, deepen the backend model with better analysis quality:

- richer archetype detection
- deeper tag coverage
- clearer evidence generation
- scoring/spec-alignment cleanup where needed

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
