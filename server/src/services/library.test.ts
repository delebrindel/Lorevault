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
});
