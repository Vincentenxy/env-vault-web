<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="error-page">
    <h2>403 · 无权访问</h2>
    <p>当前账号没有访问该资源的权限。</p>
    <el-button type="primary" @click="router.replace('/app/dashboard')">返回首页</el-button>
  </div>
</template>

<style lang="scss" scoped>
.error-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 100%;
}
</style>
