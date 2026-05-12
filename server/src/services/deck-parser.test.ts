import { describe, it, expect } from "vitest";
import { parseManualDecklist } from "./deck-parser.js";

describe("parseManualDecklist", () => {
  it("parses a minimal mainboard-only decklist", () => {
    const result = parseManualDecklist("1 Sol Ring\n1 Forest\n");
    expect(result.commander).toEqual([]);
    expect(result.mainboard).toEqual([
      { name: "Sol Ring", qty: 1 },
      { name: "Forest", qty: 1 },
    ]);
    expect(result.unresolved).toEqual([]);
  });

  it("accepts qty-less, '1x', and '1 ' forms equivalently", () => {
    const result = parseManualDecklist("Sol Ring\n1x Mana Crypt\n1 Mox Diamond\n");
    expect(result.mainboard).toEqual([
      { name: "Sol Ring", qty: 1 },
      { name: "Mana Crypt", qty: 1 },
      { name: "Mox Diamond", qty: 1 },
    ]);
  });

  it("aggregates duplicate mainboard entries", () => {
    const result = parseManualDecklist("1 Forest\n3 Forest\n2x Forest\n");
    expect(result.mainboard).toEqual([{ name: "Forest", qty: 6 }]);
  });

  it("recognises a // Commander section", () => {
    const input = "// Commander\n1 Atraxa, Praetors' Voice\n// Mainboard\n1 Sol Ring\n";
    const result = parseManualDecklist(input);
    expect(result.commander).toEqual(["Atraxa, Praetors' Voice"]);
    expect(result.mainboard).toEqual([{ name: "Sol Ring", qty: 1 }]);
  });

  it("supports two commanders (partner)", () => {
    const input = "// Commanders\n1 Bruse Tarl, Boorish Herder\n1 Tymna the Weaver\n// Mainboard\n1 Sol Ring\n";
    const result = parseManualDecklist(input);
    expect(result.commander).toEqual([
      "Bruse Tarl, Boorish Herder",
      "Tymna the Weaver",
    ]);
    expect(result.mainboard).toEqual([{ name: "Sol Ring", qty: 1 }]);
  });

  it("flags more than 2 commanders as unresolved extras", () => {
    const input = "// Commander\n1 A\n1 B\n1 C\n";
    const result = parseManualDecklist(input);
    expect(result.commander).toEqual(["A", "B"]);
    expect(result.unresolved).toEqual(["too many commanders: C"]);
  });

  it("ignores Sideboard / Maybeboard / Considering sections", () => {
    const input = [
      "1 Sol Ring",
      "// Sideboard",
      "1 Force of Will",
      "// Maybeboard",
      "1 Mana Drain",
      "// Considering",
      "1 Demonic Tutor",
      "// Mainboard",
      "1 Forest",
    ].join("\n");
    const result = parseManualDecklist(input);
    expect(result.mainboard).toEqual([
      { name: "Sol Ring", qty: 1 },
      { name: "Forest", qty: 1 },
    ]);
  });

  it("ignores SB: prefixed lines", () => {
    const result = parseManualDecklist("1 Sol Ring\nSB: 1 Force of Will\n");
    expect(result.mainboard).toEqual([{ name: "Sol Ring", qty: 1 }]);
  });

  it("strips trailing [SET] and *F* annotations", () => {
    const input = "1 Sol Ring [CMM] 280\n1 Mana Crypt *F*\n2x Forest [LEA] 999 *E*\n";
    const result = parseManualDecklist(input);
    expect(result.mainboard).toEqual([
      { name: "Sol Ring", qty: 1 },
      { name: "Mana Crypt", qty: 1 },
      { name: "Forest", qty: 2 },
    ]);
  });

  it("ignores blank lines and unrecognised // comments", () => {
    const input = "\n// random comment\n1 Sol Ring\n\n// another comment\n1 Forest\n";
    const result = parseManualDecklist(input);
    expect(result.mainboard).toEqual([
      { name: "Sol Ring", qty: 1 },
      { name: "Forest", qty: 1 },
    ]);
  });

  it("collects unparseable lines into unresolved", () => {
    const input = "1 Sol Ring\nthis is not a card line @#$\n1 Forest\n";
    const result = parseManualDecklist(input);
    expect(result.mainboard).toEqual([
      { name: "Sol Ring", qty: 1 },
      { name: "Forest", qty: 1 },
    ]);
    expect(result.unresolved).toEqual(["this is not a card line @#$"]);
  });
});
