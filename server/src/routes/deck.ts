import { Hono } from "hono";
import { scoreDeck } from "../analyzer/scorer/index.js";
import type { Archetype } from "../analyzer/types.js";
import { parseDeck } from "../services/deck-parser.js";
import { resolveDeck } from "../services/deck-resolver.js";
import { MoxfieldError } from "../services/library.js";
import type { Card, ParsedDeck, ResolvedDeck } from "../types.js";

const deck = new Hono();

interface ParseBody {
  source?: unknown;
  payload?: unknown;
}

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

function isParsedDeck(value: unknown): value is ParsedDeck {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.source !== "manual" && v.source !== "moxfield") return false;
  if (!Array.isArray(v.commander) || !v.commander.every((s) => typeof s === "string")) return false;
  if (!Array.isArray(v.mainboard)) return false;
  for (const entry of v.mainboard) {
    if (!entry || typeof entry !== "object") return false;
    const e = entry as Record<string, unknown>;
    if (typeof e.name !== "string" || typeof e.qty !== "number") return false;
  }
  if (!Array.isArray(v.unresolved) || !v.unresolved.every((s) => typeof s === "string")) return false;
  return true;
}

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

deck.post("/parse", async (c) => {
  let body: ParseBody;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (body.source !== "manual" && body.source !== "moxfield") {
    return c.json({ error: 'source must be "manual" or "moxfield"' }, 400);
  }
  if (typeof body.payload !== "string") {
    return c.json({ error: "payload must be a string" }, 400);
  }

  const token = process.env.MOXFIELD_TOKEN ?? "";
  if (body.source === "moxfield" && token === "") {
    return c.json({ error: "Server missing MOXFIELD_TOKEN" }, 500);
  }

  try {
    const result = await parseDeck({
      source: body.source,
      payload: body.payload,
      token,
    });
    return c.json(result);
  } catch (err) {
    if (err instanceof MoxfieldError) {
      return c.json({ error: err.message }, err.status as 400 | 401 | 502);
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 502);
  }
});

deck.post("/resolve", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!isParsedDeck(body)) {
    return c.json({ error: "Body must be a ParsedDeck" }, 400);
  }

  const token = process.env.MOXFIELD_TOKEN ?? "";
  if (token === "") {
    return c.json({ error: "Server missing MOXFIELD_TOKEN" }, 500);
  }

  try {
    const result = await resolveDeck(body, { token });
    const ownedMapObj: Record<string, number> = {};
    for (const [k, v] of result.ownedMap) ownedMapObj[k] = v;
    return c.json({
      commander: result.commander,
      mainboard: result.mainboard,
      unresolved: result.unresolved,
      ownedMap: ownedMapObj,
    });
  } catch (err) {
    if (err instanceof MoxfieldError) {
      return c.json({ error: err.message }, err.status as 400 | 401 | 502);
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 502);
  }
});

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

export { deck };
