<script setup lang="ts">
import type { AnalyzerSource } from "../../types/analyzer";

const props = defineProps<{
  source: AnalyzerSource;
  payload: string;
  disabled: boolean;
}>();

const emit = defineEmits<{
  "update:source": [value: AnalyzerSource];
  "update:payload": [value: string];
  submit: [];
}>();

function setSource(value: AnalyzerSource) {
  emit("update:source", value);
}

function onSubmit() {
  if (!props.disabled && props.payload.trim()) emit("submit");
}
</script>

<template>
  <section class="panel stack-sm">
    <div>
      <h2 class="section-title">Deck Input</h2>
      <p class="muted">Run the existing backend analyzer pipeline without changing the API contract.</p>
    </div>

    <div class="pill-row">
      <button
        type="button"
        class="pill-btn"
        :class="{ active: source === 'moxfield' }"
        :disabled="disabled"
        @click="setSource('moxfield')"
      >
        Moxfield
      </button>
      <button
        type="button"
        class="pill-btn"
        :class="{ active: source === 'manual' }"
        :disabled="disabled"
        @click="setSource('manual')"
      >
        Manual Paste
      </button>
    </div>

    <label class="field-label" :for="source === 'moxfield' ? 'moxfield-input' : 'manual-input'">
      {{ source === "moxfield" ? "Moxfield URL or Deck ID" : "Decklist" }}
    </label>

    <input
      v-if="source === 'moxfield'"
      id="moxfield-input"
      class="text-input"
      type="text"
      :value="payload"
      :disabled="disabled"
      placeholder="https://moxfield.com/decks/... or deck ID"
      spellcheck="false"
      @input="emit('update:payload', ($event.target as HTMLInputElement).value)"
    />

    <textarea
      v-else
      id="manual-input"
      class="text-area"
      :value="payload"
      :disabled="disabled"
      rows="12"
      placeholder="1 Sol Ring&#10;1 Arcane Signet&#10;1 Swords to Plowshares"
      spellcheck="false"
      @input="emit('update:payload', ($event.target as HTMLTextAreaElement).value)"
    />

    <div class="actions">
      <button
        type="button"
        class="fetch-btn"
        :disabled="disabled || !payload.trim()"
        @click="onSubmit"
      >
        Analyze Deck
      </button>
    </div>
  </section>
</template>
