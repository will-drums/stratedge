<script setup lang="ts">
import AdminDashboard from './AdminDashboard.vue';

const emit = defineEmits<{
  (e: 'navigate', view: 'storefront' | 'checkout' | 'dashboard' | 'admin'): void;
}>();
</script>

<template>
  <AdminDashboard @navigate="(v) => emit('navigate', v)" />
</template>
