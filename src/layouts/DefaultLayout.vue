<script setup lang="ts">
import { computed, type Component } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { OfficeBuilding } from '@element-plus/icons-vue'
import { Bell, KeyRound, LogOut, Moon, Sun } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'

interface NavItem {
  path: string
  label: string
  icon: Component
}

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const theme = useThemeStore()

const navItems: NavItem[] = [
  { path: '/app/organizations', label: '组织管理', icon: OfficeBuilding },
  { path: '/app/secrets', label: '秘钥管理', icon: KeyRound },
]
const userName = computed(() => auth.currentUser?.name ?? auth.currentUser?.userId ?? '管理员')
const userEmail = computed(
  () => auth.currentUser?.email ?? auth.currentUser?.userId ?? 'admin@company.com',
)
const userInitial = computed(() =>
  auth.currentUser ? userName.value.slice(0, 1).toUpperCase() : 'AD',
)

function navigate(path: string): void {
  if (path !== route.path) void router.push(path)
}

function isNavActive(path: string): boolean {
  return route.path === path
}

async function onLogout(): Promise<void> {
  auth.logout()
  await router.replace({ name: 'Login' })
}
</script>

<template>
  <div class="ops-layout">
    <header class="ops-layout__brand">
      <span class="ops-layout__brand-mark">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M13.2 2.8 6.7 12h4.6l-.5 9.2 6.5-10h-4.6l.5-8.4Z" />
        </svg>
      </span>
      <strong>OpsCenter</strong>
    </header>

    <header class="ops-layout__topbar">
      <nav class="ops-layout__modules" aria-label="当前子系统">
        <button
          type="button"
          class="ops-layout__module is-active"
          aria-label="秘钥中心"
          title="秘钥中心"
          @click="navigate('/app/secrets')"
        >
          <el-icon><KeyRound :stroke-width="1.8" /></el-icon>
          <span>秘钥中心</span>
        </button>
      </nav>

      <div class="ops-layout__tools">
        <el-popover
          placement="bottom-end"
          :width="270"
          trigger="click"
          popper-class="ops-notification-popper"
        >
          <template #reference>
            <button type="button" class="ops-layout__icon-button" aria-label="通知消息">
              <Bell :size="16" :stroke-width="1.7" />
              <span class="ops-layout__notice-dot"></span>
            </button>
          </template>
          <div class="ops-notifications">
            <header>
              <strong>通知</strong>
              <span>2 条未读</span>
            </header>
            <button type="button">
              <span class="ops-notifications__status is-blue"></span>
              <span>
                <strong>生产环境配置已更新</strong>
                <small>5 分钟前</small>
              </span>
            </button>
            <button type="button">
              <span class="ops-notifications__status is-amber"></span>
              <span>
                <strong>2 个密钥即将过期</strong>
                <small>今天 09:30</small>
              </span>
            </button>
          </div>
        </el-popover>

        <el-tooltip
          :content="theme.mode === 'dark' ? '切换为亮色' : '切换为暗色'"
          placement="bottom"
        >
          <button
            type="button"
            class="ops-layout__icon-button"
            :aria-label="theme.mode === 'dark' ? '切换为亮色' : '切换为暗色'"
            @click="theme.toggleMode"
          >
            <Sun v-if="theme.mode === 'dark'" :size="16" :stroke-width="1.7" />
            <Moon v-else :size="16" :stroke-width="1.7" />
          </button>
        </el-tooltip>

        <span class="ops-layout__tool-divider"></span>

        <el-dropdown trigger="click" placement="bottom-end" popper-class="ops-user-dropdown">
          <button type="button" class="ops-layout__avatar" :aria-label="userName">
            {{ userInitial }}
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <div class="ops-layout__account-menu">
                <strong>{{ userName }}</strong>
                <span>{{ userEmail }}</span>
              </div>
              <el-dropdown-item divided @click="onLogout">
                <LogOut :size="14" :stroke-width="1.8" />
                <span>退出登录</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </header>

    <aside class="ops-layout__sidebar">
      <div class="ops-layout__nav-caption">秘钥中心</div>
      <nav class="ops-layout__nav" aria-label="秘钥中心导航">
        <button
          v-for="item in navItems"
          :key="item.path"
          type="button"
          class="ops-layout__nav-item"
          :class="{ 'is-active': isNavActive(item.path) }"
          :aria-label="item.label"
          :title="item.label"
          @click="navigate(item.path)"
        >
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
        </button>
      </nav>
    </aside>

    <main class="ops-layout__main">
      <RouterView />
    </main>
  </div>
</template>

