<script setup lang="ts">
import { computed } from "vue";
import type { ParsedDeck, SerializedResolvedDeck } from "../../types/analyzer";

const props = defineProps<{
  parsed: ParsedDeck | null;
  resolved: SerializedResolvedDeck | null;
}>();

const parsedMainboardCount = computed(
  () => props.parsed?.mainboard.reduce((sum, entry) => sum + entry.qty, 0) ?? 0
);

const resolvedMainboardCount = computed(
  () => props.resolved?.mainboard.reduce((sum, entry) => sum + entry.qty, 0) ?? 0
);

const unresolvedPreview = computed(() => {
  const unresolved = props.resolved?.unresolved ?? props.parsed?.unresolved ?? [];
  return unresolved.slice(0, 5);
});

const unresolvedTotal = computed(
  () => props.resolved?.unresolved.length ?? props.parsed?.unresolved.length ?? 0
);
</script>

<template>
  <section v-if="parsed" class="panel stack-sm">
    <div>
      <h2 class="section-title">Deck Summary</h2>
      <p class="muted">Show successful analyzer stages without hiding earlier results.</p>
    </div>

    <div class="summary-grid">
      <div class="summary-card stack-sm">
        <span class="summary-label">Parsed Commanders</span>
        <strong>{{ parsed.commander.join(", ") || "None detected" }}</strong>
      </div>
      <div class="summary-card stack-sm">
        <span class="summary-label">Parsed Mainboard</span>
        <strong>{{ parsedMainboardCount }}</strong>
      </div>
      <div class="summary-card stack-sm">
        <span class="summary-label">Unresolved Entries</span>
        <strong>{{ parsed.unresolved.length }}</strong>
      </div>
    </div>

    <div v-if="resolved" class="summary-grid">
      <div class="summary-card stack-sm">
        <span class="summary-label">Resolved Commanders</span>
        <strong>{{ resolved.commander.map((card) => card.name).join(", ") || "None resolved" }}</strong>
      </div>
      <div class="summary-card stack-sm">
        <span class="summary-label">Resolved Mainboard</span>
        <strong>{{ resolvedMainboardCount }}</strong>
      </div>
      <div class="summary-card stack-sm">
        <span class="summary-label">Resolve Misses</span>
        <strong>{{ resolved.unresolved.length }}</strong>
      </div>
    </div>

    <div v-if="unresolvedTotal > 0" class="warning-block stack-sm">
      <strong>Unresolved cards:</strong>
      <span>{{ unresolvedPreview.join(", ") }}</span>
      <span v-if="unresolvedTotal > unresolvedPreview.length">
        + {{ unresolvedTotal - unresolvedPreview.length }} more
      </span>
    </div>
  </section>
</template>
