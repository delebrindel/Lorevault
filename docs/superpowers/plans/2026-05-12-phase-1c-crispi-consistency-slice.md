# Phase 1.C — CRISPI Backend Consistency Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a spec-aligned backend `POST /api/deck/score` endpoint with a full `CrispiReport` response shape, real `Consistency` scoring, and stubbed `Resilience` / `Interaction` / `Speed` axes.

**Architecture:** Keep parse/resolve/score under the existing `server/src/routes/deck.ts` router. Introduce a small analyzer module tree under `server/src/analyzer/` with shared analyzer types, a simple archetype detector stub, a minimal consistency-only tagger, and a top-level scorer that assembles the full CRISPI report. The route accepts the JSON-serialized form of `ResolvedDeck` and normalizes `ownedMap` back into a `Map` before scoring.

**Tech Stack:** TypeScript ESM, Hono, Vitest, existing server route/test patterns. No new dependencies.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `server/src/analyzer/types.ts` | Create | Shared analyzer types: `Archetype`, `CrispiReport`, `AxisReport`, `SubMetric`, `CardEvidence`, `CardTags`, detector result types. |
| `server/src/analyzer/archetype/detect.ts` | Create | Simple archetype stub for the first slice. Defaults to `midrange/goodstuff` with low confidence + reasons. |
| `server/src/analyzer/archetype/detect.test.ts` | Create | Locks stub behavior and output shape. |
| `server/src/analyzer/tags/index.ts` | Create | Minimal consistency-only tagger: land, ramp, draw, tutor classification. |
| `server/src/analyzer/tags/index.test.ts` | Create | Unit tests for conservative heuristics. |
| `server/src/analyzer/scorer/consistency.ts` | Create | Real `Consistency` axis scoring for slice 1. |
| `server/src/analyzer/scorer/consistency.test.ts` | Create | Unit tests for sub-metrics, evidence, and score ordering. |
| `server/src/analyzer/scorer/index.ts` | Create | Top-level `scoreDeck()`; applies override or stub detector; assembles full `CrispiReport` with stub axes. |
| `server/src/analyzer/scorer/index.test.ts` | Create | Locks report shape, override behavior, and overall-score calculation. |
| `server/src/routes/deck.ts` | Modify | Add `POST /score`, validate input, normalize JSON `ownedMap` to `Map`, return analyzer output. |
| `server/src/routes/deck.test.ts` | Modify | Add `/score` route tests using the existing mocking style. |

---

## Codebase notes (read before Task 1)

Verified from the current repo:

- `server/src/routes/deck.ts` already owns `POST /parse` and `POST /resolve`; add `POST /score` there rather than creating a new router.
- `ResolvedDeck` in `server/src/types.ts` uses `ownedMap: Map<string, number>`, but JSON requests cannot send a `Map`. The new route must accept a plain object record and convert it internally.
- Route validation style is explicit/manual, not schema-library based. Follow the pattern already used in `deck.ts`.
- Tests use `vi.mock()` heavily at the route layer and direct unit tests at the service layer.
- All local imports must use `.js` extensions.
- The backend already passes `cd server && npm test` and `cd server && npm run build`; do not change client code in this slice.
- This repo’s instructions require Dele to make commits. Do **not** run `git add` or `git commit`. At each checkpoint, stop and hand off the suggested commit message.

---

## Scoring scope for this slice

### Real in this slice
- `POST /api/deck/score`
- `archetypeOverride?: Archetype`
- stub detector when no override is provided
- full `CrispiReport` response shape
- `Consistency` axis with these sub-metrics:
  - `manabase.size`
  - `ramp.count`
  - `draw.density`
  - `tutor.count`
  - `curve.shape` (simplified as average nonland CMC vs archetype target midpoint)

### Explicitly stubbed in this slice
- `Resilience`
- `Interaction`
- `Speed`

Each stub axis returns:
- `score: 0`
- `grade: "F"`
- `subMetrics: []`
- `evidence: []`
- `notes: ["Not implemented yet in this backend slice."]`

### Deferred from this slice
- color-source analysis
- commander hint tables / JSON config files
- scorer result cache by deck hash
- card-tag memoization by `scryfall_id`
- any UI changes

---

## Build order

1. Top-level analyzer types + scorer skeleton
2. Archetype stub
3. `/api/deck/score` route
4. Consistency-only tagger
5. Real consistency scorer wired into `scoreDeck`
6. Final verification sweep

---

## Task 1 — Add analyzer types and a score-deck skeleton

**Files:**
- Create: `server/src/analyzer/types.ts`
- Create: `server/src/analyzer/scorer/index.ts`
- Create: `server/src/analyzer/scorer/index.test.ts`

- [ ] **Step 1: Write the failing scorer test**

