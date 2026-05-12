import type { CollectionItem, CollectionResponse, OwnedCard, OwnedLibrary } from "../types.js";

const MOXFIELD_API = "https://api2.moxfield.com/v1/collections/search";
const PAGE_SIZE = 5000;
const MAX_PAGES = 10;

const DEFAULT_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  result: OwnedLibraryResult;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Thrown when Moxfield returns a non-OK response or invalid payload. */
export class MoxfieldError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "MoxfieldError";
  }
}

export interface GetOwnedLibraryOptions {
  token: string;
  /** Cache TTL in ms. `0` disables caching. Default 600_000 (10 min). */
  ttlMs?: number;
  /** When true, bypass cache and force a fresh fetch. */
  refresh?: boolean;
}

export interface OwnedLibraryResult {
  library: OwnedLibrary;
  /** Last-page-reported total from the Moxfield API. */
  totalResults: number;
}

/** Test helper. Clears the in-memory cache. */
export function clearLibraryCache(): void {
  cache.clear();
}

function buildPageUrl(page: number): string {
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
  return `${MOXFIELD_API}?${params}`;
}

async function fetchPage(token: string, page: number): Promise<CollectionResponse> {
  let response: Response;
  try {
    response = await fetch(buildPageUrl(page), {
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

  let data: CollectionResponse;
  try {
    data = (await response.json()) as CollectionResponse;
  } catch {
    throw new MoxfieldError("Moxfield API returned invalid JSON", 502);
  }

  if (!Array.isArray(data?.data)) {
    throw new MoxfieldError("Unexpected response structure from Moxfield API", 502);
  }
  return data;
}

function groupByName(items: CollectionItem[]): OwnedLibrary {
  const lib: OwnedLibrary = new Map();
  for (const item of items) {
    const existing = lib.get(item.card.name);
    if (existing) {
      existing.printings.push(item);
      existing.totalQty += item.quantity;
    } else {
      const owned: OwnedCard = {
        name: item.card.name,
        printings: [item],
        totalQty: item.quantity,
      };
      lib.set(item.card.name, owned);
    }
  }
  return lib;
}

export async function getOwnedLibrary(opts: GetOwnedLibraryOptions): Promise<OwnedLibraryResult> {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const now = Date.now();

  if (!opts.refresh && ttlMs > 0) {
    const hit = cache.get(opts.token);
    if (hit && hit.expiresAt > now) {
      return hit.result;
    }
  }

  const result = await fetchAllPages(opts.token);

  if (ttlMs > 0) {
    cache.set(opts.token, { result, expiresAt: now + ttlMs });
  }

  return result;
}

async function fetchAllPages(token: string): Promise<OwnedLibraryResult> {
  const all: CollectionItem[] = [];
  const first = await fetchPage(token, 1);
  all.push(...first.data);
  let totalResults = first.totalResults;

  const lastPage = Math.min(first.totalPages, MAX_PAGES);
  for (let page = 2; page <= lastPage; page++) {
    const next = await fetchPage(token, page);
    all.push(...next.data);
    totalResults = next.totalResults;
  }
  return { library: groupByName(all), totalResults };
}
