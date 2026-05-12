import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseManualDecklist,
  extractMoxfieldDeckId,
  fetchMoxfieldDeck,
  parseDeck,
} from "./deck-parser.js";

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

describe("extractMoxfieldDeckId", () => {
  it("returns a bare ID unchanged", () => {
    expect(extractMoxfieldDeckId("abc123XYZ")).toBe("abc123XYZ");
  });

  it("extracts the ID from a full Moxfield URL", () => {
    expect(extractMoxfieldDeckId("https://www.moxfield.com/decks/abc123XYZ")).toBe("abc123XYZ");
  });

  it("extracts the ID from a URL with trailing slash and query", () => {
    expect(extractMoxfieldDeckId("https://moxfield.com/decks/abc123XYZ/?foo=bar")).toBe("abc123XYZ");
  });

  it("returns null for non-Moxfield URLs", () => {
    expect(extractMoxfieldDeckId("https://example.com/decks/abc")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(extractMoxfieldDeckId("")).toBeNull();
    expect(extractMoxfieldDeckId("   ")).toBeNull();
  });
});

describe("fetchMoxfieldDeck", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function moxfieldDeckResponse(opts: {
    commanders?: Array<{ name: string; qty?: number }>;
    mainboard?: Array<{ name: string; qty?: number }>;
    companions?: Array<{ name: string; qty?: number }>;
  }): Response {
    const toCardsMap = (entries: Array<{ name: string; qty?: number }> = []) =>
      Object.fromEntries(
        entries.map((e, i) => [
          `id-${i}`,
          {
            quantity: e.qty ?? 1,
            boardType: "mainboard",
            finish: "nonFoil",
            isFoil: false,
            isAlter: false,
            isProxy: false,
            card: { name: e.name },
          },
        ]),
      );

    const body = {
      boards: {
        commanders: { cards: toCardsMap(opts.commanders) },
        mainboard: { cards: toCardsMap(opts.mainboard) },
        companions: { cards: toCardsMap(opts.companions) },
      },
    };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  it("fetches a deck by ID and parses commander + mainboard", async () => {
    fetchSpy.mockImplementation(async () =>
      moxfieldDeckResponse({
        commanders: [{ name: "Atraxa, Praetors' Voice" }],
        mainboard: [
          { name: "Sol Ring", qty: 1 },
          { name: "Forest", qty: 5 },
        ],
      }),
    );

    const result = await fetchMoxfieldDeck({ idOrUrl: "abc123", token: "tok" });
    expect(result.commander).toEqual(["Atraxa, Praetors' Voice"]);
    expect(result.mainboard).toEqual([
      { name: "Sol Ring", qty: 1 },
      { name: "Forest", qty: 5 },
    ]);
    expect(result.unresolved).toEqual([]);
  });

  it("ignores companion boards rather than merging them into commander[]", async () => {
    fetchSpy.mockImplementation(async () =>
      moxfieldDeckResponse({
        commanders: [{ name: "Kaalia of the Vast" }],
        companions: [{ name: "Lutri, the Spellchaser" }],
        mainboard: [{ name: "Sol Ring" }],
      }),
    );

    const result = await fetchMoxfieldDeck({ idOrUrl: "abc123", token: "tok" });
    expect(result.commander).toEqual(["Kaalia of the Vast"]);
  });

  it("accepts a full Moxfield URL", async () => {
    fetchSpy.mockImplementation(async () =>
      moxfieldDeckResponse({ commanders: [{ name: "Edric" }], mainboard: [] }),
    );

    await fetchMoxfieldDeck({
      idOrUrl: "https://www.moxfield.com/decks/abc123",
      token: "tok",
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("/decks/all/abc123");
  });

  it("sends Bearer auth and the correct headers", async () => {
    fetchSpy.mockImplementation(async () =>
      moxfieldDeckResponse({ commanders: [{ name: "X" }], mainboard: [] }),
    );

    await fetchMoxfieldDeck({ idOrUrl: "abc123", token: "secret-token" });
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-token");
    expect(headers.Accept).toBe("application/json");
    expect(headers["User-Agent"]).toBe("moxfield-app/1.0");
  });

  it("throws MoxfieldError(401) on auth failure", async () => {
    fetchSpy.mockResolvedValue(new Response("nope", { status: 401, statusText: "Unauthorized" }));
    await expect(fetchMoxfieldDeck({ idOrUrl: "abc123", token: "tok" })).rejects.toMatchObject({
      name: "MoxfieldError",
      status: 401,
    });
  });

  it("throws MoxfieldError(502) on server error", async () => {
    fetchSpy.mockResolvedValue(new Response("nope", { status: 500, statusText: "Server Error" }));
    await expect(fetchMoxfieldDeck({ idOrUrl: "abc123", token: "tok" })).rejects.toMatchObject({
      name: "MoxfieldError",
      status: 502,
    });
  });

  it("throws MoxfieldError(400) for an unrecognised input", async () => {
    await expect(
      fetchMoxfieldDeck({ idOrUrl: "https://example.com/foo", token: "tok" }),
    ).rejects.toMatchObject({ name: "MoxfieldError", status: 400 });
  });
});

describe("parseDeck", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("dispatches manual source to the text parser and tags source", async () => {
    const result = await parseDeck({ source: "manual", payload: "1 Sol Ring\n", token: "tok" });
    expect(result.source).toBe("manual");
    expect(result.mainboard).toEqual([{ name: "Sol Ring", qty: 1 }]);
  });

  it("does not call fetch for manual source", async () => {
    await parseDeck({ source: "manual", payload: "1 Sol Ring\n", token: "tok" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("dispatches moxfield source to the deck fetcher and tags source", async () => {
    fetchSpy.mockImplementation(async () =>
      new Response(
        JSON.stringify({
          boards: {
            commanders: { cards: { a: { quantity: 1, card: { name: "Atraxa, Praetors' Voice" } } } },
            mainboard: { cards: { b: { quantity: 1, card: { name: "Sol Ring" } } } },
          },
        }),
        { status: 200 },
      ),
    );

    const result = await parseDeck({ source: "moxfield", payload: "abc123", token: "tok" });
    expect(result.source).toBe("moxfield");
    expect(result.commander).toEqual(["Atraxa, Praetors' Voice"]);
    expect(result.mainboard).toEqual([{ name: "Sol Ring", qty: 1 }]);
  });
});
