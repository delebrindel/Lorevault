import type { Card, ParsedDeck, ResolvedDeck } from "../types.js";
import { getOwnedLibrary } from "./library.js";
import { resolveCard } from "./card-resolver.js";

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

  for (const name of parsed.commander) {
    const card = await resolveCard(name, { library, token: opts.token });
    if (card) commander.push(card);
    else unresolved.push(name);
  }

  for (const { name, qty } of parsed.mainboard) {
    const card = await resolveCard(name, { library, token: opts.token });
    if (card) mainboard.push({ card, qty });
    else unresolved.push(name);
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
