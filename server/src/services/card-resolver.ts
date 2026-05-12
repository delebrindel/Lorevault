import type { Card, OwnedLibrary } from "../types.js";
import { MoxfieldError } from "./library.js";

const SCRYFALL_NAMED_API = "https://api.scryfall.com/cards/named";

// Process-lifetime cache. Indefinite TTL — Oracle text is stable.
// Key = exact requested card name (case-sensitive). Value = Card or null (negative cache).
const cardCache = new Map<string, Card | null>();

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

/** Test-only: drop the entire card cache. */
export function clearCardCache(): void {
  cardCache.clear();
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

async function searchScryfall(name: string): Promise<Card | null> {
  const exact = await fetchNamed(name, "exact");
  if (exact) return exact;
  return fetchNamed(name, "fuzzy");
}

/**
 * Resolve a card name to a `Card`, or `null` if unresolvable.
 * Lookup order: owned library → process cache → Scryfall exact/fuzzy lookup.
 */
export async function resolveCard(
  name: string,
  opts: { library: OwnedLibrary; token: string },
): Promise<Card | null> {
  const owned = opts.library.get(name);
  if (owned && owned.printings[0]) {
    return owned.printings[0].card;
  }

  if (cardCache.has(name)) {
    return cardCache.get(name) ?? null;
  }

  const found = await searchScryfall(name);
  cardCache.set(name, found);
  return found;
}
