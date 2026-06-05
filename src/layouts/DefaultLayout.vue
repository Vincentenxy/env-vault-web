<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter, useRoute, RouterView } from 'vue-router'
import {
  CaretBottom,
  Connection,
  Files,
  Folder,
  Key,
  Moon,
  Sunny,
  SwitchButton,
  User as UserIcon,
} from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { DefaultPrimaryColor } from '@/utils/color'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const theme = useThemeStore()

const collapsed = ref(false)

interface NavItem {
  index: string
  label: string
  icon: typeof Folder
  group?: string
}

const navItems: NavItem[] = [
  { index: '/app/organizations', label: '组织管理', icon: Folder, group: 'WORKSPACE' },
  { index: '/app/projects', label: '项目管理', icon: Files, group: 'WORKSPACE' },
  { index: '/app/envs', label: '环境管理', icon: Connection, group: 'RESOURCES' },
  { index: '/app/secrets', label: '密钥管理', icon: Key, group: 'RESOURCES' },
]

const navGroups: string[] = ['WORKSPACE', 'RESOURCES']

const activeMenu = computed<string>(() => {
  // 用 matched 最后一段的 path 拿精确路径(避免 split/slice 算错层数)。
  // 注意:`/app` 这种父级路径会匹配不到任何 navItem,fallback 到空串。
  const last = route.matched[route.matched.length - 1]
  const matchedPath = last?.path ?? route.path
  // 项目详情(/app/projects/:projectId)归属"项目管理"
  if (matchedPath.startsWith('/app/projects')) return '/app/projects'
  return matchedPath
})

/** 当前激活的导航项(供面包屑渲染) */
const currentNav = computed<NavItem | undefined>(() =>
  navItems.find((i) => i.index === activeMenu.value),
)

function onMenuSelect(index: string): void {
  if (index && index !== route.path) {
    router.push(index)
  }
}

async function onLogout(): Promise<void> {
  auth.logout()
  await router.replace({ name: 'Login' })
}

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
  <el-container class="layout">
    <el-aside class="layout__aside" :width="collapsed ? '56px' : '240px'">
      <div class="layout__brand">
        <div class="layout__brand-logo">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M12 2L3 7v10l9 5 9-5V7l-9-5z"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linejoin="round"
            />
            <path
              d="M12 22V12M3 7l9 5 9-5"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linejoin="round"
            />
          </svg>
        </div>
        <span v-if="!collapsed" class="layout__brand-text">EnvVault</span>
        <el-button
          v-if="!collapsed"
          class="layout__brand-toggle"
          text
          size="small"
          @click="collapsed = true"
        >
          <el-icon><CaretBottom class="rotate-90" /></el-icon>
        </el-button>
      </div>

      <el-menu
        v-if="!collapsed"
        class="layout__menu"
        :default-active="activeMenu"
        @select="onMenuSelect"
      >
        <template v-for="group in navGroups" :key="group">
          <div class="layout__menu-group">{{ group }}</div>
          <el-menu-item
            v-for="item in navItems.filter((i) => i.group === group)"
            :key="item.index"
            :index="item.index"
          >
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ item.label }}</span>
          </el-menu-item>
        </template>
      </el-menu>

      <el-menu v-else class="layout__menu layout__menu--collapsed" :default-active="activeMenu">
        <el-tooltip
          v-for="item in navItems"
          :key="item.index"
          :content="item.label"
          placement="right"
        >
          <el-menu-item :index="item.index" @click="onMenuSelect(item.index)">
            <el-icon><component :is="item.icon" /></el-icon>
          </el-menu-item>
        </el-tooltip>
      </el-menu>

      <div class="layout__aside-foot" v-if="!collapsed">
        <el-button
          class="layout__expand"
          text
          :icon="CaretBottom"
          @click="collapsed = true"
        >
          收起侧栏
        </el-button>
      </div>
    </el-aside>

    <el-container>
      <el-header class="layout__header">
        <div class="layout__bread">
          <span class="layout__bread-section">{{ currentNav?.group ?? 'Workspace' }}</span>
          <span class="layout__bread-sep">/</span>
          <span class="layout__bread-current">
            {{ currentNav?.label ?? '...' }}
          </span>
        </div>
        <div class="layout__header-actions">
          <el-dropdown trigger="click">
            <span class="layout__user">
              <span class="layout__user-avatar">
                {{ (auth.currentUser?.name ?? auth.currentUser?.userId ?? '?').slice(0, 1).toUpperCase() }}
              </span>
              <span class="layout__user-name">
                {{ auth.currentUser?.name ?? auth.currentUser?.userId ?? '未登录' }}
              </span>
              <el-icon><CaretBottom /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <div class="layout__user-menu-section">
                  <div class="layout__user-menu-label">主题</div>
                  <div class="layout__user-menu-row">
                    <el-tooltip content="切换为暗色" placement="bottom">
                      <el-button
                        text
                        circle
                        :icon="theme.mode === 'dark' ? Sunny : Moon"
                        @click="theme.toggleMode"
                      />
                    </el-tooltip>
                    <el-color-picker
                      v-model="theme.primaryColor"
                      size="small"
                      :predefine="PRESET_COLORS"
                    />
                  </div>
                </div>
                <el-dropdown-item
                  :icon="UserIcon"
                  disabled
                  class="layout__user-menu-info"
                >
                  {{ auth.currentUser?.email ?? auth.currentUser?.userId }}
                </el-dropdown-item>
                <el-dropdown-item divided :icon="SwitchButton" @click="onLogout">
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main class="layout__main">
        <RouterView />
      </el-main>
    </el-container>
  </el-container>