Create `server/src/analyzer/scorer/index.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { scoreDeck } from "./index.js";
import type { Card, ResolvedDeck } from "../../types.js";

function makeCard(
  name: string,
  overrides: Partial<Card> = {},
): Card {
  return {
    id: name,
    uniqueCardId: `${name}-oracle`,
    scryfall_id: `${name.toLowerCase()}-sf`,
    set: "set",
    set_name: "Set",
    name,
    cn: "1",
    layout: "normal",
    cmc: 2,
    type: "Artifact",
    type_line: "Artifact",
    oracle_text: "",
    mana_cost: "{2}",
    colors: [],
    color_identity: [],
    rarity: "common",
    prices: {},
    ...overrides,
  };
}

function makeDeck(): ResolvedDeck {
  return {
    commander: [makeCard("Atraxa, Praetors' Voice", { color_identity: ["W", "U", "B", "G"] })],
    mainboard: [
      { card: makeCard("Sol Ring", { cmc: 1, oracle_text: "{T}: Add {C}{C}." }), qty: 1 },
      { card: makeCard("Forest", { cmc: 0, type: "Land", type_line: "Basic Land — Forest" }), qty: 35 },
    ],
    unresolved: ["Made Up Card"],
    ownedMap: new Map([["sol-ring-sf", 1]]),
  };
}

describe("scoreDeck", () => {
  it("returns a full CrispiReport shape with a full axis set", () => {
    const report = scoreDeck(makeDeck(), { archetypeOverride: "control" });

    expect(report.overall).toBe(0);
    expect(report.axes.consistency.grade).toBe("F");
    expect(report.axes.resilience.notes).toEqual([
      "Not implemented yet in this backend slice.",
    ]);
    expect(report.axes.interaction.notes).toEqual([
      "Not implemented yet in this backend slice.",
    ]);
    expect(report.axes.speed.notes).toEqual([
      "Not implemented yet in this backend slice.",
    ]);
    expect(report.deckMeta.commander).toEqual(["Atraxa, Praetors' Voice"]);
    expect(report.deckMeta.archetype).toBe("control");
    expect(report.deckMeta.unresolvedCount).toBe(1);
    expect(report.deckMeta.cardCount).toBe(37);
    expect(Number.isNaN(Date.parse(report.generatedAt))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd server && npm test -- scorer/index
```

Expected: FAIL because `server/src/analyzer/scorer/index.ts` and `server/src/analyzer/types.ts` do not exist yet.

- [ ] **Step 3: Create analyzer types**

Create `server/src/analyzer/types.ts`:

```ts
import type { MtgColor } from "../types.js";

export type Archetype =
  | "aggro/voltron"
  | "midrange/goodstuff"
  | "control"
  | "combo"
  | "aristocrats/sacrifice"
  | "spellslinger"
  | "tokens/go-wide"
  | "reanimator/graveyard"
  | "lands/landfall";

export type AxisKey = "consistency" | "resilience" | "interaction" | "speed";
export type AxisShortKey = "C" | "R" | "I" | "S";
export type Grade = "F" | "D" | "C" | "B" | "A" | "S";

export interface SubMetric {
  key: string;
  label: string;
  raw: number;
  target: { min: number; ideal: number; max: number };
  score: number;
  weight: number;
  contributingCards: string[];
}

export interface CardEvidence {
  card: string;
  axis: AxisShortKey;
  subMetric: string;
  contribution: number;
  reason: string;
}

export interface AxisReport {
  score: number;
  grade: Grade;
  subMetrics: SubMetric[];
  evidence: CardEvidence[];
  notes: string[];
}

export interface CrispiReport {
  overall: number;
  axes: {
    consistency: AxisReport;
    resilience: AxisReport;
    interaction: AxisReport;
    speed: AxisReport;
  };
  deckMeta: {
    commander: string[];
    archetype: Archetype;
    colorIdentity: MtgColor[];
    cardCount: number;
    unresolvedCount: number;
  };
  generatedAt: string;
}

export interface ArchetypeDetectionResult {
  archetype: Archetype;
  confidence: "low" | "medium" | "high";
  reasons: string[];
}

export interface CardTags {
  isLand: boolean;
  rampScore: number;
  drawScore: number;
  tutorScore: number;
  reasons: string[];
}
```

- [ ] **Step 4: Create the minimal scorer skeleton**

Create `server/src/analyzer/scorer/index.ts`:

```ts
import type { ResolvedDeck } from "../../types.js";
import type { Archetype, AxisReport, CrispiReport, Grade } from "../types.js";

function gradeFromScore(score: number): Grade {
  if (score >= 95) return "S";
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

function makeStubAxis(): AxisReport {
  return {
    score: 0,
    grade: "F",
    subMetrics: [],
    evidence: [],
    notes: ["Not implemented yet in this backend slice."],
  };
}

function collectColorIdentity(deck: ResolvedDeck): Array<"W" | "U" | "B" | "R" | "G"> {
  const source = deck.commander.length > 0
    ? deck.commander
    : deck.mainboard.map((entry) => entry.card);
  const colors = new Set<"W" | "U" | "B" | "R" | "G">();
  for (const card of source) {
    for (const color of card.color_identity) {
      if (color === "W" || color === "U" || color === "B" || color === "R" || color === "G") {
        colors.add(color);
      }
    }
  }
  return [...colors];
}

export function scoreDeck(
  deck: ResolvedDeck,
  opts: { archetypeOverride?: Archetype } = {},
): CrispiReport {
  const consistency = makeStubAxis();
  const resilience = makeStubAxis();
  const interaction = makeStubAxis();
  const speed = makeStubAxis();

  const overall = Math.round((
    consistency.score + resilience.score + interaction.score + speed.score
  ) / 4);

  return {
    overall,
    axes: { consistency, resilience, interaction, speed },
    deckMeta: {
      commander: deck.commander.map((card) => card.name),
      archetype: opts.archetypeOverride ?? "midrange/goodstuff",
      colorIdentity: collectColorIdentity(deck),
      cardCount: deck.commander.length + deck.mainboard.reduce((sum, entry) => sum + entry.qty, 0),
      unresolvedCount: deck.unresolved.length,
    },
    generatedAt: new Date().toISOString(),
  };
}

export { gradeFromScore };
```

- [ ] **Step 5: Run the test to verify it passes**

Run:

```bash
cd server && npm test -- scorer/index
```

Expected: PASS.

- [ ] **Step 6: Pause for Dele to commit**

Stop and present:
- Files changed:
  - `server/src/analyzer/types.ts`
  - `server/src/analyzer/scorer/index.ts`
  - `server/src/analyzer/scorer/index.test.ts`
