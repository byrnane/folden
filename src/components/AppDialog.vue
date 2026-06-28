<script setup lang="ts">
import { useSlots } from 'vue'

defineProps<{
  title: string
}>()

const slots = useSlots()
</script>

<template>
  <div class="app-dialog-backdrop">
    <section
      class="app-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
    >
      <header class="app-dialog-header">
        <h2>{{ title }}</h2>
      </header>

      <div class="app-dialog-body">
        <slot />
      </div>

      <footer v-if="slots.actions" class="app-dialog-actions">
        <slot name="actions" />
      </footer>
    </section>
  </div>
</template>
