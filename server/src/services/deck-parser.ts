import type { ParsedDeck } from "../types.js";
import { MoxfieldError } from "./library.js";

type ParseResult = Omit<ParsedDeck, "source">;

const MOXFIELD_HOST_RE = /^(?:https?:\/\/)?(?:www\.)?moxfield\.com\/decks\/([A-Za-z0-9_-]+)/i;
const BARE_ID_RE = /^[A-Za-z0-9_-]+$/;
const MOXFIELD_DECK_API = "https://api2.moxfield.com/v3/decks/all";

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

interface MoxfieldDeckCardEntry {
  quantity: number;
  card: { name: string };
}

interface MoxfieldDeckBoard {
  cards: Record<string, MoxfieldDeckCardEntry>;
}

interface MoxfieldDeckResponse {
  boards: {
    commanders?: MoxfieldDeckBoard;
    mainboard?: MoxfieldDeckBoard;
    companions?: MoxfieldDeckBoard;
    signatureSpells?: MoxfieldDeckBoard;
  };
}

/**
 * Verified against a live public deck on 2026-05-12:
 * - endpoint: GET https://api2.moxfield.com/v3/decks/all/<deckId>
 * - commander entries: boards.commanders.cards
 * - mainboard entries: boards.mainboard.cards
 * - each board entry includes quantity + nested card.name
 * - companion and signature-spell style boards may exist, but Phase 1.B ignores them
 */
export function extractMoxfieldDeckId(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const urlMatch = MOXFIELD_HOST_RE.exec(trimmed);
  if (urlMatch) return urlMatch[1];
  if (BARE_ID_RE.test(trimmed)) return trimmed;
  return null;
}

function flattenBoard(board: MoxfieldDeckBoard | undefined): { name: string; qty: number }[] {
  if (!board || !board.cards) return [];
  const out: { name: string; qty: number }[] = [];
  for (const entry of Object.values(board.cards)) {
    if (!entry?.card?.name || typeof entry.quantity !== "number") continue;
    out.push({ name: entry.card.name, qty: entry.quantity });
  }
  return out;
}

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

/**
 * Fetch a Moxfield deck by URL or ID, returning a `Omit<ParsedDeck, "source">`.
 * Throws `MoxfieldError` on input/auth/server failure.
 */
export async function fetchMoxfieldDeck(opts: {
  idOrUrl: string;
  token: string;
}): Promise<ParseResult> {
  const id = extractMoxfieldDeckId(opts.idOrUrl);
  if (!id) {
    throw new MoxfieldError(`Not a recognised Moxfield deck URL or ID: ${opts.idOrUrl}`, 400);
  }

  let response: Response;
  try {
    response = await fetch(`${MOXFIELD_DECK_API}/${encodeURIComponent(id)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${opts.token}`,
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

  let data: MoxfieldDeckResponse;
  try {
    data = (await response.json()) as MoxfieldDeckResponse;
  } catch {
    throw new MoxfieldError("Moxfield API returned invalid JSON", 502);
  }

  if (!data?.boards) {
    throw new MoxfieldError("Unexpected response structure from Moxfield deck API", 502);
  }

  const commanders = flattenBoard(data.boards.commanders);
  const companions = flattenBoard(data.boards.companions);
  const signatureSpells = flattenBoard(data.boards.signatureSpells);
  const mainboard = flattenBoard(data.boards.mainboard);

  void companions;
  void signatureSpells;

  const commanderNames: string[] = [];
  for (const entry of commanders) {
    if (!commanderNames.includes(entry.name)) commanderNames.push(entry.name);
  }

  return {
    commander: commanderNames,
    mainboard,
    unresolved: [],
  };
}