- Suggested message: `feat(analyzer): add CRISPI report types and scoreDeck skeleton`

Wait for Dele before starting Task 2.

---

## Task 2 — Add the archetype detector stub and wire default scoring through it

**Files:**
- Create: `server/src/analyzer/archetype/detect.ts`
- Create: `server/src/analyzer/archetype/detect.test.ts`
- Modify: `server/src/analyzer/scorer/index.ts`

- [ ] **Step 1: Write the failing detector tests**

Create `server/src/analyzer/archetype/detect.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { detectArchetype } from "./detect.js";
import { scoreDeck } from "../scorer/index.js";
import type { Card, ResolvedDeck } from "../../types.js";

function makeCard(name: string, overrides: Partial<Card> = {}): Card {
  return {
    id: name,
    uniqueCardId: `${name}-oracle`,
    scryfall_id: `${name.toLowerCase()}-sf`,
    set: "set",
    set_name: "Set",
    name,
    cn: "1",
    layout: "normal",
    cmc: 2,
    type: "Artifact",
    type_line: "Artifact",
    oracle_text: "",
    mana_cost: "{2}",
    colors: [],
    color_identity: [],
    rarity: "common",
    prices: {},
    ...overrides,
  };
}

const deck: ResolvedDeck = {
  commander: [makeCard("Atraxa, Praetors' Voice", { color_identity: ["W", "U", "B", "G"] })],
  mainboard: [],
  unresolved: [],
  ownedMap: new Map(),
};

describe("detectArchetype", () => {
  it("returns the slice-1 default archetype with low-confidence reasons", () => {
    const result = detectArchetype(deck);

    expect(result.archetype).toBe("midrange/goodstuff");
    expect(result.confidence).toBe("low");
    expect(result.reasons).toContain(
      "Slice 1 uses a conservative detector stub until richer tag density exists.",
    );
  });

  it("is used by scoreDeck when no override is provided", () => {
    const report = scoreDeck(deck);
    expect(report.deckMeta.archetype).toBe("midrange/goodstuff");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
cd server && npm test -- archetype/detect
```

Expected: FAIL because `detect.ts` does not exist yet.

- [ ] **Step 3: Implement the detector stub**

Create `server/src/analyzer/archetype/detect.ts`:

```ts
import type { ResolvedDeck } from "../../types.js";
import type { ArchetypeDetectionResult } from "../types.js";

export function detectArchetype(_deck: ResolvedDeck): ArchetypeDetectionResult {
  return {
    archetype: "midrange/goodstuff",
    confidence: "low",
    reasons: [
      "Slice 1 uses a conservative detector stub until richer tag density exists.",
    ],
  };
}
```

- [ ] **Step 4: Update `scoreDeck` to call the detector when override is absent**

Edit `server/src/analyzer/scorer/index.ts`:

```ts
import { detectArchetype } from "../archetype/detect.js";
```

Replace the `return` block’s archetype line with:

```ts
  const detected = opts.archetypeOverride
    ? { archetype: opts.archetypeOverride }
    : detectArchetype(deck);
```

and then use:

```ts
      archetype: detected.archetype,
```

The relevant section becomes:

```ts
  const detected = opts.archetypeOverride
    ? { archetype: opts.archetypeOverride }
    : detectArchetype(deck);

  return {
    overall,
    axes: { consistency, resilience, interaction, speed },
    deckMeta: {
      commander: deck.commander.map((card) => card.name),
      archetype: detected.archetype,
      colorIdentity: collectColorIdentity(deck),
      cardCount: deck.commander.length + deck.mainboard.reduce((sum, entry) => sum + entry.qty, 0),
      unresolvedCount: deck.unresolved.length,
    },
    generatedAt: new Date().toISOString(),
  };
```

- [ ] **Step 5: Run the tests and build**

Run:

```bash
cd server && npm test -- archetype/detect && npm test -- scorer/index && npm run build
```

Expected: PASS.

- [ ] **Step 6: Pause for Dele to commit**

Stop and present:
- Files changed:
  - `server/src/analyzer/archetype/detect.ts`
  - `server/src/analyzer/archetype/detect.test.ts`
  - `server/src/analyzer/scorer/index.ts`
- Suggested message: `feat(analyzer): add slice-1 archetype detector stub`

Wait for Dele before starting Task 3.

---

## Task 3 — Add `POST /api/deck/score` to the existing deck router

**Files:**
- Modify: `server/src/routes/deck.ts`
- Modify: `server/src/routes/deck.test.ts`

- [ ] **Step 1: Extend the route test with a mocked scorer**

At the top of `server/src/routes/deck.test.ts`, add:

```ts
vi.mock("../analyzer/scorer/index.js", () => ({
  scoreDeck: vi.fn(),
}));
```

Add the import next to the existing imports:

```ts
import { scoreDeck } from "../analyzer/scorer/index.js";
```

Add the mock alias near `mockParse` / `mockResolve`:

```ts
const mockScore = scoreDeck as unknown as ReturnType<typeof vi.fn>;
```

Inside both existing `beforeEach` blocks, add:

```ts
    mockScore.mockReset();
```

- [ ] **Step 2: Add failing `/score` route tests**

Append to `server/src/routes/deck.test.ts`:

