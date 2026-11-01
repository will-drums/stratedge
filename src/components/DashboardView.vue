<script setup lang="ts">
import ClientDashboard from './ClientDashboard.vue';

const emit = defineEmits<{
  (e: 'navigate', view: 'storefront' | 'checkout' | 'dashboard' | 'admin'): void;
}>();
</script>

<template>
  <ClientDashboard @navigate="(v) => emit('navigate', v)" />
</template>
