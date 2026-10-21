<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
</script>

<template>
  <div
    v-if="auth.initializingSession"
    v-loading="true"
    element-loading-text="正在验证身份"
    class="auth-loading"
    role="status"
    aria-label="正在验证身份"
    aria-busy="true"
  />
  <RouterView v-else />
</template>

<style lang="scss">
#app {
  height: 100%;
}

.auth-loading {
  height: 100%;
  min-height: 160px;
}
</style>
