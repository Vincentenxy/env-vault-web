<script setup lang="ts">
import { Moon, Sunny } from '@element-plus/icons-vue'
import { useThemeStore } from '@/stores/theme'
import { DefaultPrimaryColor } from '@/utils/color'

const theme = useThemeStore()

const PRESET_COLORS = [
  DefaultPrimaryColor,
  '#67c23a',
  '#e6a23c',
  '#f56c6c',
  '#722ed1',
  '#13c2c2',
]
</script>

<template>
  <div class="theme-switcher">
    <el-tooltip :content="theme.mode === 'dark' ? '切换为亮色' : '切换为暗色'" placement="bottom">
      <el-button text circle :icon="theme.mode === 'dark' ? Sunny : Moon" @click="theme.toggleMode" />
    </el-tooltip>
    <el-tooltip content="主色" placement="bottom">
      <el-color-picker
        v-model="theme.primaryColor"
        size="small"
        :predefine="PRESET_COLORS"
      />
    </el-tooltip>
  </div>
</template>

<style lang="scss" scoped>
.theme-switcher {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
</style>
