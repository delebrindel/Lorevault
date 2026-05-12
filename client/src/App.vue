<script setup lang="ts">
import { ref, provide, computed } from "vue";
import type { MtgColor, CollectionResult } from "./types/card";
import ColorSelector from "./components/ColorSelector.vue";
import CardList from "./components/CardList.vue";

const selectedColors = ref<MtgColor[]>([]);
const colorless = ref(true);
const result = ref<CollectionResult | null>(null);
const loading = ref(false);
const error = ref("");

const toastMessage = ref("");
const toastVisible = ref(false);
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(msg: string) {
  if (toastTimer) clearTimeout(toastTimer);
  toastMessage.value = msg;
  toastVisible.value = true;
  toastTimer = setTimeout(() => {
    toastVisible.value = false;
  }, 2500);
}

provide("showToast", showToast);

const hasSelection = computed(
  () => selectedColors.value.length > 0 || colorless.value
);

async function fetchCollection() {
  error.value = "";
  result.value = null;

  if (!hasSelection.value) {
    error.value = "Select at least one color or Colorless.";
    return;
  }

  loading.value = true;

  try {
    const response = await fetch("/api/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        colors: selectedColors.value,
        colorless: colorless.value,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      error.value = data.error ?? `Request failed (${response.status})`;
      return;
    }

    result.value = data as CollectionResult;
    showToast(`Loaded ${result.value.filteredCount} cards matching your filters`);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Network error";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="app">
    <h1>Lorevault</h1>
    <p class="subtitle">
      Browse your collection today. Transparent Commander analysis is coming next.
    </p>

    <ColorSelector v-model="selectedColors" v-model:colorless="colorless" />

    <div class="actions">
      <button
        class="fetch-btn"
        :disabled="loading || (!selectedColors.length && !colorless)"
        @click="fetchCollection"
      >
        <template v-if="loading">Loading...</template>
        <template v-else>Browse Collection</template>
      </button>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <CardList
      v-if="result"
      :cards="result.cards"
      :total-results="result.totalResults"
      :filtered-count="result.filteredCount"
    />

    <div class="toast" :class="{ 'toast-show': toastVisible }">
      {{ toastMessage }}
    </div>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
}

.actions {
  margin-bottom: 1rem;
}

.subtitle {
  margin: -0.75rem 0 1.25rem;
  color: var(--text-muted);
  font-size: 0.9rem;
  line-height: 1.5;
}

.fetch-btn {
  padding: 0.625rem 1.5rem;
  background: var(--accent);
  color: #fff;
  font-weight: 600;
  font-size: 0.875rem;
}

.fetch-btn:hover:not(:disabled) {
  background: var(--accent-hover);
}

.fetch-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error {
  margin-bottom: 1rem;
  padding: 0.625rem 0.75rem;
  background: rgba(233, 69, 96, 0.1);
  border: 1px solid rgba(233, 69, 96, 0.3);
  border-radius: var(--radius);
  color: var(--accent);
  font-size: 0.8rem;
}

.toast {
  position: fixed;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%) translateY(1rem);
  opacity: 0;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  padding: 0.625rem 1.25rem;
  border-radius: var(--radius);
  font-size: 0.825rem;
  font-weight: 500;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
  z-index: 1000;
  pointer-events: none;
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.toast.toast-show {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
</style>
