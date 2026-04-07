import { Hono } from "hono";
import type { CollectionItem, CollectionResponse, MtgColor } from "../types.js";
import { MTG_COLORS } from "../types.js";

const MOXFIELD_API = "https://api2.moxfield.com/v1/collections/search";
const VALID_COLORS = new Set<string>(Object.keys(MTG_COLORS));
const DEFAULT_FINISH = "Normal";
const PAGE_SIZE = 5000;
const MAX_PAGES = 10; // Safety cap: 50,000 cards max

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

/** Fetch a single page from the Moxfield collection API. */
async function fetchPage(
  token: string,
  page: number,
): Promise<{ data: CollectionResponse } | { error: string; status: number }> {
  const params = new URLSearchParams({
    q: "",
    setId: "",
    deckId: "",
    rarity: "",
    condition: "",
    game: "",
    cardLanguageId: "",
    finish: "",
    isAlter: "",
    isProxy: "",
    tradeBinderId: "none",
    playStyle: "paperDollars",
    pricingProvider: "cardkingdom",
    priceMinimum: "",
    priceMaximum: "",
    pageNumber: String(page),
    pageSize: String(PAGE_SIZE),
    sortType: "cardName",
    sortDirection: "ascending",
  });

  let response: Response;

  try {
    response = await fetch(`${MOXFIELD_API}?${params}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": "moxfield-app/1.0",
      },
      redirect: "follow",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown network error";
    return { error: `Failed to reach Moxfield API: ${message}`, status: 502 };
  }

  if (!response.ok) {
    const status = response.status;
    if (status === 401 || status === 403) {
      return { error: "Invalid or expired auth token", status: 401 };
    }
    return { error: `Moxfield API error: ${status} ${response.statusText}`, status: 502 };
  }

  let data: CollectionResponse;

  try {
    data = (await response.json()) as CollectionResponse;
  } catch {
    return { error: "Moxfield API returned invalid JSON", status: 502 };
  }

  if (!Array.isArray(data?.data)) {
    return { error: "Unexpected response structure from Moxfield API", status: 502 };
  }

  return { data };
}

const collection = new Hono();

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

  // Fetch all pages from Moxfield API
  const allItems: CollectionItem[] = [];
  let totalResults = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await fetchPage(token, page);

    if ("error" in result) {
      return c.json({ error: result.error }, result.status as 400);
    }

    const { data } = result;
    totalResults = data.totalResults;
    allItems.push(...data.data);

    // Stop if we've fetched all pages
    if (page >= data.totalPages) break;
  }

  const filtered = filterByColorIdentity(allItems, colors, includeColorless);

  return c.json({
    totalResults,
    filteredCount: filtered.length,
    cards: filtered.map(mapCardResponse),
  });
});

export { collection };
