<script setup lang="ts">
import { computed } from "vue";
import { type MtgColor, MTG_COLORS } from "../types/card";

const selected = defineModel<MtgColor[]>({ required: true });
const colorless = defineModel<boolean>("colorless", { required: true });

function toggle(color: MtgColor) {
  const idx = selected.value.indexOf(color);
  if (idx === -1) {
    selected.value = [...selected.value, color];
  } else {
    selected.value = selected.value.filter((c) => c !== color);
  }
}

function isSelected(color: MtgColor): boolean {
  return selected.value.includes(color);
}

function toggleColorless() {
  colorless.value = !colorless.value;
}

function selectAll() {
  const allCodes = MTG_COLORS.map((c) => c.code);
  const allSelected = allCodes.every((code) => selected.value.includes(code));

  if (allSelected) {
    selected.value = [];
  } else {
    selected.value = [...allCodes];
  }
}

const allActive = computed(() =>
  MTG_COLORS.every((c) => selected.value.includes(c.code))
);

function buildHint(): string {
  const parts: string[] = [];

  if (selected.value.length > 0) {
    const names = selected.value
      .map((c) => MTG_COLORS.find((m) => m.code === c)?.name)
      .filter(Boolean);
    parts.push(names.join(", "));
  }

  if (colorless.value) {
    parts.push("Colorless");
  }

  return parts.join(" + ");
}
</script>

<template>
  <div class="color-selector">
    <label>Color Identity</label>
    <div class="colors">
      <button
        v-for="color in MTG_COLORS"
        :key="color.code"
        :class="['color-btn', { active: isSelected(color.code) }]"
        :style="{
          '--color-hex': color.hex,
          '--color-ring': isSelected(color.code) ? color.hex : 'transparent',
        }"
        @click="toggle(color.code)"
        :title="color.name"
        type="button"
      >
        <span class="color-pip" :style="{ background: color.hex }"></span>
        <span class="color-label">{{ color.name }}</span>
      </button>

      <span class="separator"></span>

      <button
        :class="['color-btn', 'special-btn', { active: colorless }]"
        :style="{
          '--color-hex': '#9e9e9e',
          '--color-ring': colorless ? '#9e9e9e' : 'transparent',
        }"
        @click="toggleColorless"
        title="Colorless"
        type="button"
      >
        <span class="color-pip" :style="{ background: '#9e9e9e' }"></span>
        <span class="color-label">Colorless</span>
      </button>

      <button
        :class="['color-btn', 'special-btn', { active: allActive }]"
        :style="{
          '--color-hex': '#c9a96e',
          '--color-ring': allActive ? '#c9a96e' : 'transparent',
        }"
        @click="selectAll"
        title="Select All Colors"
        type="button"
      >
        <span class="color-pip gold-pip"></span>
        <span class="color-label">All</span>
      </button>
    </div>
    <p v-if="selected.length === 0 && !colorless" class="hint">
      Select at least one color or Colorless to filter your collection.
    </p>
    <p v-else class="hint">
      Showing cards with identity within: {{ buildHint() }}
    </p>
  </div>
</template>

<style scoped>
.color-selector {
  margin-bottom: 1.5rem;
}

label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 0.5rem;
}

.colors {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;
}

.separator {
  width: 1px;
  height: 24px;
  background: var(--border);
  margin: 0 0.25rem;
}

.color-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.875rem;
  background: var(--surface);
  border: 2px solid var(--border);
  color: var(--text-muted);
  border-radius: var(--radius);
  transition: all 0.15s ease;
}

.color-btn:hover {
  background: var(--surface-hover);
  border-color: var(--color-hex);
}

.color-btn.active {
  border-color: var(--color-hex);
  color: var(--text);
  background: var(--surface-hover);
}

.color-pip {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.2);
  flex-shrink: 0;
}

.gold-pip {
  background: linear-gradient(135deg, #f9faf4, #0e68ab, #150b00, #d3202a, #00733e);
}

.color-label {
  font-size: 0.8rem;
  font-weight: 500;
}

.hint {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: var(--text-muted);
}
</style>
