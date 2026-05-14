import { Hono } from "hono";
import type { CollectionItem, MtgColor, OwnedLibrary } from "../types.js";
import { MTG_COLORS } from "../types.js";
import { getOwnedLibrary, MoxfieldError } from "../services/library.js";
import { createScryfallCache } from "../services/scryfall-cache.js";

const VALID_COLORS = new Set<string>(Object.keys(MTG_COLORS));
const DEFAULT_FINISH = "Normal";

/** Filter collection items by color identity subset. */
export function filterByColorIdentity(
  items: CollectionItem[],
  allowedColors: MtgColor[],
  includeColorless: boolean,
): CollectionItem[] {
  return items.filter((item) => {
    const identity = item.card.color_identity;
    const isColorless = identity.length === 0;
    const isSubset =
      allowedColors.length > 0 &&
      identity.length > 0 &&
      identity.every((color) => allowedColors.includes(color as MtgColor));

    if (includeColorless && isColorless) return true;
    if (isSubset) return true;
    // When colors are selected but colorless flag is off, still include colorless
    // to preserve original behavior
    if (allowedColors.length > 0 && isColorless) return true;
    return false;
  });
}

/** Map a collection item to the API response shape. */
export function mapCardResponse(item: CollectionItem) {
  return {
    name: item.card.name,
    scryfall_id: item.card.scryfall_id,
    mana_cost: item.card.mana_cost,
    type_line: item.card.type_line,
    oracle_text: item.card.oracle_text,
    color_identity: item.card.color_identity,
    cmc: item.card.cmc,
    rarity: item.card.rarity,
    set_name: item.card.set_name,
    power: item.card.power,
    toughness: item.card.toughness,
    quantity: item.quantity,
    prices: item.card.prices,
    set_code: item.card.set,
    collector_number: item.card.cn,
    finish: String(item.finish ?? DEFAULT_FINISH),
  };
}

const collection = new Hono();
const scryfallCache = createScryfallCache({ missTtlMs: 7 * 24 * 60 * 60 * 1000 });

/**
 * POST /api/collection
 * Body: { colors: MtgColor[], colorless?: boolean }
 *
 * Proxies the request to Moxfield, filters by color identity,
 * and returns the filtered card list.
 */
collection.post("/", async (c) => {
  let body: { colors?: unknown; colorless?: unknown };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const token = process.env.MOXFIELD_TOKEN;
  if (!token) {
    return c.json({ error: "Server missing MOXFIELD_TOKEN" }, 500);
  }

  // Validate colors input against known MtgColor values
  const rawColors = Array.isArray(body.colors) ? body.colors : [];
  const colors: MtgColor[] = [];
  for (const color of rawColors) {
    if (typeof color !== "string" || !VALID_COLORS.has(color)) {
      return c.json(
        { error: `Invalid color: "${String(color)}". Valid values: ${[...VALID_COLORS].join(", ")}` },
        400
      );
    }
    colors.push(color as MtgColor);
  }

  const includeColorless = body.colorless === true;

  if (colors.length === 0 && !includeColorless) {
    return c.json({ error: "Select at least one color or Colorless" }, 400);
  }

  const refresh = c.req.query("refresh") === "true";

  let totalResults: number;
  let allItems: CollectionItem[];
  let library: OwnedLibrary;
  try {
    const result = await getOwnedLibrary({ token, refresh });
    library = result.library;
    totalResults = result.totalResults;
    allItems = [];
    for (const owned of library.values()) {
      allItems.push(...owned.printings);
    }
  } catch (err) {
    if (err instanceof MoxfieldError) {
      return c.json({ error: err.message }, err.status as 400 | 401 | 502);
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 502);
  }

  const nowIso = new Date().toISOString();
  const seenNames = new Set<string>();
  for (const item of allItems) {
    const exactName = item.card.name;
    if (seenNames.has(exactName)) continue;
    seenNames.add(exactName);

    const owned = library.get(exactName);
    scryfallCache.upsertCollectionCard({
      cardNameExact: exactName,
      card: item.card,
      quantityTotal: owned?.totalQty ?? item.quantity,
      finish: item.finish != null ? String(item.finish) : null,
      sourceSetCode: item.card.set,
      sourceCollectorNumber: item.card.cn,
      nowIso,
    });
  }
  console.log(`[collection-cache] upsert batch ${seenNames.size}`);

  const filtered = filterByColorIdentity(allItems, colors, includeColorless);

  return c.json({
    totalResults,
    filteredCount: filtered.length,
    cards: filtered.map(mapCardResponse),
  });
});

export { collection };
