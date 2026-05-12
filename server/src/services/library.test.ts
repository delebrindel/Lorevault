import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Card, CollectionItem } from "../types.js";
import { clearLibraryCache, getOwnedLibrary, MoxfieldError } from "./library.js";

const TOKEN = "test-token";

/** Build a CollectionItem matching the project Card shape. */
function makeItem(
  overrides: Partial<Card> & { name: string },
  quantity = 1,
  id = `item-${overrides.name}`,
  finish?: string,
): CollectionItem {
  return {
    id,
    quantity,
    condition: "NearMint",
    finish,
    card: {
      id: `card-${overrides.name}`,
      uniqueCardId: `uid-${overrides.name}`,
      scryfall_id: overrides.scryfall_id ?? `sf-${overrides.name}`,
      set: overrides.set ?? "set",
      set_name: overrides.set_name ?? "Test Set",
      name: overrides.name,
      cn: overrides.cn ?? "1",
      layout: overrides.layout ?? "normal",
      cmc: overrides.cmc ?? 1,
      type: overrides.type ?? "Creature",
      type_line: overrides.type_line ?? "Creature — Human",
      oracle_text: overrides.oracle_text ?? "",
      mana_cost: overrides.mana_cost ?? "{1}",
      power: overrides.power,
      toughness: overrides.toughness,
      colors: overrides.colors ?? [],
      color_identity: overrides.color_identity ?? [],
      rarity: overrides.rarity ?? "common",
      prices: overrides.prices ?? {},
    },
  };
}

