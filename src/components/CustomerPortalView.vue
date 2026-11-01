<script setup lang="ts">
import DashboardView from './DashboardView.vue';

const emit = defineEmits<{
  (e: 'navigate', view: 'storefront' | 'dashboard' | 'admin'): void;
}>();
</script>

<template>
  <DashboardView @navigate="(view) => emit('navigate', view)" />
</template>
