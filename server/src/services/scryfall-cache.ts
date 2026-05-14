import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Card } from "../types.js";

export type CacheLookupResult =
  | { kind: "hit"; source: "exact" | "fuzzy"; card: Card }
  | { kind: "miss"; stale: boolean }
  | null;

export type CollectionLookupResult =
  | {
      kind: "collection-hit";
      card: Card;
      quantityTotal: number;
      finish: string | null;
      sourceSetCode: string | null;
      sourceCollectorNumber: string | null;
    }
  | null;

export interface CreateScryfallCacheOptions {
  dbPath?: string;
  missTtlMs: number;
}

interface CacheRow {
  cache_key_normalized: string;
  cache_key_exact: string;
  requested_name: string;
  resolution_mode: "exact" | "fuzzy" | null;
  status: "hit" | "miss";
  card_json: string | null;
  created_at: string;
  last_checked_at: string;
  expires_at: string | null;
}

interface CollectionCacheRow {
  card_name_exact: string;
  card_json: string;
  quantity_total: number;
  finish: string | null;
  source_set_code: string | null;
  source_collector_number: string | null;
  created_at: string;
  updated_at: string;
}

const DEFAULT_DB_PATH = resolve(process.cwd(), ".cache/scryfall-cache.db");

let db: Database.Database | null = null;
let currentDbPath: string | null = null;

export function normalizeScryfallCacheKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function getDb(dbPath = DEFAULT_DB_PATH): Database.Database {
  if (db && currentDbPath === dbPath) return db;

  if (db) {
    db.close();
  }

  mkdirSync(dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  currentDbPath = dbPath;
  db.exec(`
    CREATE TABLE IF NOT EXISTS scryfall_name_cache (
      cache_key_normalized TEXT NOT NULL,
      cache_key_exact TEXT NOT NULL,
      requested_name TEXT NOT NULL,
      resolution_mode TEXT,
      status TEXT NOT NULL,
      card_json TEXT,
      created_at TEXT NOT NULL,
      last_checked_at TEXT NOT NULL,
      expires_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_scryfall_cache_normalized
      ON scryfall_name_cache(cache_key_normalized);
    CREATE INDEX IF NOT EXISTS idx_scryfall_cache_exact
      ON scryfall_name_cache(cache_key_exact);
    CREATE TABLE IF NOT EXISTS collection_card_cache (
      card_name_exact TEXT PRIMARY KEY,
      card_json TEXT NOT NULL,
      quantity_total INTEGER NOT NULL,
      finish TEXT,
      source_set_code TEXT,
      source_collector_number TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

export function closeScryfallCache(): void {
  if (db) db.close();
  db = null;
  currentDbPath = null;
}

export function clearScryfallCacheRows(dbPath = DEFAULT_DB_PATH): void {
  const database = getDb(dbPath);
  database.prepare("DELETE FROM scryfall_name_cache").run();
  database.prepare("DELETE FROM collection_card_cache").run();
}

export function createScryfallCache(options: CreateScryfallCacheOptions) {
  const database = getDb(options.dbPath);

  const findExact = database.prepare(
    `SELECT * FROM scryfall_name_cache WHERE cache_key_exact = ? ORDER BY rowid DESC LIMIT 1`,
  );
  const findNormalized = database.prepare(
    `SELECT * FROM scryfall_name_cache WHERE cache_key_normalized = ? ORDER BY rowid DESC LIMIT 1`,
  );
  const deleteKeys = database.prepare(
    `DELETE FROM scryfall_name_cache WHERE cache_key_exact = ? OR cache_key_normalized = ?`,
  );
  const insertRow = database.prepare(`
    INSERT INTO scryfall_name_cache (
      cache_key_normalized,
      cache_key_exact,
      requested_name,
      resolution_mode,
      status,
      card_json,
      created_at,
      last_checked_at,
      expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const findCollectionExact = database.prepare(
    `SELECT * FROM collection_card_cache WHERE card_name_exact = ? LIMIT 1`,
  );
  const upsertCollection = database.prepare(`
    INSERT INTO collection_card_cache (
      card_name_exact,
      card_json,
      quantity_total,
      finish,
      source_set_code,
      source_collector_number,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(card_name_exact) DO UPDATE SET
      card_json = excluded.card_json,
      quantity_total = excluded.quantity_total,
      finish = excluded.finish,
      source_set_code = excluded.source_set_code,
      source_collector_number = excluded.source_collector_number,
      updated_at = excluded.updated_at
  `);

  function rowToLookup(row: CacheRow | undefined, nowIso: string): CacheLookupResult {
    if (!row) return null;

    if (row.status === "hit") {
      return {
        kind: "hit",
        source: (row.resolution_mode ?? "exact") as "exact" | "fuzzy",
        card: JSON.parse(row.card_json ?? "null") as Card,
      };
    }

    return {
      kind: "miss",
      stale: row.expires_at != null && row.expires_at <= nowIso,
    };
  }

  return {
    lookup(requestedName: string, nowIso: string): CacheLookupResult {
      const exactKey = requestedName.trim();
      const normalizedKey = normalizeScryfallCacheKey(requestedName);

      const exactRow = findExact.get(exactKey) as CacheRow | undefined;
      if (exactRow) return rowToLookup(exactRow, nowIso);

      const normalizedRow = findNormalized.get(normalizedKey) as CacheRow | undefined;
      return rowToLookup(normalizedRow, nowIso);
    },

    storeHit(args: {
      requestedName: string;
      resolutionMode: "exact" | "fuzzy";
      card: Card;
      nowIso: string;
    }): void {
      const exactKey = args.requestedName.trim();
      const normalizedKey = normalizeScryfallCacheKey(args.requestedName);
      deleteKeys.run(exactKey, normalizedKey);
      insertRow.run(
        normalizedKey,
        exactKey,
        args.requestedName,
        args.resolutionMode,
        "hit",
        JSON.stringify(args.card),
        args.nowIso,
        args.nowIso,
        null,
      );
    },

    storeMiss(args: { requestedName: string; nowIso: string }): void {
      const exactKey = args.requestedName.trim();
      const normalizedKey = normalizeScryfallCacheKey(args.requestedName);
      const expiresAt = new Date(Date.parse(args.nowIso) + options.missTtlMs).toISOString();
      deleteKeys.run(exactKey, normalizedKey);
      insertRow.run(
        normalizedKey,
        exactKey,
        args.requestedName,
        null,
        "miss",
        null,
        args.nowIso,
        args.nowIso,
        expiresAt,
      );
    },

    lookupCollectionCard(cardNameExact: string): CollectionLookupResult {
      const row = findCollectionExact.get(cardNameExact) as CollectionCacheRow | undefined;
      if (!row) return null;
      return {
        kind: "collection-hit",
        card: JSON.parse(row.card_json) as Card,
        quantityTotal: row.quantity_total,
        finish: row.finish,
        sourceSetCode: row.source_set_code,
        sourceCollectorNumber: row.source_collector_number,
      };
    },

    upsertCollectionCard(args: {
      cardNameExact: string;
      card: Card;
      quantityTotal: number;
      finish: string | null;
      sourceSetCode: string | null;
      sourceCollectorNumber: string | null;
      nowIso: string;
    }): void {
      const existing = findCollectionExact.get(args.cardNameExact) as CollectionCacheRow | undefined;
      upsertCollection.run(
        args.cardNameExact,
        JSON.stringify(args.card),
        args.quantityTotal,
        args.finish,
        args.sourceSetCode,
        args.sourceCollectorNumber,
        existing?.created_at ?? args.nowIso,
        args.nowIso,
      );
    },
  };
}