function pageResponse(items: CollectionItem[], totalPages = 1, totalResults = items.length) {
  return new Response(
    JSON.stringify({
      pageNumber: 1,
      pageSize: 5000,
      totalResults,
      totalPages,
      data: items,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("getOwnedLibrary", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearLibraryCache();
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("fetches a single page and returns an OwnedLibrary keyed by name", async () => {
    fetchSpy.mockResolvedValue(pageResponse([makeItem({ name: "Sol Ring" })]));

    const { library, totalResults } = await getOwnedLibrary({ token: TOKEN, ttlMs: 0 });

    expect(library.size).toBe(1);
    const sol = library.get("Sol Ring");
    expect(sol).toBeDefined();
    expect(sol!.totalQty).toBe(1);
    expect(sol!.printings).toHaveLength(1);
    expect(totalResults).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Verify the request shape matches the existing Moxfield contract.
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain("https://api2.moxfield.com/v1/collections/search");
    expect(String(url)).toContain("pageNumber=1");
    expect(String(url)).toContain("pageSize=5000");
    expect((init as RequestInit).method).toBe("GET");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("walks all pages until totalPages is reached", async () => {
    fetchSpy
      .mockResolvedValueOnce(pageResponse([makeItem({ name: "Card A" })], 3, 3))
      .mockResolvedValueOnce(pageResponse([makeItem({ name: "Card B" }, 2)], 3, 3))
      .mockResolvedValueOnce(pageResponse([makeItem({ name: "Card C" })], 3, 3));

    const { library, totalResults } = await getOwnedLibrary({ token: TOKEN, ttlMs: 0 });

    expect(library.size).toBe(3);
    expect(library.get("Card A")!.totalQty).toBe(1);
    expect(library.get("Card B")!.totalQty).toBe(2);
    expect(library.get("Card C")!.totalQty).toBe(1);
    expect(totalResults).toBe(3);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("stops at MAX_PAGES even if totalPages is higher", async () => {
    fetchSpy.mockImplementation(async () => {
      const idx = fetchSpy.mock.calls.length;
      return pageResponse([makeItem({ name: `Card ${idx}` })], 999, 999);
    });

    const { library } = await getOwnedLibrary({ token: TOKEN, ttlMs: 0 });

    expect(fetchSpy).toHaveBeenCalledTimes(10);
    expect(library.size).toBe(10);
  });

  it("groups multiple printings of the same name into one OwnedCard", async () => {
    fetchSpy.mockResolvedValue(
      pageResponse([
        makeItem({ name: "Sol Ring" }, 1, "sol-cmd"),
        makeItem({ name: "Sol Ring" }, 2, "sol-2xm"),
        makeItem({ name: "Lightning Bolt" }, 4, "bolt-m11"),
      ]),
    );

    const { library } = await getOwnedLibrary({ token: TOKEN, ttlMs: 0 });

    expect(library.size).toBe(2);
    const sol = library.get("Sol Ring")!;
    expect(sol.printings).toHaveLength(2);
    expect(sol.totalQty).toBe(3);
    expect(library.get("Lightning Bolt")!.totalQty).toBe(4);
  });

  it("treats DFC // and Alchemy A- names as distinct keys", async () => {
    fetchSpy.mockResolvedValue(
      pageResponse([
        makeItem({ name: "Delver of Secrets // Insectile Aberration" }),
        makeItem({ name: "A-Lightning Bolt" }),
        makeItem({ name: "Lightning Bolt" }),
      ]),
    );

    const { library } = await getOwnedLibrary({ token: TOKEN, ttlMs: 0 });

    expect(library.size).toBe(3);
    expect(library.has("Delver of Secrets // Insectile Aberration")).toBe(true);
    expect(library.has("A-Lightning Bolt")).toBe(true);
    expect(library.has("Lightning Bolt")).toBe(true);
  });

  it("serves the second call from cache within TTL", async () => {
    fetchSpy.mockResolvedValue(pageResponse([makeItem({ name: "Sol Ring" })]));

    const r1 = await getOwnedLibrary({ token: TOKEN, ttlMs: 60_000 });
    const r2 = await getOwnedLibrary({ token: TOKEN, ttlMs: 60_000 });

    expect(r1).toBe(r2);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("refetches after TTL expires", async () => {
    vi.useFakeTimers();
    try {
      fetchSpy.mockImplementation(async () => pageResponse([makeItem({ name: "Sol Ring" })]));

      await getOwnedLibrary({ token: TOKEN, ttlMs: 1000 });
      vi.advanceTimersByTime(1500);
      await getOwnedLibrary({ token: TOKEN, ttlMs: 1000 });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("caches per token (different tokens do not share cache)", async () => {
    fetchSpy.mockImplementation(async () => pageResponse([makeItem({ name: "Sol Ring" })]));

    await getOwnedLibrary({ token: "token-a", ttlMs: 60_000 });
    await getOwnedLibrary({ token: "token-b", ttlMs: 60_000 });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("refresh: true bypasses cache and refetches", async () => {
    fetchSpy.mockImplementation(async () => pageResponse([makeItem({ name: "Sol Ring" })]));

    await getOwnedLibrary({ token: TOKEN, ttlMs: 60_000 });
    await getOwnedLibrary({ token: TOKEN, ttlMs: 60_000, refresh: true });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("refresh: true updates the cached entry for subsequent calls", async () => {
    fetchSpy
      .mockResolvedValueOnce(pageResponse([makeItem({ name: "Sol Ring" })]))
      .mockResolvedValueOnce(pageResponse([makeItem({ name: "Mana Crypt" })]));

    await getOwnedLibrary({ token: TOKEN, ttlMs: 60_000 });
    const refreshed = await getOwnedLibrary({ token: TOKEN, ttlMs: 60_000, refresh: true });
    const cached = await getOwnedLibrary({ token: TOKEN, ttlMs: 60_000 });

    expect(refreshed.library.has("Mana Crypt")).toBe(true);
    expect(cached).toBe(refreshed);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("throws MoxfieldError(401) on auth failure", async () => {
    fetchSpy.mockResolvedValue(new Response("nope", { status: 401, statusText: "Unauthorized" }));

    await expect(getOwnedLibrary({ token: TOKEN, ttlMs: 0 })).rejects.toMatchObject({
      name: "MoxfieldError",
      status: 401,
    });
  });

  it("throws MoxfieldError(502) on server error", async () => {
    fetchSpy.mockResolvedValue(new Response("nope", { status: 500, statusText: "Server Error" }));

    await expect(getOwnedLibrary({ token: TOKEN, ttlMs: 0 })).rejects.toMatchObject({
      name: "MoxfieldError",
      status: 502,
    });
  });
});
