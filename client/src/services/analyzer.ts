import type {
  AnalyzerRequestError,
  AnalyzerSource,
  CrispiReport,
  ParsedDeck,
  SerializedResolvedDeck,
} from "../types/analyzer";

async function postJson<TResponse>(path: string, body: unknown): Promise<TResponse> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await response.json().catch(() => ({}))) as TResponse & AnalyzerRequestError;

  if (!response.ok) {
    throw new Error(data.error ?? `Request failed (${response.status})`);
  }

  return data;
}

export function parseDeck(source: AnalyzerSource, payload: string): Promise<ParsedDeck> {
  return postJson<ParsedDeck>("/api/deck/parse", { source, payload });
}

export function resolveDeck(parsed: ParsedDeck): Promise<SerializedResolvedDeck> {
  return postJson<SerializedResolvedDeck>("/api/deck/resolve", parsed);
}

export function scoreDeck(resolved: SerializedResolvedDeck): Promise<CrispiReport> {
  return postJson<CrispiReport>("/api/deck/score", { deck: resolved });
}
