<script setup lang="ts">
import { ref } from "vue";
import NavTabs, { type AppTab } from "./components/shared/NavTabs.vue";
import CollectionView from "./components/collection/CollectionView.vue";
import AnalyzerView from "./components/analyzer/AnalyzerView.vue";

const currentTab = ref<AppTab>("collection");

const tabs: { key: AppTab; label: string }[] = [
  { key: "collection", label: "Collection" },
  { key: "analyzer", label: "Analyzer" },
];
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <h1>Lorevault</h1>
      <p class="subtitle">
        Your Commander archive for collection insight, deck resolution, and transparent analysis.
      </p>
    </header>

    <NavTabs v-model="currentTab" :tabs="tabs" />

    <CollectionView v-if="currentTab === 'collection'" />
    <AnalyzerView v-else />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
}

.app-header {
  margin-bottom: 0.75rem;
}

.subtitle {
  margin: -0.75rem 0 0;
  color: var(--text-muted);
  font-size: 0.9rem;
  line-height: 1.5;
}
</style>
