async function postJson(path, body) {
    const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({})));
    if (!response.ok) {
        throw new Error(data.error ?? `Request failed (${response.status})`);
    }
    return data;
}
export function parseDeck(source, payload) {
    return postJson("/api/deck/parse", { source, payload });
}
export function resolveDeck(parsed) {
    return postJson("/api/deck/resolve", parsed);
}
export function scoreDeck(resolved) {
    return postJson("/api/deck/score", { deck: resolved });
}
