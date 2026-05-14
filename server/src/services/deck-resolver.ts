import type { Card, ParsedDeck, ResolvedDeck } from "../types.js";
import { getOwnedLibrary } from "./library.js";
import { resolveCard } from "./card-resolver.js";

const RESOLVE_CONCURRENCY = 4;

async function mapWithConcurrency<T, TResult>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const currentIndex = nextIndex++;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await worker(items[currentIndex]!, currentIndex);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

/**
 * Orchestrate full deck resolution. Loads the owned library once, then
 * resolves every commander/mainboard name. Unresolved names accumulate.
 */
export async function resolveDeck(
  parsed: ParsedDeck,
  opts: { token: string },
): Promise<ResolvedDeck> {
  const { library } = await getOwnedLibrary({ token: opts.token });

  const commander: Card[] = [];
  const mainboard: { card: Card; qty: number }[] = [];
  const unresolved: string[] = [...parsed.unresolved];

  const commanderResults = await mapWithConcurrency(
    parsed.commander,
    RESOLVE_CONCURRENCY,
    async (name) => ({ name, card: await resolveCard(name, { library, token: opts.token }) }),
  );

  for (const result of commanderResults) {
    if (result.card) commander.push(result.card);
    else unresolved.push(result.name);
  }

  const mainboardResults = await mapWithConcurrency(
    parsed.mainboard,
    RESOLVE_CONCURRENCY,
    async ({ name, qty }) => ({
      name,
      qty,
      card: await resolveCard(name, { library, token: opts.token }),
    }),
  );

  for (const result of mainboardResults) {
    if (result.card) mainboard.push({ card: result.card, qty: result.qty });
    else unresolved.push(result.name);
  }

  const ownedMap = new Map<string, number>();
  const allResolved: Card[] = [...commander, ...mainboard.map((m) => m.card)];
  for (const card of allResolved) {
    const owned = library.get(card.name);
    if (owned && owned.totalQty > 0) {
      ownedMap.set(card.scryfall_id, owned.totalQty);
    }
  }

  return { commander, mainboard, unresolved, ownedMap };
}
