import type { Card, OwnedLibrary } from "../types.js";
import { MoxfieldError } from "./library.js";
import { createScryfallCache } from "./scryfall-cache.js";

const SCRYFALL_NAMED_API = "https://api.scryfall.com/cards/named";
const SCRYFALL_MIN_INTERVAL_MS = 110;
const SCRYFALL_MAX_429_RETRIES = 1;
const SCRYFALL_DEFAULT_RETRY_MS = 1_000;
const SCRYFALL_MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Process-lifetime cache. Indefinite TTL — Oracle text is stable.
// Key = exact requested card name (case-sensitive). Value = Card or null (negative cache).
const cardCache = new Map<string, Card | null>();
const scryfallCache = createScryfallCache({ missTtlMs: SCRYFALL_MISS_TTL_MS });
let nextScryfallRequestAt = 0;

/**
 * Verified against live Scryfall probes on 2026-05-12:
 * - exact lookup: GET https://api.scryfall.com/cards/named?exact=<name>
 * - fuzzy lookup: GET https://api.scryfall.com/cards/named?fuzzy=<name>
 * - success shape: object="card"
 * - not-found shape: HTTP 404 with object="error"
 * - mapping: scryfall `id` -> `scryfall_id`, `oracle_id ?? id` -> `uniqueCardId`,
 *   `collector_number` -> `cn`, `type_line` -> both `type` and `type_line`,
 *   string price fields -> numeric `CardPrices`
 */
interface ScryfallCardLike {
  object: "card";
  id: string;
  oracle_id?: string;
  name: string;
  set: string;
  set_name: string;
  collector_number: string;
  layout: string;
  cmc: number;
  type_line: string;
  oracle_text?: string;
  mana_cost?: string;
  power?: string;
  toughness?: string;
  colors?: string[];
  color_identity?: string[];
  rarity: string;
  prices?: {
    usd?: string | null;
    usd_foil?: string | null;
    eur?: string | null;
    eur_foil?: string | null;
    tix?: string | null;
  };
}

/** Test-only: drop the entire card cache and pacing state. */
export function clearCardCache(): void {
  cardCache.clear();
  nextScryfallRequestAt = 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForScryfallSlot(): Promise<void> {
  const now = Date.now();
  const waitMs = Math.max(0, nextScryfallRequestAt - now);
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  nextScryfallRequestAt = Date.now() + SCRYFALL_MIN_INTERVAL_MS;
}

function getRetryAfterMs(response: Response): number {
  const header = response.headers.get("Retry-After");
  if (!header) return SCRYFALL_DEFAULT_RETRY_MS;

  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const retryAt = Date.parse(header);
  if (Number.isFinite(retryAt)) {
    return Math.max(0, retryAt - Date.now());
  }

  return SCRYFALL_DEFAULT_RETRY_MS;
}

function toNumber(value?: string | null): number | undefined {
  if (value == null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function mapScryfallCard(card: ScryfallCardLike): Card {
  return {
    id: card.id,
    uniqueCardId: card.oracle_id ?? card.id,
    scryfall_id: card.id,
    set: card.set,
    set_name: card.set_name,
    name: card.name,
    cn: card.collector_number,
    layout: card.layout,
    cmc: card.cmc,
    type: card.type_line,
    type_line: card.type_line,
    oracle_text: card.oracle_text ?? "",
    mana_cost: card.mana_cost ?? "",
    power: card.power,
    toughness: card.toughness,
    colors: card.colors ?? [],
    color_identity: card.color_identity ?? [],
    rarity: card.rarity,
    prices: {
      usd: toNumber(card.prices?.usd),
      usd_foil: toNumber(card.prices?.usd_foil),
      eur: toNumber(card.prices?.eur),
      eur_foil: toNumber(card.prices?.eur_foil),
      tix: toNumber(card.prices?.tix),
    },
  };
}

async function fetchNamed(name: string, mode: "exact" | "fuzzy"): Promise<Card | null> {
  const url = `${SCRYFALL_NAMED_API}?${mode}=${encodeURIComponent(name)}`;

  for (let attempt = 0; attempt <= SCRYFALL_MAX_429_RETRIES; attempt++) {
    await waitForScryfallSlot();

    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "lorevault/1.0",
        },
        redirect: "follow",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown network error";
      throw new MoxfieldError(`Failed to reach Scryfall API: ${message}`, 502);
    }

    if (response.status === 404) {
      return null;
    }

    if (response.status === 429 && attempt < SCRYFALL_MAX_429_RETRIES) {
      await sleep(getRetryAfterMs(response));
      continue;
    }

    if (!response.ok) {
      throw new MoxfieldError(
        `Scryfall API error: ${response.status} ${response.statusText}`,
        502,
      );
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new MoxfieldError("Scryfall API returned invalid JSON", 502);
    }

    if (!data || typeof data !== "object" || (data as { object?: string }).object !== "card") {
      throw new MoxfieldError("Unexpected response structure from Scryfall API", 502);
    }

    return mapScryfallCard(data as ScryfallCardLike);
  }

  throw new MoxfieldError("Scryfall API error: 429 Too Many Requests", 502);
}

async function searchScryfall(
  name: string,
): Promise<{ card: Card | null; resolutionMode: "exact" | "fuzzy" | null }> {
  const exact = await fetchNamed(name, "exact");
  if (exact) return { card: exact, resolutionMode: "exact" };

  const fuzzy = await fetchNamed(name, "fuzzy");
  if (fuzzy) return { card: fuzzy, resolutionMode: "fuzzy" };

  return { card: null, resolutionMode: null };
}

/**
 * Resolve a card name to a `Card`, or `null` if unresolvable.
 * Lookup order: owned library → collection cache → process cache → SQLite Scryfall cache → live Scryfall.
 */
export async function resolveCard(
  name: string,
  opts: { library: OwnedLibrary; token: string },
): Promise<Card | null> {
  const owned = opts.library.get(name);
  if (owned && owned.printings[0]) {
    return owned.printings[0].card;
  }

  const collectionCached = scryfallCache.lookupCollectionCard(name);
  if (collectionCached) {
    console.log(`[collection-cache] hit ${name}`);
    cardCache.set(name, collectionCached.card);
    return collectionCached.card;
  }

  if (cardCache.has(name)) {
    return cardCache.get(name) ?? null;
  }

  const nowIso = new Date().toISOString();
  const cached = scryfallCache.lookup(name, nowIso);

  if (cached?.kind === "hit") {
    console.log(`[scryfall-cache] hit ${name} (${cached.source})`);
    cardCache.set(name, cached.card);
    return cached.card;
  }

  if (cached?.kind === "miss" && !cached.stale) {
    console.log(`[scryfall-cache] miss ${name} (fresh)`);
    cardCache.set(name, null);
    return null;
  }

  if (cached?.kind === "miss" && cached.stale) {
    console.log(`[scryfall-cache] miss ${name} (stale -> refresh)`);
  } else {
    console.log(`[scryfall-cache] miss ${name} (lookup)`);
  }

  const found = await searchScryfall(name);

  if (found.card) {
    scryfallCache.storeHit({
      requestedName: name,
      resolutionMode: found.resolutionMode ?? "exact",
      card: found.card,
      nowIso: new Date().toISOString(),
    });
    console.log(`[scryfall-cache] store hit ${name} (${found.resolutionMode})`);
    cardCache.set(name, found.card);
    return found.card;
  }

  scryfallCache.storeMiss({
    requestedName: name,
    nowIso: new Date().toISOString(),
  });
  console.log(`[scryfall-cache] store miss ${name}`);
  cardCache.set(name, null);
  return null;
}
