import { Hono } from "hono";
import { parseDeck } from "../services/deck-parser.js";
import { MoxfieldError } from "../services/library.js";

const deck = new Hono();

interface ParseBody {
  source?: unknown;
  payload?: unknown;
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

export { deck };
