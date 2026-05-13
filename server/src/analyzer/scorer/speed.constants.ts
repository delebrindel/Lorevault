import type { Archetype } from "../types.js";

export const THREAT_FINISHER_RE = /(creatures you control gain trample and get \+X\/\+X|double strike|extra combat|infect|commander damage)/i;
export const THREAT_VOLTRON_RE = /(equipped creature gets \+1\/\+1 for each land you control|equipped creature has double strike|equipped creature gets \+\d+\/\+\d+)/i;
export const THREAT_MUST_ANSWER_RE = /(whenever .* deals combat damage to a player|at the beginning of combat on your turn)/i;

export const WIN_TURN_TARGETS: Record<Archetype, { min: number; ideal: number; max: number }> = {
  "aggro/voltron": { min: 6, ideal: 5, max: 4 },
  "midrange/goodstuff": { min: 8, ideal: 7, max: 6 },
  control: { min: 10, ideal: 9, max: 7 },
  combo: { min: 6, ideal: 5, max: 3 },
  "aristocrats/sacrifice": { min: 8, ideal: 7, max: 5 },
  spellslinger: { min: 8, ideal: 7, max: 5 },
  "tokens/go-wide": { min: 8, ideal: 7, max: 6 },
  "reanimator/graveyard": { min: 6, ideal: 5, max: 4 },
  "lands/landfall": { min: 9, ideal: 8, max: 6 },
};

export const TUTOR_SPEED_WEIGHTS = {
  broadCheap: 1,
  broadSlow: 0.6,
  narrowCheap: 0.75,
  narrowSlow: 0.4,
} as const;
