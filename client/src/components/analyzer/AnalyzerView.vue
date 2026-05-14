<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import DeckInput from "./DeckInput.vue";
import ParsedDeckSummary from "./ParsedDeckSummary.vue";
import CrispiDashboard from "./CrispiDashboard.vue";
import { parseDeck, resolveDeck, scoreDeck } from "../../services/analyzer";
import type {
  AnalyzerSource,
  CrispiReport,
  ParsedDeck,
  SerializedResolvedDeck,
} from "../../types/analyzer";

const source = ref<AnalyzerSource>("manual");
const payload = ref("");

const parsedDeck = ref<ParsedDeck | null>(null);
const resolvedDeck = ref<SerializedResolvedDeck | null>(null);
const crispi = ref<CrispiReport | null>(null);

const parseError = ref("");
const resolveError = ref("");
const scoreError = ref("");

const loading = reactive({
  parsing: false,
  resolving: false,
  scoring: false,
});

const busy = computed(() => loading.parsing || loading.resolving || loading.scoring);

function setSource(value: AnalyzerSource) {
  source.value = value;
}

function setPayload(value: string) {
  payload.value = value;
}

function clearDownstreamState() {
  parsedDeck.value = null;
  resolvedDeck.value = null;
  crispi.value = null;
  parseError.value = "";
  resolveError.value = "";
  scoreError.value = "";
}

async function runAnalysis() {
  clearDownstreamState();

  const trimmed = payload.value.trim();
  if (!trimmed) {
    parseError.value = "Enter a Moxfield deck or paste a manual list before analyzing.";
    return;
  }

  loading.parsing = true;
  let parsed: ParsedDeck;
  try {
    parsed = await parseDeck(source.value, trimmed);
    parsedDeck.value = parsed;
  } catch (error) {
    parseError.value = error instanceof Error ? error.message : "Parse request failed";
    return;
  } finally {
    loading.parsing = false;
  }

  loading.resolving = true;
  let resolved: SerializedResolvedDeck;
  try {
    resolved = await resolveDeck(parsed);
    resolvedDeck.value = resolved;
  } catch (error) {
    resolveError.value = error instanceof Error ? error.message : "Resolve request failed";
    return;
  } finally {
    loading.resolving = false;
  }

  loading.scoring = true;
  try {
    crispi.value = await scoreDeck(resolved);
  } catch (error) {
    scoreError.value = error instanceof Error ? error.message : "Score request failed";
  } finally {
    loading.scoring = false;
  }
}
</script>

<template>
  <section class="page-section analyzer-view stack-lg">
    <p class="subtitle">
      Paste a decklist or enter a Moxfield URL to run parse, resolve, and CRISPI score in one flow.
    </p>

    <DeckInput
      :source="source"
      :payload="payload"
      :disabled="busy"
      @update:source="setSource"
      @update:payload="setPayload"
      @submit="runAnalysis"
    />

    <div v-if="loading.parsing" class="status-line">Parsing...</div>
    <p v-if="parseError" class="error">{{ parseError }}</p>

    <ParsedDeckSummary :parsed="parsedDeck" :resolved="resolvedDeck" />

    <div v-if="parsedDeck && loading.resolving" class="status-line">Resolving...</div>
    <p v-if="resolvedDeck === null && resolveError" class="error">{{ resolveError }}</p>

    <div v-if="resolvedDeck && loading.scoring" class="status-line">Scoring...</div>
    <p v-if="resolvedDeck && scoreError" class="error">{{ scoreError }}</p>

    <CrispiDashboard v-if="crispi" :report="crispi" />
  </section>
</template>
