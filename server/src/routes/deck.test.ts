import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../services/deck-parser.js", () => ({
  parseDeck: vi.fn(),
}));

vi.mock("../services/deck-resolver.js", () => ({
  resolveDeck: vi.fn(),
}));

import { deck } from "./deck.js";
import { parseDeck } from "../services/deck-parser.js";
import { resolveDeck } from "../services/deck-resolver.js";
import { MoxfieldError } from "../services/library.js";

const mockParse = parseDeck as unknown as ReturnType<typeof vi.fn>;
const mockResolve = resolveDeck as unknown as ReturnType<typeof vi.fn>;

function makeCard(name: string, scryfall_id = name.toLowerCase()) {
  return {
    id: name,
    uniqueCardId: name,
    scryfall_id,
    set: "set",
    set_name: "Set Name",
    name,
    cn: "1",
    layout: "normal",
    cmc: 0,
    type: "Artifact",
    type_line: "Artifact",
    oracle_text: "",
    mana_cost: "",
    colors: [],
    color_identity: [],
    rarity: "common",
    prices: {},
  };
}

describe("POST /api/deck/parse", () => {
  beforeEach(() => {
    mockParse.mockReset();
    mockResolve.mockReset();
    process.env.MOXFIELD_TOKEN = "test-token";
  });

  it("rejects invalid JSON body with 400", async () => {
    const res = await deck.request("/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("rejects missing source with 400", async () => {
    const res = await deck.request("/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: "1 Sol Ring" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects unknown source value with 400", async () => {
    const res = await deck.request("/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "tappedout", payload: "x" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects non-string payload with 400", async () => {
    const res = await deck.request("/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "manual", payload: 123 }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 500 when token is missing for moxfield source", async () => {
    delete process.env.MOXFIELD_TOKEN;
    const res = await deck.request("/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "moxfield", payload: "abc123" }),
    });
    expect(res.status).toBe(500);
  });

  it("does NOT require token for manual source", async () => {
    delete process.env.MOXFIELD_TOKEN;
    mockParse.mockResolvedValue({
      source: "manual",
      commander: [],
      mainboard: [],
      unresolved: [],
    });
    const res = await deck.request("/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "manual", payload: "1 Sol Ring" }),
    });
    expect(res.status).toBe(200);
  });

  it("forwards manual payload to parseDeck and returns the result", async () => {
    mockParse.mockResolvedValue({
      source: "manual",
      commander: [],
      mainboard: [{ name: "Sol Ring", qty: 1 }],
      unresolved: [],
    });
    const res = await deck.request("/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "manual", payload: "1 Sol Ring" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mainboard).toEqual([{ name: "Sol Ring", qty: 1 }]);
    expect(mockParse).toHaveBeenCalledWith({
      source: "manual",
      payload: "1 Sol Ring",
      token: "test-token",
    });
  });

  it("maps MoxfieldError(401) to a 401 response", async () => {
    mockParse.mockRejectedValueOnce(new MoxfieldError("Invalid or expired auth token", 401));
    const res = await deck.request("/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "moxfield", payload: "abc123" }),
    });
    expect(res.status).toBe(401);
  });

  it("maps MoxfieldError(400) to a 400 response", async () => {
    mockParse.mockRejectedValueOnce(new MoxfieldError("Bad input", 400));
    const res = await deck.request("/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "moxfield", payload: "garbage" }),
    });
    expect(res.status).toBe(400);
  });

  it("maps MoxfieldError(502) to a 502 response", async () => {
    mockParse.mockRejectedValueOnce(new MoxfieldError("upstream", 502));
    const res = await deck.request("/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "moxfield", payload: "abc123" }),
    });
    expect(res.status).toBe(502);
  });
});

describe("POST /api/deck/resolve", () => {
  beforeEach(() => {
    mockResolve.mockReset();
    process.env.MOXFIELD_TOKEN = "test-token";
  });

  it("rejects invalid JSON body with 400", async () => {
    const res = await deck.request("/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("rejects body that is not a ParsedDeck shape", async () => {
    const res = await deck.request("/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "manual", commander: "not array" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 500 if token is missing", async () => {
    delete process.env.MOXFIELD_TOKEN;
    const res = await deck.request("/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "manual",
        commander: [],
        mainboard: [],
        unresolved: [],
      }),
    });
    expect(res.status).toBe(500);
  });

  it("forwards the ParsedDeck to resolveDeck and serializes ownedMap as object", async () => {
    const sol = makeCard("Sol Ring");
    const ownedMap = new Map<string, number>([["sol ring", 3]]);
    mockResolve.mockResolvedValue({
      commander: [],
      mainboard: [{ card: sol, qty: 1 }],
      unresolved: [],
      ownedMap,
    });

    const res = await deck.request("/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "manual",
        commander: [],
        mainboard: [{ name: "Sol Ring", qty: 1 }],
        unresolved: [],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mainboard[0].card.name).toBe("Sol Ring");
    expect(body.ownedMap).toEqual({ "sol ring": 3 });
    expect(mockResolve).toHaveBeenCalledOnce();
  });

  it("maps MoxfieldError(401) to a 401 response", async () => {
    mockResolve.mockRejectedValueOnce(new MoxfieldError("Invalid or expired auth token", 401));
    const res = await deck.request("/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "manual", commander: [], mainboard: [], unresolved: [] }),
    });
    expect(res.status).toBe(401);
  });

  it("maps MoxfieldError(502) to a 502 response", async () => {
    mockResolve.mockRejectedValueOnce(new MoxfieldError("upstream", 502));
    const res = await deck.request("/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "manual", commander: [], mainboard: [], unresolved: [] }),
    });
    expect(res.status).toBe(502);
  });
});
