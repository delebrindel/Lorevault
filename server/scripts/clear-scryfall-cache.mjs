import Database from "better-sqlite3";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = path.resolve(SCRIPT_DIR, "../.cache/scryfall-cache.db");

try {
  await rm(CACHE_PATH, { force: true });
  console.log(`Removed ${CACHE_PATH}`);
} catch (error) {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error.code === "EBUSY" || error.code === "EPERM")
  ) {
    const db = new Database(CACHE_PATH);
    db.prepare("DELETE FROM scryfall_name_cache").run();
    db.prepare("DELETE FROM collection_card_cache").run();
    db.close();
    console.log(`Cleared rows in ${CACHE_PATH}`);
  } else {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
