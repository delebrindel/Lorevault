<script setup lang="ts">
import AxisCard from "./AxisCard.vue";
import type { CrispiReport } from "../../types/analyzer";

defineProps<{
  report: CrispiReport;
}>();
</script>

<template>
  <section class="panel stack-sm">
    <div class="dashboard-head">
      <div class="stack-sm">
        <h2 class="section-title">CRISPI Summary</h2>
        <p class="muted">
          Archetype: <strong>{{ report.deckMeta.archetype }}</strong>
        </p>
      </div>
      <div class="overall-score-card stack-sm">
        <span class="summary-label">Overall Score</span>
        <strong class="overall-score">{{ report.overall }}</strong>
      </div>
    </div>

    <div class="axis-grid">
      <AxisCard
        axis="consistency"
        label="Consistency"
        :score="report.axes.consistency.score"
        :grade="report.axes.consistency.grade"
      />
      <AxisCard
        axis="resilience"
        label="Resilience"
        :score="report.axes.resilience.score"
        :grade="report.axes.resilience.grade"
      />
      <AxisCard
        axis="interaction"
        label="Interaction"
        :score="report.axes.interaction.score"
        :grade="report.axes.interaction.grade"
      />
      <AxisCard
        axis="speed"
        label="Speed"
        :score="report.axes.speed.score"
        :grade="report.axes.speed.grade"
      />
    </div>
  </section>
</template>