<style lang="scss" scoped>
.ops-layout {
  display: grid;
  grid-template-columns: 221px minmax(0, 1fr);
  grid-template-rows: 52px minmax(0, 1fr);
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background: var(--v-app-bg);

  &__brand,
  &__sidebar {
    background: #020817;
    color: #fff;
  }

  &__brand {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 20px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.12);

    strong {
      font-size: 14px;
      font-weight: 650;
    }
  }

  &__brand-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 8px;
    background: #2563eb;
    box-shadow: 0 4px 10px rgba(37, 99, 235, 0.28);

    svg {
      width: 15px;
      height: 15px;
      fill: #fff;
    }
  }

  &__topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
    padding: 0 16px 0 32px;
    background: var(--v-surface-bg);
    border-bottom: 1px solid var(--v-divider);
  }

  &__modules {
    display: flex;
    align-items: center;
    gap: 3px;
  }

  &__tools {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  &__module {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 11px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--v-text-secondary);
    font: inherit;
    font-size: 14px;
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease;

    &:hover {
      color: var(--v-text-primary);
      background: var(--v-surface-row-hover);
    }

    &.is-active {
      color: #fff;
      background: #2563eb;
      box-shadow: 0 2px 5px rgba(37, 99, 235, 0.22);
    }

    .el-icon {
      font-size: 15px;
    }
  }

  &__icon-button {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--v-text-secondary);
    cursor: pointer;
    transition:
      color 0.15s ease,
      background 0.15s ease;

    &:hover {
      color: var(--v-text-primary);
      background: var(--v-surface-row-hover);
    }
  }

  &__notice-dot {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 5px;
    height: 5px;
    border: 1px solid var(--v-surface-bg);
    border-radius: 50%;
    background: #ef4444;
  }

  &__tool-divider {
    width: 1px;
    height: 18px;
    margin: 0 7px;
    background: var(--v-divider);
  }

  &__avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: #2563eb;
    color: #fff;
    font: inherit;
    font-size: 12px;
    font-weight: 650;
    cursor: pointer;
    transition:
      box-shadow 0.15s ease,
      transform 0.15s ease;

    &:hover,
    &:focus-visible {
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
      outline: none;
    }

    &:active {
      transform: scale(0.96);
    }
  }

  &__account-menu {
    display: flex;
    min-width: 190px;
    flex-direction: column;
    gap: 3px;
    padding: 9px 14px 8px;

    strong {
      color: var(--v-text-primary);
      font-size: 13px;
      font-weight: 600;
    }

    span {
      color: var(--v-text-secondary);
      font-size: 11px;
    }
  }

  &__sidebar {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  &__nav-caption {
    padding: 16px 22px 7px;
    color: #475569;
    font-size: 11px;
  }

  &__nav {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 4px;
    padding: 0 12px;
  }

  &__nav-item {
    display: flex;
    align-items: center;
    gap: 11px;
    width: 100%;
    height: 34px;
    padding: 0 12px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: #94a3b8;
    font: inherit;
    font-size: 14px;
    text-align: left;
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease;

    &:hover {
      color: #e2e8f0;
      background: #111c31;
    }

    &.is-active {
      color: #fff;
      background: #2563eb;
      box-shadow: 0 5px 14px rgba(37, 99, 235, 0.2);
    }

    .el-icon {
      flex: 0 0 auto;
      font-size: 17px;
    }
  }

  &__main {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--v-app-bg);
  }
}

.ops-notifications {
  margin: -4px -2px;

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px 9px;
    border-bottom: 1px solid var(--v-divider);

    strong {
      color: var(--v-text-primary);
      font-size: 13px;
    }

    span {
      color: #2563eb;
      font-size: 11px;
    }
  }

  button {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    width: 100%;
    padding: 10px 8px;
    border: 0;
    border-bottom: 1px solid var(--v-divider);
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;

    &:last-child {
      border-bottom: 0;
    }

    &:hover {
      background: var(--v-surface-row-hover);
    }

    > span:last-child {
      display: flex;
      min-width: 0;
      flex-direction: column;
      gap: 3px;
    }

    strong {
      color: var(--v-text-primary);
      font-size: 12px;
      font-weight: 550;
    }

    small {
      color: var(--v-text-tertiary);
      font-size: 10px;
    }
  }

  &__status {
    width: 7px;
    height: 7px;
    flex: 0 0 auto;
    margin-top: 5px;
    border-radius: 50%;

    &.is-blue {
      background: #2563eb;
    }

    &.is-amber {
      background: #f59e0b;
    }
  }
}

:global(.ops-user-dropdown .el-dropdown-menu__item svg) {
  flex: 0 0 auto;
  margin-right: 7px;
}

@media (max-width: 820px) {
  .ops-layout {
    grid-template-columns: 64px minmax(0, 1fr);

    &__brand {
      justify-content: center;
      padding: 0;

      strong {
        display: none;
      }
    }

    &__sidebar {
      align-items: center;
    }

    &__nav-caption,
    &__nav-item span {
      display: none;
    }

    &__nav {
      flex: 1;
      width: 100%;
      padding: 12px 8px;
    }

    &__nav-item {
      justify-content: center;
      padding: 0;
    }
  }
}

@media (max-width: 600px) {
  .ops-layout {
    &__topbar {
      padding: 0 8px;
    }

    &__module {
      width: 34px;
      justify-content: center;
      padding: 0;

      span {
        display: none;
      }
    }
  }
}
</style>
