import type { Card, OwnedLibrary } from "../types.js";
import { MoxfieldError } from "./library.js";

const MOXFIELD_SEARCH_API = "https://api2.moxfield.com/v2/cards/search/user";

// Process-lifetime cache. Indefinite TTL — Oracle text is stable.
// Key = exact card name (case-sensitive). Value = Card or null (negative cache).
const cardCache = new Map<string, Card | null>();

/**
 * Verified against a live probe on 2026-05-12:
 * - endpoint: GET https://api2.moxfield.com/v2/cards/search/user?q=<raw name>&page=1
 * - response shape: { hasMore, totalCards, data, ownedCards }
 * - `data` is an array of card-shaped objects compatible with our `Card` type
 * - results may be fuzzy, so exact `name` match is preferred over the first hit
 */
interface MoxfieldSearchResponse {
  data?: Card[];
}

/** Test-only: drop the entire card cache. */
export function clearCardCache(): void {
  cardCache.clear();
}

async function searchMoxfield(name: string, token: string): Promise<Card | null> {
  const url = `${MOXFIELD_SEARCH_API}?q=${encodeURIComponent(name)}&page=1`;

  let response: Response;
  try {
    response = await fetch(url, {
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
    throw new MoxfieldError(`Failed to reach Moxfield API: ${message}`, 502);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new MoxfieldError("Invalid or expired auth token", 401);
    }
    throw new MoxfieldError(
      `Moxfield API error: ${response.status} ${response.statusText}`,
      502,
    );
  }

  let data: MoxfieldSearchResponse;
  try {
    data = (await response.json()) as MoxfieldSearchResponse;
  } catch {
    throw new MoxfieldError("Moxfield API returned invalid JSON", 502);
  }

  const results = Array.isArray(data?.data) ? data.data : [];
  if (results.length === 0) return null;

  const exact = results.find((card) => card?.name === name);
  return exact ?? results[0] ?? null;
}

/**
 * Resolve a card name to a `Card`, or `null` if unresolvable.
 * Lookup order: owned library → process cache → Moxfield card search.
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

  const found = await searchMoxfield(name, opts.token);
  cardCache.set(name, found);
  return found;
}
