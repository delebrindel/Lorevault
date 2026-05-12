import type { ResolvedDeck } from "../../types.js";
import type { ArchetypeDetectionResult } from "../types.js";

export function detectArchetype(_deck: ResolvedDeck): ArchetypeDetectionResult {
  return {
    archetype: "midrange/goodstuff",
    confidence: "low",
    reasons: [
      "Slice 1 uses a conservative detector stub until richer tag density exists.",
    ],
  };
}