```ts
describe("POST /api/deck/score", () => {
  beforeEach(() => {
    mockScore.mockReset();
    mockScore.mockReturnValue({
      overall: 42,
      axes: {
        consistency: { score: 80, grade: "B", subMetrics: [], evidence: [], notes: [] },
        resilience: { score: 0, grade: "F", subMetrics: [], evidence: [], notes: [] },
        interaction: { score: 0, grade: "F", subMetrics: [], evidence: [], notes: [] },
        speed: { score: 0, grade: "F", subMetrics: [], evidence: [], notes: [] },
      },
      deckMeta: {
        commander: ["Atraxa, Praetors' Voice"],
        archetype: "control",
        colorIdentity: ["W", "U", "B", "G"],
        cardCount: 100,
        unresolvedCount: 0,
      },
      generatedAt: "2026-05-12T10:00:00.000Z",
    });
  });

  it("rejects invalid JSON body with 400", async () => {
    const res = await deck.request("/score", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("rejects a body without a valid deck payload", async () => {
    const res = await deck.request("/score", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deck: { commander: "nope" } }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid archetypeOverride", async () => {
    const res = await deck.request("/score", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deck: { commander: [], mainboard: [], unresolved: [], ownedMap: {} },
        archetypeOverride: "burn",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("normalizes ownedMap from object form and forwards override to scoreDeck", async () => {
    const res = await deck.request("/score", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deck: {
          commander: [makeCard("Atraxa, Praetors' Voice")],
          mainboard: [{ card: makeCard("Sol Ring"), qty: 1 }],
          unresolved: [],
          ownedMap: { "sol-ring": 3 },
        },
        archetypeOverride: "control",
      }),
    });

    expect(res.status).toBe(200);
    expect(mockScore).toHaveBeenCalledWith(
      expect.objectContaining({
        commander: [expect.objectContaining({ name: "Atraxa, Praetors' Voice" })],
        mainboard: [expect.objectContaining({ qty: 1 })],
        unresolved: [],
        ownedMap: new Map([["sol-ring", 3]]),
      }),
      { archetypeOverride: "control" },
    );
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run:

```bash
cd server && npm test -- routes/deck
```

Expected: FAIL because `/score` is not implemented yet.

- [ ] **Step 4: Implement route validation + score wiring**

Modify `server/src/routes/deck.ts`.

Add imports:

```ts
import { scoreDeck } from "../analyzer/scorer/index.js";
import type { Archetype } from "../analyzer/types.js";
import type { Card, ParsedDeck, ResolvedDeck } from "../types.js";
```

Replace the existing `import type { ParsedDeck } from "../types.js";` with the line above.

Add these helpers near `isParsedDeck`:

```ts
const VALID_ARCHETYPES: Archetype[] = [
  "aggro/voltron",
  "midrange/goodstuff",
  "control",
  "combo",
  "aristocrats/sacrifice",
  "spellslinger",
  "tokens/go-wide",
  "reanimator/graveyard",
  "lands/landfall",
];

function isCard(value: unknown): value is Card {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.uniqueCardId === "string" &&
    typeof v.scryfall_id === "string" &&
    typeof v.set === "string" &&
    typeof v.set_name === "string" &&
    typeof v.name === "string" &&
    typeof v.cn === "string" &&
    typeof v.layout === "string" &&
    typeof v.cmc === "number" &&
    typeof v.type === "string" &&
    typeof v.type_line === "string" &&
    typeof v.oracle_text === "string" &&
    typeof v.mana_cost === "string" &&
    Array.isArray(v.colors) &&
    Array.isArray(v.color_identity) &&
    typeof v.rarity === "string" &&
    !!v.prices && typeof v.prices === "object"
  );
}

function isResolvedDeckBody(value: unknown): value is {
  commander: Card[];
  mainboard: { card: Card; qty: number }[];
  unresolved: string[];
  ownedMap: Record<string, number>;
} {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.commander) || !v.commander.every(isCard)) return false;
  if (!Array.isArray(v.mainboard)) return false;
  for (const entry of v.mainboard) {
    if (!entry || typeof entry !== "object") return false;
    const e = entry as Record<string, unknown>;
    if (typeof e.qty !== "number" || !isCard(e.card)) return false;
  }
  if (!Array.isArray(v.unresolved) || !v.unresolved.every((s) => typeof s === "string")) return false;
  if (!v.ownedMap || typeof v.ownedMap !== "object" || Array.isArray(v.ownedMap)) return false;
  return Object.values(v.ownedMap as Record<string, unknown>).every((n) => typeof n === "number");
}

function toResolvedDeck(value: {
  commander: Card[];
  mainboard: { card: Card; qty: number }[];
  unresolved: string[];
  ownedMap: Record<string, number>;
}): ResolvedDeck {
  return {
    commander: value.commander,
    mainboard: value.mainboard,
    unresolved: value.unresolved,
    ownedMap: new Map(Object.entries(value.ownedMap)),
  };
}
```

Then append the new route:

```ts
deck.post("/score", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body || typeof body !== "object") {
    return c.json({ error: "Body must be an object" }, 400);
  }

  const v = body as Record<string, unknown>;
  if (!isResolvedDeckBody(v.deck)) {
    return c.json({ error: "deck must be a JSON-serialized ResolvedDeck" }, 400);
  }

  if (
    v.archetypeOverride !== undefined &&
    (typeof v.archetypeOverride !== "string" ||
      !VALID_ARCHETYPES.includes(v.archetypeOverride as Archetype))
  ) {
    return c.json({ error: "archetypeOverride must be a valid Archetype" }, 400);
  }

  try {
    const deckInput = toResolvedDeck(v.deck);
    const result = scoreDeck(deckInput, {
      archetypeOverride: v.archetypeOverride as Archetype | undefined,
    });
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 502);
  }
});
```

- [ ] **Step 5: Run the route tests and build**

Run:

```bash
cd server && npm test -- routes/deck && npm run build
```

Expected: PASS.

- [ ] **Step 6: Pause for Dele to commit**

Stop and present:
- Files changed:
  - `server/src/routes/deck.ts`
  - `server/src/routes/deck.test.ts`
- Suggested message: `feat(deck-route): add POST /api/deck/score with archetype validation`

Wait for Dele before starting Task 4.

---

## Task 4 — Add a minimal consistency-only tagger

**Files:**
- Create: `server/src/analyzer/tags/index.ts`
- Create: `server/src/analyzer/tags/index.test.ts`

- [ ] **Step 1: Write failing tagger tests**

Create `server/src/analyzer/tags/index.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { tagCard } from "./index.js";
import type { Card } from "../../types.js";

