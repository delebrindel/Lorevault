<script setup lang="ts">
export type AppTab = "collection" | "analyzer";

const props = defineProps<{
  modelValue: AppTab;
  tabs: { key: AppTab; label: string }[];
}>();

const emit = defineEmits<{
  "update:modelValue": [value: AppTab];
}>();

function selectTab(tab: AppTab) {
  if (tab !== props.modelValue) emit("update:modelValue", tab);
}
</script>

<template>
  <nav class="nav-tabs" aria-label="Primary">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      type="button"
      class="nav-tab"
      :class="{ active: modelValue === tab.key }"
      @click="selectTab(tab.key)"
    >
      {{ tab.label }}
    </button>
  </nav>
</template>

<style scoped>
.nav-tabs {
  display: inline-flex;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
  padding: 0.25rem;
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) + 4px);
  background: var(--surface);
}

.nav-tab {
  padding: 0.625rem 1rem;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-muted);
}

.nav-tab:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.nav-tab.active {
  background: rgba(233, 69, 96, 0.16);
  border-color: rgba(233, 69, 96, 0.3);
  color: var(--text);
}
</style>