</template>

<style lang="scss" scoped>
.layout {
  height: 100vh;

  &__aside {
    background: var(--v-sidebar-bg);
    color: var(--v-sidebar-text);
    border-right: 1px solid var(--v-sidebar-border);
    transition: width 0.2s ease;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  &__brand {
    height: var(--v-header-height);
    display: flex;
    align-items: center;
    padding: 0 14px;
    border-bottom: 1px solid var(--v-sidebar-border);
    gap: 10px;
  }

  &__brand-logo {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    flex-shrink: 0;

    svg {
      width: 18px;
      height: 18px;
    }
  }

  &__brand-text {
    color: var(--v-sidebar-text-active);
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.3px;
    flex: 1;
  }

  &__brand-toggle {
    color: var(--v-sidebar-text) !important;
  }

  &__menu {
    background: transparent;
    border-right: none;
    flex: 1;
    padding: 8px 0;
    overflow-y: auto;
    overflow-x: hidden;

    --el-menu-bg-color: transparent;
    --el-menu-text-color: var(--v-sidebar-text);
    --el-menu-hover-bg-color: var(--v-sidebar-bg-hover);
    --el-menu-active-color: var(--v-sidebar-text-active);
    --el-menu-border-color: transparent;
  }

  &__menu--collapsed {
    padding: 8px 0;
  }

  &__menu-group {
    color: var(--v-sidebar-icon);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.8px;
    padding: 16px 20px 6px;
  }

  :deep(.el-menu-item) {
    height: 36px;
    line-height: 36px;
    margin: 2px 8px;
    padding: 0 12px !important;
    border-radius: var(--v-radius-md);
    font-size: var(--v-font-md);
    color: var(--v-sidebar-text) !important;
    transition: background 0.1s ease, color 0.1s ease;

    &:hover {
      background: var(--v-sidebar-bg-hover) !important;
      color: var(--v-sidebar-text-hover) !important;
    }

    .el-icon {
      color: var(--v-sidebar-icon);
      margin-right: 10px;
      font-size: 16px;
      transition: color 0.1s ease;
    }

    &.is-active {
      background: var(--v-sidebar-bg-active) !important;
      color: var(--v-sidebar-text-active) !important;
      font-weight: 500;

      .el-icon {
        color: var(--v-sidebar-icon-active);
      }
    }
  }

  &__aside-foot {
    padding: 8px 14px 12px;
    border-top: 1px solid var(--v-sidebar-border);
  }

  &__expand {
    color: var(--v-sidebar-text) !important;
    font-size: var(--v-font-sm) !important;
    width: 100%;
    justify-content: flex-start;
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--v-header-height) !important;
    background: var(--v-surface-bg);
    border-bottom: 1px solid var(--v-divider);
    padding: 0 20px;
  }

  &__bread {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--v-font-md);
  }

  &__bread-section {
    color: var(--v-text-tertiary);
  }

  &__bread-sep {
    color: var(--v-text-tertiary);
  }

  &__bread-current {
    color: var(--v-text-primary);
    font-weight: 500;
  }

  &__header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__user {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    padding: 4px 8px 4px 4px;
    border-radius: var(--v-radius-md);
    transition: background 0.1s ease;

    &:hover {
      background: var(--v-surface-row-hover);
    }
  }

  &__user-avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
    color: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
  }

  &__user-name {
    font-size: var(--v-font-md);
    color: var(--v-text-primary);
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__user-menu-section {
    padding: 8px 12px;
    border-bottom: 1px solid var(--v-divider);
  }

  &__user-menu-label {
    font-size: var(--v-font-xs);
    color: var(--v-text-tertiary);
    margin-bottom: 6px;
  }

  &__user-menu-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__user-menu-info {
    color: var(--v-text-secondary) !important;
    font-size: var(--v-font-sm) !important;
  }

  &__main {
    background: var(--v-surface-bg-subtle);
    padding: 24px;
    overflow: auto;
  }
}

.rotate-90 {
  transform: rotate(90deg);
}
</style>
