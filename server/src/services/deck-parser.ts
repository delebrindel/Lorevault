import type { ParsedDeck } from "../types.js";

type ParseResult = Omit<ParsedDeck, "source">;

const LINE_RE = /^(?:(\d+)\s*x?\s+)?(.+?)$/i;
const CARD_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 ,.'&:/\-]*$/;
const ANNOTATION_BRACKET = /\s*\[[^\]]*\][^\n]*$/;
const ANNOTATION_FOIL = /\s*\*[A-Za-z]+\*\s*$/;

const COMMANDER_HEADERS = new Set(["commander", "commanders"]);
const IGNORE_HEADERS = new Set([
  "sideboard",
  "maybeboard",
  "considering",
  "acquireboard",
]);

type Section = "mainboard" | "commander" | "ignore";

/**
 * Parse a pasted decklist into a `ParsedDeck` minus its `source` discriminator.
 * Pure function. Deterministic. No I/O.
 */
export function parseManualDecklist(input: string): ParseResult {
  const commanderCounts = new Map<string, number>();
  const mainboardCounts = new Map<string, number>();
  const unresolved: string[] = [];

  let section: Section = "mainboard";

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "") continue;
    if (line.startsWith("SB:")) continue;

    if (line.startsWith("//")) {
      const header = line.slice(2).trim().toLowerCase();
      if (COMMANDER_HEADERS.has(header)) {
        section = "commander";
      } else if (IGNORE_HEADERS.has(header)) {
        section = "ignore";
      } else if (header === "mainboard" || header === "deck") {
        section = "mainboard";
      }
      continue;
    }

    if (section === "ignore") continue;

    const stripped = line.replace(ANNOTATION_BRACKET, "").replace(ANNOTATION_FOIL, "").trim();

    const match = LINE_RE.exec(stripped);
    if (!match || !match[2]) {
      unresolved.push(line);
      continue;
    }

    const qty = match[1] ? parseInt(match[1], 10) : 1;
    const name = match[2].trim();
    if (name === "" || qty <= 0 || !CARD_NAME_RE.test(name)) {
      unresolved.push(line);
      continue;
    }

    if (section === "commander") {
      commanderCounts.set(name, 1);
    } else {
      mainboardCounts.set(name, (mainboardCounts.get(name) ?? 0) + qty);
    }
  }

  const commanderNames = [...commanderCounts.keys()];
  const commander = commanderNames.slice(0, 2);
  for (const extra of commanderNames.slice(2)) {
    unresolved.push(`too many commanders: ${extra}`);
  }

  const mainboard = [...mainboardCounts.entries()].map(([name, qty]) => ({ name, qty }));

  return { commander, mainboard, unresolved };
}