function makeCard(name: string, overrides: Partial<Card> = {}): Card {
  return {
    id: name,
    uniqueCardId: `${name}-oracle`,
    scryfall_id: `${name.toLowerCase()}-sf`,
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
    color_identity: [],
    rarity: "common",
    prices: {},
    ...overrides,
  };
}

describe("tagCard", () => {
  it("marks lands from type_line", () => {
    const tags = tagCard(makeCard("Forest", { type: "Land", type_line: "Basic Land — Forest", cmc: 0 }));
    expect(tags.isLand).toBe(true);
    expect(tags.rampScore).toBe(0);
  });

  it("detects obvious mana-rock ramp", () => {
    const tags = tagCard(makeCard("Arcane Signet", {
      type: "Artifact",
      type_line: "Artifact",
      cmc: 2,
      oracle_text: "{T}: Add one mana of any color in your commander's color identity.",
    }));
    expect(tags.rampScore).toBe(1);
    expect(tags.reasons).toContain("ramp: mana production effect");
  });

  it("weights recurring card draw above a cantrip", () => {
    const cantrip = tagCard(makeCard("Sign in Blood", {
      oracle_text: "Target player draws two cards and loses 2 life.",
    }));
    const engine = tagCard(makeCard("Phyrexian Arena", {
      type: "Enchantment",
      type_line: "Enchantment",
      oracle_text: "At the beginning of your upkeep, you draw a card and you lose 1 life.",
    }));
    expect(cantrip.drawScore).toBe(1);
    expect(engine.drawScore).toBe(2);
  });

  it("distinguishes land tutors from broad tutors", () => {
    const landTutor = tagCard(makeCard("Cultivate", {
      oracle_text: "Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.",
    }));
    const broadTutor = tagCard(makeCard("Demonic Tutor", {
      oracle_text: "Search your library for a card, put that card into your hand, then shuffle.",
    }));
    expect(landTutor.tutorScore).toBe(0.5);
    expect(broadTutor.tutorScore).toBe(1.5);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
cd server && npm test -- analyzer/tags
```

Expected: FAIL because the tagger does not exist yet.

- [ ] **Step 3: Implement the minimal tagger**

Create `server/src/analyzer/tags/index.ts`:

```ts
import type { Card } from "../../types.js";
import type { CardTags } from "../types.js";

const DRAW_TRIGGER_RE = /(at the beginning of|whenever|whenever one or more)/i;
const DRAW_RE = /draws? (a|one|two|three|x) cards?/i;
const TUTOR_ANY_RE = /search your library for a card/i;
const TUTOR_NARROW_RE = /search your library for (an? )?(artifact|creature|enchantment|instant|sorcery) card/i;
const TUTOR_LAND_RE = /search your library for .*land card/i;
const MANA_ADD_RE = /add (one mana|\{[WUBRGC]\}|two mana|three mana)/i;
const COST_REDUCER_RE = /spells? you cast cost .* less to cast/i;
const LAND_RAMP_RE = /search your library for .*land card.*put .* onto the battlefield/i;
const MANA_DORK_RE = /^Creature/i;

export function tagCard(card: Card): CardTags {
  const reasons: string[] = [];
  const oracle = card.oracle_text;
  const isLand = /\bLand\b/i.test(card.type_line);

  let rampScore = 0;
  if (!isLand && MANA_ADD_RE.test(oracle)) {
    rampScore = 1;
    reasons.push("ramp: mana production effect");
  } else if (!isLand && LAND_RAMP_RE.test(oracle)) {
    rampScore = 1;
    reasons.push("ramp: land ramp effect");
  } else if (!isLand && MANA_DORK_RE.test(card.type_line) && MANA_ADD_RE.test(oracle)) {
    rampScore = 1;
    reasons.push("ramp: mana dork effect");
  } else if (!isLand && COST_REDUCER_RE.test(oracle)) {
    rampScore = 1;
    reasons.push("ramp: cost reduction effect");
  }

  let drawScore = 0;
  if (DRAW_RE.test(oracle)) {
    drawScore = DRAW_TRIGGER_RE.test(oracle) ? 2 : 1;
    reasons.push(drawScore === 2 ? "draw: recurring engine" : "draw: one-shot draw");
  }

  let tutorScore = 0;
  if (TUTOR_ANY_RE.test(oracle)) {
    tutorScore = 1.5;
    reasons.push("tutor: broad tutor");
  } else if (TUTOR_NARROW_RE.test(oracle)) {
    tutorScore = 1;
    reasons.push("tutor: narrow tutor");
  } else if (TUTOR_LAND_RE.test(oracle)) {
    tutorScore = 0.5;
    reasons.push("tutor: land tutor");
  }

  return {
    isLand,
    rampScore,
    drawScore,
    tutorScore,
    reasons,
  };
}
```

- [ ] **Step 4: Run the tests and build**

Run:

```bash
cd server && npm test -- analyzer/tags && npm run build
```

Expected: PASS.

- [ ] **Step 5: Pause for Dele to commit**

Stop and present:
- Files changed:
  - `server/src/analyzer/tags/index.ts`
  - `server/src/analyzer/tags/index.test.ts`
- Suggested message: `feat(analyzer-tags): add minimal consistency tagger`

Wait for Dele before starting Task 5.

---

## Task 5 — Implement real `Consistency` scoring and wire it into `scoreDeck`

**Files:**
- Create: `server/src/analyzer/scorer/consistency.ts`
- Create: `server/src/analyzer/scorer/consistency.test.ts`
- Modify: `server/src/analyzer/scorer/index.ts`

- [ ] **Step 1: Write failing consistency tests**

Create `server/src/analyzer/scorer/consistency.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { scoreConsistency } from "./consistency.js";
import type { Card, ResolvedDeck } from "../../types.js";

function makeCard(name: string, overrides: Partial<Card> = {}): Card {
  return {
    id: name,
    uniqueCardId: `${name}-oracle`,
    scryfall_id: `${name.toLowerCase()}-sf`,
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
    color_identity: [],
    rarity: "common",
    prices: {},
    ...overrides,
  };
}

function land(name: string): Card {
  return makeCard(name, { cmc: 0, type: "Land", type_line: "Basic Land — Forest" });
}

function weakDeck(): ResolvedDeck {
  return {
    commander: [makeCard("Commander")],
    mainboard: [
      { card: land("Forest"), qty: 30 },
      { card: makeCard("Big Spell", { cmc: 7, mana_cost: "{7}" }), qty: 20 },
    ],
    unresolved: [],
    ownedMap: new Map(),
  };
}

function strongDeck(): ResolvedDeck {
  return {
    commander: [makeCard("Commander")],
    mainboard: [
      { card: land("Forest"), qty: 38 },
      { card: makeCard("Sol Ring", { cmc: 1, type: "Artifact", type_line: "Artifact", oracle_text: "{T}: Add {C}{C}." }), qty: 1 },
      { card: makeCard("Arcane Signet", { cmc: 2, type: "Artifact", type_line: "Artifact", oracle_text: "{T}: Add one mana of any color in your commander's color identity." }), qty: 1 },
      { card: makeCard("Cultivate", { cmc: 3, oracle_text: "Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle." }), qty: 1 },
      { card: makeCard("Night's Whisper", { cmc: 2, oracle_text: "You draw two cards and you lose 2 life." }), qty: 1 },
      { card: makeCard("Phyrexian Arena", { cmc: 3, type: "Enchantment", type_line: "Enchantment", oracle_text: "At the beginning of your upkeep, you draw a card and you lose 1 life." }), qty: 1 },
      { card: makeCard("Demonic Tutor", { cmc: 2, oracle_text: "Search your library for a card, put that card into your hand, then shuffle." }), qty: 1 },
      { card: makeCard("Swords to Plowshares", { cmc: 1, oracle_text: "Exile target creature. Its controller gains life equal to its power." }), qty: 1 },
    ],
    unresolved: [],
    ownedMap: new Map(),
  };
}

describe("scoreConsistency", () => {
  it("returns the expected sub-metric keys", () => {
    const report = scoreConsistency(strongDeck(), "midrange/goodstuff");
    expect(report.subMetrics.map((m) => m.key)).toEqual([
      "ramp.count",
      "draw.density",
      "tutor.count",
      "manabase.size",
      "curve.shape",
    ]);
  });

  it("scores a stronger deck higher than a weak one", () => {
    const weak = scoreConsistency(weakDeck(), "midrange/goodstuff");
    const strong = scoreConsistency(strongDeck(), "midrange/goodstuff");
    expect(strong.score).toBeGreaterThan(weak.score);
  });

  it("records evidence from tagged cards", () => {
    const report = scoreConsistency(strongDeck(), "midrange/goodstuff");
    expect(report.evidence.some((e) => e.card === "Sol Ring" && e.subMetric === "ramp.count")).toBe(true);
    expect(report.evidence.some((e) => e.card === "Phyrexian Arena" && e.subMetric === "draw.density")).toBe(true);
    expect(report.evidence.some((e) => e.card === "Demonic Tutor" && e.subMetric === "tutor.count")).toBe(true);
  });

  it("uses the score-to-grade mapping from the analyzer layer", () => {
    const report = scoreConsistency(strongDeck(), "midrange/goodstuff");
    expect(["F", "D", "C", "B", "A", "S"]).toContain(report.grade);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
cd server && npm test -- scorer/consistency
```

Expected: FAIL because `consistency.ts` does not exist yet.

- [ ] **Step 3: Implement the consistency scorer**

Create `server/src/analyzer/scorer/consistency.ts`:

```ts
import type { ResolvedDeck } from "../../types.js";
import { tagCard } from "../tags/index.js";
import type { Archetype, AxisReport, CardEvidence, SubMetric } from "../types.js";
import { gradeFromScore } from "./index.js";

const TARGETS: Record<Archetype, {
  lands: { min: number; ideal: number; max: number };
  ramp: { min: number; ideal: number; max: number };
  draw: { min: number; ideal: number; max: number };
  tutors: { min: number; ideal: number; max: number };
  avgCmc: number;
}> = {
  "aggro/voltron": { lands: { min: 34, ideal: 36, max: 38 }, ramp: { min: 8, ideal: 10, max: 12 }, draw: { min: 8, ideal: 10, max: 13 }, tutors: { min: 0, ideal: 2, max: 5 }, avgCmc: 2.6 },
  "midrange/goodstuff": { lands: { min: 36, ideal: 38, max: 40 }, ramp: { min: 10, ideal: 12, max: 14 }, draw: { min: 10, ideal: 12, max: 15 }, tutors: { min: 2, ideal: 4, max: 7 }, avgCmc: 3.2 },
  "control": { lands: { min: 36, ideal: 38, max: 41 }, ramp: { min: 8, ideal: 10, max: 12 }, draw: { min: 12, ideal: 15, max: 18 }, tutors: { min: 3, ideal: 5, max: 8 }, avgCmc: 3.0 },
  "combo": { lands: { min: 32, ideal: 34, max: 37 }, ramp: { min: 10, ideal: 13, max: 16 }, draw: { min: 12, ideal: 15, max: 18 }, tutors: { min: 6, ideal: 9, max: 12 }, avgCmc: 2.8 },
  "aristocrats/sacrifice": { lands: { min: 35, ideal: 37, max: 39 }, ramp: { min: 10, ideal: 12, max: 14 }, draw: { min: 10, ideal: 12, max: 15 }, tutors: { min: 2, ideal: 4, max: 7 }, avgCmc: 2.9 },
  "spellslinger": { lands: { min: 36, ideal: 38, max: 40 }, ramp: { min: 10, ideal: 12, max: 14 }, draw: { min: 12, ideal: 15, max: 18 }, tutors: { min: 3, ideal: 5, max: 8 }, avgCmc: 2.7 },
  "tokens/go-wide": { lands: { min: 36, ideal: 38, max: 40 }, ramp: { min: 10, ideal: 12, max: 14 }, draw: { min: 9, ideal: 11, max: 14 }, tutors: { min: 1, ideal: 3, max: 6 }, avgCmc: 3.0 },
  "reanimator/graveyard": { lands: { min: 35, ideal: 37, max: 39 }, ramp: { min: 9, ideal: 11, max: 13 }, draw: { min: 10, ideal: 13, max: 16 }, tutors: { min: 4, ideal: 6, max: 9 }, avgCmc: 3.0 },
  "lands/landfall": { lands: { min: 40, ideal: 43, max: 46 }, ramp: { min: 12, ideal: 15, max: 18 }, draw: { min: 9, ideal: 11, max: 14 }, tutors: { min: 1, ideal: 3, max: 6 }, avgCmc: 2.8 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function scoreAgainstTarget(
  raw: number,
  target: { min: number; ideal: number; max: number },
): number {
  if (raw <= 0) return 0;
  if (raw < target.min) {
    return Math.round((raw / target.min) * 60);
  }
  if (raw <= target.ideal) {
    return Math.round(60 + ((raw - target.min) / Math.max(1, target.ideal - target.min)) * 40);
  }
  if (raw <= target.max) {
    return 100;
  }
  const headroom = Math.max(1, Math.round(target.max * 0.5));
  const overflow = raw - target.max;
  return Math.round(clamp(100 - (overflow / headroom) * 40, 60, 100));
}

function avgCmcScore(rawAvgCmc: number, idealAvgCmc: number): number {
  const diff = Math.abs(rawAvgCmc - idealAvgCmc);
  return Math.round(clamp(100 - diff * 35, 0, 100));
}

export function scoreConsistency(deck: ResolvedDeck, archetype: Archetype): AxisReport {
  const target = TARGETS[archetype];
  const weightedEntries: Array<{ subMetric: SubMetric; weight: number }> = [];
  const evidence: CardEvidence[] = [];

  let landCount = 0;
  let rampRaw = 0;
  let drawRaw = 0;
  let tutorRaw = 0;
  let nonlandQty = 0;
  let nonlandCmcTotal = 0;

  const rampCards = new Set<string>();
  const drawCards = new Set<string>();
  const tutorCards = new Set<string>();
  const landCards = new Set<string>();

  for (const entry of deck.mainboard) {
    const tags = tagCard(entry.card);
    if (tags.isLand) {
      landCount += entry.qty;
      landCards.add(entry.card.name);
    } else {
      nonlandQty += entry.qty;
      nonlandCmcTotal += entry.card.cmc * entry.qty;
    }

    if (tags.rampScore > 0) {
      rampRaw += tags.rampScore * entry.qty;
      rampCards.add(entry.card.name);
      evidence.push({
        card: entry.card.name,
        axis: "C",
        subMetric: "ramp.count",
        contribution: tags.rampScore * entry.qty,
        reason: tags.reasons.find((r) => r.startsWith("ramp:")) ?? "ramp contribution",
      });
    }

    if (tags.drawScore > 0) {
      drawRaw += tags.drawScore * entry.qty;
      drawCards.add(entry.card.name);
      evidence.push({
        card: entry.card.name,
        axis: "C",
        subMetric: "draw.density",
        contribution: tags.drawScore * entry.qty,
        reason: tags.reasons.find((r) => r.startsWith("draw:")) ?? "draw contribution",
      });
    }

    if (tags.tutorScore > 0) {
      tutorRaw += tags.tutorScore * entry.qty;
      tutorCards.add(entry.card.name);
      evidence.push({
        card: entry.card.name,
        axis: "C",
        subMetric: "tutor.count",
        contribution: tags.tutorScore * entry.qty,
        reason: tags.reasons.find((r) => r.startsWith("tutor:")) ?? "tutor contribution",
      });
    }
  }

  const avgCmc = nonlandQty > 0 ? nonlandCmcTotal / nonlandQty : 0;

  const subMetrics: SubMetric[] = [
    {
      key: "ramp.count",
      label: "Ramp pieces",
      raw: Number(rampRaw.toFixed(2)),
      target: target.ramp,
      score: scoreAgainstTarget(rampRaw, target.ramp),
      weight: 0.2,
      contributingCards: [...rampCards],
    },
    {
      key: "draw.density",
      label: "Card-draw density",
      raw: Number(drawRaw.toFixed(2)),
      target: target.draw,
      score: scoreAgainstTarget(drawRaw, target.draw),
      weight: 0.25,
      contributingCards: [...drawCards],
    },
    {
      key: "tutor.count",
      label: "Tutors",
      raw: Number(tutorRaw.toFixed(2)),
      target: target.tutors,
      score: scoreAgainstTarget(tutorRaw, target.tutors),
      weight: 0.1,
      contributingCards: [...tutorCards],
    },
    {
      key: "manabase.size",
      label: "Land count",
      raw: landCount,
      target: target.lands,
      score: scoreAgainstTarget(landCount, target.lands),
      weight: 0.2,
      contributingCards: [...landCards],
    },
    {
      key: "curve.shape",
      label: "Mana curve health",
      raw: Number(avgCmc.toFixed(2)),
      target: { min: target.avgCmc - 0.4, ideal: target.avgCmc, max: target.avgCmc + 0.4 },
      score: avgCmcScore(avgCmc, target.avgCmc),
      weight: 0.1,
      contributingCards: [],
    },
  ];

  const weightedScore = subMetrics.reduce((sum, item) => sum + item.score * item.weight, 0);
  const totalWeight = subMetrics.reduce((sum, item) => sum + item.weight, 0);
  const score = Math.round(weightedScore / totalWeight);

  const notes: string[] = [];
  if (landCount < target.lands.min) {
    notes.push(`Land count is below the ${archetype} minimum target.`);
  }
  if (drawRaw < target.draw.min) {
    notes.push(`Card-draw density is below the ${archetype} minimum target.`);
  }
  if (rampRaw < target.ramp.min) {
    notes.push(`Ramp density is below the ${archetype} minimum target.`);
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

- [ ] **Step 4: Wire real consistency scoring into `scoreDeck`**

Edit `server/src/analyzer/scorer/index.ts`.

Add import:

```ts
import { scoreConsistency } from "./consistency.js";
```

Replace the current consistency stub assignment:

```ts
  const consistency = makeStubAxis();
```

with:

```ts
  const consistency = scoreConsistency(deck, detected.archetype);
```

Move `detected` so it is defined before the axis calculations. The relevant top half becomes:

```ts
  const detected = opts.archetypeOverride
    ? { archetype: opts.archetypeOverride }
    : detectArchetype(deck);

  const consistency = scoreConsistency(deck, detected.archetype);
  const resilience = makeStubAxis();
  const interaction = makeStubAxis();
  const speed = makeStubAxis();
```

- [ ] **Step 5: Strengthen the top-level scorer test**

Append to `server/src/analyzer/scorer/index.test.ts`:

```ts
  it("keeps the full-report contract while only consistency is implemented", () => {
    const report = scoreDeck(makeDeck(), { archetypeOverride: "control" });

    expect(report.axes.consistency.subMetrics.length).toBeGreaterThan(0);
    expect(report.axes.consistency.score).toBeGreaterThanOrEqual(0);
    expect(report.axes.resilience.score).toBe(0);
    expect(report.axes.interaction.score).toBe(0);
    expect(report.axes.speed.score).toBe(0);
    expect(report.overall).toBe(Math.round(report.axes.consistency.score / 4));
  });
```

- [ ] **Step 6: Run tests and build**

Run:

```bash
cd server && npm test -- scorer/consistency && npm test -- scorer/index && npm run build
```

Expected: PASS.

- [ ] **Step 7: Pause for Dele to commit**

Stop and present:
- Files changed:
  - `server/src/analyzer/scorer/consistency.ts`
  - `server/src/analyzer/scorer/consistency.test.ts`
  - `server/src/analyzer/scorer/index.ts`
  - `server/src/analyzer/scorer/index.test.ts`
- Suggested message: `feat(crispi): implement consistency scoring in scoreDeck`

Wait for Dele before starting Task 6.

---

## Task 6 — Final verification sweep for the backend consistency slice

**Files:**
- Verify only; no new files required unless fixes are needed.

- [ ] **Step 1: Run the full server test suite**

Run:

```bash
cd server && npm test
```

Expected: all existing route/service tests plus the new analyzer tests pass.

- [ ] **Step 2: Run the server build**

Run:

```bash
cd server && npm run build
```

Expected: zero TypeScript errors.

- [ ] **Step 3: Optional manual contract probe with a small JSON body**

If you want a quick manual sanity check after the automated suite, start the server and POST a resolved-deck JSON body to `/api/deck/score`. The payload should send `ownedMap` as an object, not a `Map`.

Example body:

```json
{
  "deck": {
    "commander": [],
    "mainboard": [],
    "unresolved": [],
    "ownedMap": {}
  },
  "archetypeOverride": "control"
}
```

Expected: HTTP 200 with a full `CrispiReport` JSON shape.

- [ ] **Step 4: Pause for Dele to commit**

Stop and present:
- Files changed: all analyzer/route files touched in Tasks 1–5
- Suggested message: `feat(crispi): add backend score endpoint with consistency slice`

Wait for Dele.

---

## Self-review checklist

- [ ] `/api/deck/score` stays inside the existing `deck` router
- [ ] Route accepts JSON-serialized `ResolvedDeck` and reconstructs `ownedMap: Map<string, number>` internally
- [ ] `archetypeOverride` is optional and validated against the exact `Archetype` union
- [ ] `scoreDeck()` returns the full `CrispiReport` contract even though only `Consistency` is real
- [ ] `overall` remains the mean of all 4 axis scores, so the contract stays spec-aligned
- [ ] `Consistency` includes only the agreed first-slice sub-metrics
- [ ] No client changes or new dependencies
- [ ] All verification commands are server-scoped and explicit

---

## Execution handoff

Recommended execution mode for this plan: **Inline Execution** via `superpowers:executing-plans`, because the tasks share files and build on one another.
