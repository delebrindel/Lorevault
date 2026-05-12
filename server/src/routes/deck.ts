import { Hono } from "hono";
import { parseDeck } from "../services/deck-parser.js";
import { resolveDeck } from "../services/deck-resolver.js";
import { MoxfieldError } from "../services/library.js";
import type { ParsedDeck } from "../types.js";

const deck = new Hono();

interface ParseBody {
  source?: unknown;
  payload?: unknown;
}

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

export { deck };
