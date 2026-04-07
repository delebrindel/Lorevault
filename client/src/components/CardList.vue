<script setup lang="ts">
import { ref, computed, inject } from "vue";
import type { FilteredCard } from "../types/card";

const props = defineProps<{
  cards: FilteredCard[];
  totalResults: number;
  filteredCount: number;
}>();

const showToast = inject<(msg: string) => void>("showToast", () => {});
const expandedCard = ref<string | null>(null);
const search = ref("");

const deduplicatedCards = computed(() => {
  const map = new Map<string, FilteredCard>();
  for (const card of props.cards) {
    const key = card.scryfall_id;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += card.quantity;
    } else {
      map.set(key, { ...card });
    }
  }
  return Array.from(map.values());
});

const filteredCards = computed(() => {
  const q = search.value.toLowerCase().trim();
  if (!q) return deduplicatedCards.value;
  return deduplicatedCards.value.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.type_line.toLowerCase().includes(q) ||
      (c.oracle_text || "").toLowerCase().includes(q)
  );
});

function cardKey(card: FilteredCard): string {
  return card.scryfall_id || card.name + card.set_name;
}

function toggleCard(card: FilteredCard) {
  const key = cardKey(card);
  expandedCard.value = expandedCard.value === key ? null : key;
}

function getImageUrl(scryfallId: string): string {
  return `https://cards.scryfall.io/large/front/${scryfallId[0]}/${scryfallId[1]}/${scryfallId}.jpg`;
}

function formatMana(manaCost: string | undefined | null): string {
  if (!manaCost) return "";
  return manaCost.replace(/[{}]/g, " ").trim();
}

async function copyCardList() {
  const cards = filteredCards.value;
  const lines = cards.map(
    (c) => `- ${c.name} -${c.rarity} -  ${c.mana_cost || "{}"} - ${c.oracle_text || ""}`
  );
  const text = lines.join("\n");

  try {
    await navigator.clipboard.writeText(text);
    showToast(`Copied ${cards.length} cards to clipboard`);
  } catch {
    showToast("Failed to copy -- check browser permissions");
  }
}

async function copyCSV() {
  const cards = filteredCards.value;
  const header = "name,quantity,rarity,set_code,finish,collector_number,purchase_price";
  const rows = cards.map((c) => {
    const name = `"${c.name.replace(/"/g, '""')}"`;
    const price = c.prices?.ck ?? "";
    return `${name},${c.quantity},${c.rarity},${c.set_code},${c.finish},${c.collector_number},${price}`;
  });
  const csv = [header, ...rows].join("\n");

  try {
    await navigator.clipboard.writeText(csv);
    showToast(`Copied ${cards.length} cards as CSV`);
  } catch {
    showToast("Failed to copy -- check browser permissions");
  }
}
</script>

<template>
  <div class="card-list">
    <div class="summary">
      <div class="summary-row">
        <div>
          <span v-if="search.trim()">{{ filteredCards.length }} matching</span>
          <span v-else>{{ filteredCount }} cards</span>
          <span class="muted"> of {{ totalResults }} total in collection</span>
        </div>
        <div class="btn-group">
          <button class="copy-btn" @click="copyCardList" type="button">
            Copy List
          </button>
          <button class="copy-btn" @click="copyCSV" type="button">
            Copy CSV
          </button>
        </div>
      </div>
    </div>

    <input
      v-model="search"
      class="search-input"
      type="text"
      placeholder="Search by name, type, or oracle text..."
      spellcheck="false"
    />

    <div class="table-wrapper">
      <table>
        <colgroup>
          <col style="width: 18%" />
          <col style="width: 7%" />
          <col style="width: 16%" />
          <col style="width: 42%" />
          <col style="width: 7%" />
          <col style="width: 7%" />
        </colgroup>
        <thead>
          <tr>
            <th>Name</th>
            <th>Mana</th>
            <th>Type</th>
            <th>Oracle Text</th>
            <th class="center">P/T</th>
            <th class="center">Qty</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="card in filteredCards" :key="cardKey(card)">
            <tr
              class="card-row"
              :class="{ 'row-selected': expandedCard === cardKey(card) }"
              @click="toggleCard(card)"
            >
              <td class="name-cell">
                <span>{{ card.name }}</span>
                <span class="set-name">{{ card.set_name }}</span>
              </td>
              <td class="mana-cell">{{ formatMana(card.mana_cost) }}</td>
              <td class="type-cell">{{ card.type_line }}</td>
              <td class="oracle-cell">{{ card.oracle_text || "" }}</td>
              <td class="center">
                <template v-if="card.power != null">
                  {{ card.power }}/{{ card.toughness }}
                </template>
                <span v-else class="muted">&mdash;</span>
              </td>
              <td class="center">{{ card.quantity }}</td>
            </tr>
            <tr v-if="expandedCard === cardKey(card)" class="image-row">
              <td colspan="6">
                <div class="image-container">
                  <img
                    :src="getImageUrl(card.scryfall_id)"
                    :alt="card.name"
                    class="card-image"
                    loading="lazy"
                  />
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.card-list {
  margin-top: 1rem;
}

.summary {
  font-size: 0.875rem;
  margin-bottom: 0.75rem;
  font-weight: 500;
}

.summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.btn-group {
  display: flex;
  gap: 0.5rem;
}

.copy-btn {
  padding: 0.375rem 0.875rem;
  background: var(--surface);
  color: var(--text-muted);
  border: 1px solid var(--border);
  font-size: 0.75rem;
  font-weight: 600;
}

.copy-btn:hover {
  background: var(--surface-hover);
  color: var(--text);
  border-color: var(--text-muted);
}

.search-input {
  width: 100%;
  padding: 0.625rem 0.75rem;
  margin-bottom: 0.75rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  font-size: 0.85rem;
  outline: none;
  transition: border-color 0.15s ease;
}

.search-input:focus {
  border-color: var(--accent);
}

.search-input::placeholder {
  color: var(--text-muted);
}

.muted {
  color: var(--text-muted);
}

.table-wrapper {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}

thead {
  background: var(--surface);
}

th {
  padding: 0.625rem 0.75rem;
  text-align: left;
  font-weight: 600;
  text-transform: uppercase;
  font-size: 0.7rem;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
}

td {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}

tr:last-child td {
  border-bottom: none;
}

tr:hover td {
  background: var(--surface-hover);
}

.card-row {
  cursor: pointer;
}

.row-selected td {
  background: var(--surface-hover);
  border-bottom-color: transparent;
}

.image-row td {
  padding: 1rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.image-container {
  display: flex;
  justify-content: center;
}

.card-image {
  max-height: 340px;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.center {
  text-align: center;
}

.name-cell span:first-child {
  display: block;
  font-weight: 500;
}

.set-name {
  display: block;
  margin-top: 0.125rem;
  font-size: 0.7rem;
  color: var(--text-muted);
}

.mana-cell {
  white-space: nowrap;
  font-family: monospace;
  font-size: 0.8rem;
}

.type-cell {
  color: var(--text-muted);
}

.oracle-cell {
  font-size: 0.75rem;
  color: var(--text-muted);
  max-width: 320px;
  line-height: 1.4;
}
</style>
