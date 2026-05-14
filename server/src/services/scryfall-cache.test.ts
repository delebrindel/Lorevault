import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Card } from "../types.js";
import {
  closeScryfallCache,
  createScryfallCache,
  normalizeScryfallCacheKey,
} from "./scryfall-cache.js";

function makeCard(name: string): Card {
  return {
    id: name,
    uniqueCardId: `${name}-oracle`,
    scryfall_id: `${name}-sf`,
    set: "set",
    set_name: "Set Name",
    name,
    cn: "1",
    layout: "normal",
    cmc: 1,
    type: "Artifact",
    type_line: "Artifact",
    oracle_text: "",
    mana_cost: "{1}",
    colors: [],
    color_identity: [],
    rarity: "common",
    prices: {},
  };
}

describe("scryfall cache", () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "lv-scryfall-cache-"));
    dbPath = path.join(tempDir, "scryfall-cache.db");
  });

  afterEach(async () => {
    closeScryfallCache();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("normalizes cache keys by trimming, collapsing whitespace, and lowercasing", () => {
    expect(normalizeScryfallCacheKey("  Sol   Ring  ")).toBe("sol ring");
  });

  it("stores and returns a hit row by exact key", () => {
    const cache = createScryfallCache({ dbPath, missTtlMs: 7 * 24 * 60 * 60 * 1000 });
    cache.storeHit({
      requestedName: "Sol Ring",
      resolutionMode: "exact",
      card: makeCard("Sol Ring"),
      nowIso: "2026-05-13T12:00:00.000Z",
    });

    const result = cache.lookup("Sol Ring", "2026-05-13T12:00:00.000Z");

    expect(result).toEqual({
      kind: "hit",
      source: "exact",
      card: expect.objectContaining({ name: "Sol Ring" }),
    });
  });

  it("falls back from exact key to normalized key", () => {
    const cache = createScryfallCache({ dbPath, missTtlMs: 7 * 24 * 60 * 60 * 1000 });
    cache.storeHit({
      requestedName: "Sol Ring",
      resolutionMode: "exact",
      card: makeCard("Sol Ring"),
      nowIso: "2026-05-13T12:00:00.000Z",
    });

    const result = cache.lookup("  sol   ring ", "2026-05-13T12:00:00.000Z");
    expect(result?.kind).toBe("hit");
  });

  it("returns a fresh miss row without going stale", () => {
    const cache = createScryfallCache({ dbPath, missTtlMs: 7 * 24 * 60 * 60 * 1000 });
    cache.storeMiss({
      requestedName: "Imaginary Card",
      nowIso: "2026-05-13T12:00:00.000Z",
    });

    const result = cache.lookup("Imaginary Card", "2026-05-14T12:00:00.000Z");
    expect(result).toEqual({ kind: "miss", stale: false });
  });

  it("marks miss rows stale after the miss TTL", () => {
    const cache = createScryfallCache({ dbPath, missTtlMs: 24 * 60 * 60 * 1000 });
    cache.storeMiss({
      requestedName: "Imaginary Card",
      nowIso: "2026-05-13T12:00:00.000Z",
    });

    const result = cache.lookup("Imaginary Card", "2026-05-15T12:00:00.000Z");
    expect(result).toEqual({ kind: "miss", stale: true });
  });

  it("stores and returns a collection row by exact card name", () => {
    const cache = createScryfallCache({ dbPath, missTtlMs: 7 * 24 * 60 * 60 * 1000 });

    cache.upsertCollectionCard({
      cardNameExact: "Sol Ring",
      card: makeCard("Sol Ring"),
      quantityTotal: 3,
      finish: "Foil",
      sourceSetCode: "cmd",
      sourceCollectorNumber: "217",
      nowIso: "2026-05-13T12:00:00.000Z",
    });

    expect(cache.lookupCollectionCard("Sol Ring")).toEqual({
      kind: "collection-hit",
      card: expect.objectContaining({ name: "Sol Ring" }),
      quantityTotal: 3,
      finish: "Foil",
      sourceSetCode: "cmd",
      sourceCollectorNumber: "217",
    });
  });

  it("updates an existing collection row for the same exact card name", () => {
    const cache = createScryfallCache({ dbPath, missTtlMs: 7 * 24 * 60 * 60 * 1000 });

    cache.upsertCollectionCard({
      cardNameExact: "Sol Ring",
      card: makeCard("Sol Ring"),
      quantityTotal: 1,
      finish: "Normal",
      sourceSetCode: "old",
      sourceCollectorNumber: "1",
      nowIso: "2026-05-13T12:00:00.000Z",
    });

    cache.upsertCollectionCard({
      cardNameExact: "Sol Ring",
      card: makeCard("Sol Ring"),
      quantityTotal: 4,
      finish: "Foil",
      sourceSetCode: "new",
      sourceCollectorNumber: "99",
      nowIso: "2026-05-14T12:00:00.000Z",
    });

    expect(cache.lookupCollectionCard("Sol Ring")).toEqual({
      kind: "collection-hit",
      card: expect.objectContaining({ name: "Sol Ring" }),
      quantityTotal: 4,
      finish: "Foil",
      sourceSetCode: "new",
      sourceCollectorNumber: "99",
    });
  });

  it("does not return a collection row for a non-exact name", () => {
    const cache = createScryfallCache({ dbPath, missTtlMs: 7 * 24 * 60 * 60 * 1000 });

    cache.upsertCollectionCard({
      cardNameExact: "Sol Ring",
      card: makeCard("Sol Ring"),
      quantityTotal: 1,
      finish: "Normal",
      sourceSetCode: "cmd",
      sourceCollectorNumber: "217",
      nowIso: "2026-05-13T12:00:00.000Z",
    });

    expect(cache.lookupCollectionCard("sol ring")).toBeNull();
    expect(cache.lookupCollectionCard("  Sol Ring  ")).toBeNull();
  });
});
