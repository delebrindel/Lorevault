<script setup lang="ts">
import type { AxisKey, Grade } from "../../types/analyzer";

const props = defineProps<{
  axis: AxisKey;
  label: string;
  score: number;
  grade: Grade;
}>();

const axisClassMap: Record<AxisKey, string> = {
  consistency: "axis-consistency",
  resilience: "axis-resilience",
  interaction: "axis-interaction",
  speed: "axis-speed",
};
</script>

<template>
  <article class="axis-card stack-sm" :class="axisClassMap[props.axis]">
    <span class="summary-label">{{ label }}</span>
    <strong class="axis-score">{{ score }}</strong>
    <span class="axis-grade">Grade {{ grade }}</span>
  </article>
</template>
