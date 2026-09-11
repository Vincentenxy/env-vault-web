<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import {
  ArrowRight,
  AtSign,
  Building2,
  FolderKanban,
  IdCard,
  KeyRound,
  KeySquare,
  RefreshCw,
  UserRound,
  UsersRound,
} from '@lucide/vue'
import { useRouter } from 'vue-router'
import { useNavigationMemory } from '@/composables/use-navigation-memory'
import { getMe } from '@/api/me'
import { useAuthStore } from '@/stores/auth'
import type { UserProject } from '@/types/user'
import PersonalSecretPanel from './components/PersonalSecretPanel.vue'
import PersonalTokenPanel from './components/PersonalTokenPanel.vue'

type ProfileTab = 'profile' | 'secrets' | 'tokens'

const profileTabs: ProfileTab[] = ['profile', 'secrets', 'tokens']

const auth = useAuthStore()
const router = useRouter()
const navigation = useNavigationMemory('profile', { tab: 'profile' })
const activeTab = ref<ProfileTab>(
  profileTabs.find((tab) => tab === navigation.saved.tab) ?? 'profile',
)
navigation.track(() => ({ tab: activeTab.value }))
const loading = ref(false)
const loadFailed = ref(false)
const avatarLoadFailed = ref(false)

const user = computed(() => auth.currentUser)
const userRecord = computed<Record<string, unknown>>(() => asRecord(user.value))

const displayName = computed(
  () => firstString(['nickname', 'nickName', 'name', 'userName', 'displayName']) || '未命名用户',
)
const userId = computed(() => firstString(['userId', 'id', 'staffUserId']) || '—')
const email = computed(() => firstString(['email', 'mail']) || '—')
const projectGroupName = computed(
  () =>
    user.value?.orgName?.trim() ||
    firstString(['projectGroupName', 'projectTeamName', 'departmentName', 'deptName']) ||
    '—',
)
const organizationName = computed(
  () => user.value?.tenantName?.trim() || firstString(['organizationName']) || '—',
)
const projects = computed(() =>
  Array.isArray(user.value?.projectList) ? user.value.projectList : [],
)
const avatarUrl = computed(() => firstString(['avatarUrl', 'avatar', 'picture', 'photoUrl']) || '')
const userInitial = computed(() => displayName.value.slice(0, 1).toUpperCase())

watch(avatarUrl, () => {
  avatarLoadFailed.value = false
})

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function firstString(keys: string[]): string {
  for (const key of keys) {
    const candidate = userRecord.value[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()

    const nestedName = asRecord(candidate).name
    if (typeof nestedName === 'string' && nestedName.trim()) return nestedName.trim()
  }
  return ''
}

function selectTab(tab: ProfileTab): void {
  activeTab.value = tab
}

function openProject(project: UserProject): void {
  void router.push({ name: 'SecretList', query: { projectId: project.id } })
}

async function selectAdjacentTab(event: KeyboardEvent, tab: ProfileTab): Promise<void> {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return

  event.preventDefault()
  const currentIndex = profileTabs.indexOf(tab)
  const nextTab: ProfileTab =
    event.key === 'Home'
      ? 'profile'
      : event.key === 'End'
        ? 'tokens'
        : (profileTabs[
            (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + profileTabs.length) %
              profileTabs.length
          ] ?? 'profile')
  selectTab(nextTab)
  await nextTick()
  document.getElementById(`${nextTab}-tab`)?.focus()
}

async function loadProfile(): Promise<void> {
  if (loading.value) return

  loading.value = true
  loadFailed.value = false
  try {
    auth.setCurrentUser(await getMe())
  } catch {
    loadFailed.value = !auth.currentUser
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadProfile()
})
</script>

<template>
  <section class="profile-page">
    <header class="profile-page__toolbar">
      <div class="profile-page__toolbar-inner">
        <nav class="profile-page__tabs" role="tablist" aria-label="个人中心">
          <button
            id="profile-tab"
            type="button"
            class="profile-page__tab"
            :class="{ 'is-active': activeTab === 'profile' }"
            role="tab"
            :aria-selected="activeTab === 'profile'"
            :tabindex="activeTab === 'profile' ? 0 : -1"
            aria-controls="profile-panel"
            @click="selectTab('profile')"
            @keydown="selectAdjacentTab($event, 'profile')"
          >
            <UserRound :size="17" :stroke-width="1.8" />
            <span>个人信息</span>
          </button>
          <button
            id="secrets-tab"
            type="button"
            class="profile-page__tab"
            :class="{ 'is-active': activeTab === 'secrets' }"
            role="tab"
            :aria-selected="activeTab === 'secrets'"
            :tabindex="activeTab === 'secrets' ? 0 : -1"
            aria-controls="secrets-panel"
            @click="selectTab('secrets')"
            @keydown="selectAdjacentTab($event, 'secrets')"
          >
            <KeyRound :size="17" :stroke-width="1.8" />
            <span>我的密钥</span>
          </button>
          <button
            id="tokens-tab"
            type="button"
            class="profile-page__tab"
            :class="{ 'is-active': activeTab === 'tokens' }"
            role="tab"
            :aria-selected="activeTab === 'tokens'"
            :tabindex="activeTab === 'tokens' ? 0 : -1"
            aria-controls="tokens-panel"
            @click="selectTab('tokens')"
            @keydown="selectAdjacentTab($event, 'tokens')"
          >
            <KeySquare :size="17" :stroke-width="1.8" />
            <span>个人 Token</span>
          </button>
        </nav>

        <template v-if="activeTab === 'profile'">
          <button
            type="button"
            class="profile-page__refresh"
            :disabled="loading"
            aria-label="刷新用户信息"
            @click="loadProfile"
          >
            <RefreshCw :size="16" :stroke-width="1.8" />
          </button>
        </template>
      </div>
    </header>

    <main
      class="profile-page__content"
      :class="{ 'profile-page__content--wide': activeTab !== 'profile' }"
    >
      <section
        v-show="activeTab === 'profile'"
        id="profile-panel"
        v-loading="loading"
        role="tabpanel"
        aria-labelledby="profile-tab"
        class="profile-page__tab-panel"
      >
        <div v-if="user" class="profile-panel">
          <section class="profile-summary">
            <span class="profile-avatar" aria-hidden="true">
              <img
                v-if="avatarUrl && !avatarLoadFailed"
                :src="avatarUrl"
                alt=""
                @error="avatarLoadFailed = true"
              />
              <span v-else>{{ userInitial }}</span>
            </span>
            <span class="profile-summary__copy">
              <strong>{{ displayName }}</strong>
              <small>{{ email === '—' ? userId : email }}</small>
            </span>
          </section>

          <section class="profile-details" aria-label="账号基础信息">
            <div class="profile-details__item">
              <span class="profile-details__icon"
                ><UserRound :size="17" :stroke-width="1.7"
              /></span>
              <span class="profile-details__copy">
                <small>姓名</small>
                <strong>{{ displayName }}</strong>
              </span>
            </div>
            <div class="profile-details__item">
              <span class="profile-details__icon"><IdCard :size="17" :stroke-width="1.7" /></span>
              <span class="profile-details__copy">
                <small>用户 ID</small>
                <strong :title="userId">{{ userId }}</strong>
              </span>
            </div>
            <div class="profile-details__item">
              <span class="profile-details__icon"><AtSign :size="17" :stroke-width="1.7" /></span>
              <span class="profile-details__copy">
                <small>邮箱</small>
                <strong :title="email">{{ email }}</strong>
              </span>
            </div>
            <div class="profile-details__item">
              <span class="profile-details__icon"
                ><UsersRound :size="17" :stroke-width="1.7"
              /></span>
              <span class="profile-details__copy">
                <small>项目组</small>
                <strong :title="projectGroupName">{{ projectGroupName }}</strong>
              </span>
            </div>
            <div class="profile-details__item profile-details__item--wide">
              <span class="profile-details__icon"
                ><Building2 :size="17" :stroke-width="1.7"
              /></span>
              <span class="profile-details__copy">
                <small>组织</small>
                <strong :title="organizationName">{{ organizationName }}</strong>
              </span>
            </div>
            <div class="profile-details__item profile-details__item--wide">
              <span class="profile-details__icon"
                ><FolderKanban :size="17" :stroke-width="1.7"
              /></span>
              <span class="profile-details__copy">
                <small>项目</small>
                <span v-if="projects.length" class="profile-projects">
                  <button
                    v-for="project in projects"
                    :key="project.id"
                    type="button"
                    class="profile-projects__item"
                    :title="`进入 ${project.name} 的密钥管理`"
                    @click="openProject(project)"
                  >
                    <span>{{ project.name || '未命名项目' }}</span>
                    <ArrowRight :size="14" :stroke-width="1.8" />
                  </button>
                </span>
                <strong v-else>未分配项目</strong>
              </span>
            </div>
          </section>
        </div>

        <div v-else-if="!loading" class="profile-empty">
          <span class="profile-empty__icon"><UserRound :size="25" :stroke-width="1.6" /></span>
          <strong>{{ loadFailed ? '用户信息加载失败' : '暂无用户信息' }}</strong>
          <span>请重新加载当前账号信息</span>
          <el-button type="primary" plain @click="loadProfile">重新加载</el-button>
        </div>
      </section>

      <section
        v-show="activeTab === 'secrets'"
        id="secrets-panel"
        role="tabpanel"
        aria-labelledby="secrets-tab"
        class="profile-page__tab-panel"
      >
        <PersonalSecretPanel v-if="activeTab === 'secrets'" />
      </section>

      <section
        v-show="activeTab === 'tokens'"
        id="tokens-panel"
        role="tabpanel"
        aria-labelledby="tokens-tab"
        class="profile-page__tab-panel"
      >
        <PersonalTokenPanel v-if="activeTab === 'tokens'" />
      </section>
    </main>
  </section>
</template>

<style lang="scss" scoped>
.profile-page {
  width: 100%;
  height: 100%;
  min-height: 100%;
  overflow-y: auto;
  background: var(--v-app-bg);
  color: var(--v-text-primary);

  &__toolbar {
    border-bottom: 1px solid var(--v-divider);
    background: var(--v-surface-bg);
  }

  &__toolbar-inner {
    width: min(920px, calc(100% - 48px));
    min-height: 60px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin: 0 auto;
  }

  &__tabs {
    min-width: 0;
    align-self: stretch;
    display: flex;
    align-items: stretch;
    gap: 8px;
  }

  &__tab {
    min-width: 112px;
    min-height: 59px;
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 14px;
    border: 0;
    background: transparent;
    color: var(--v-text-secondary);
    font: inherit;
    font-size: var(--v-font-md);
    font-weight: 500;
    cursor: pointer;
    transition:
      color 0.18s ease,
      background-color 0.18s ease;

    &::after {
      content: '';
      position: absolute;
      right: 12px;
      bottom: -1px;
      left: 12px;
      height: 2px;
      border-radius: 2px 2px 0 0;
      background: var(--el-color-primary);
      opacity: 0;
      transform: scaleX(0.55);
      transition:
        opacity 0.18s ease,
        transform 0.18s ease;
    }

    &:hover {
      background: var(--v-surface-bg-subtle);
      color: var(--v-text-primary);
    }

    &:focus-visible {
      border-radius: var(--v-radius-sm);
      outline: 2px solid var(--el-color-primary-light-5);
      outline-offset: -4px;
    }

    &.is-active {
      background: var(--el-color-primary-light-9);
      color: var(--el-color-primary);
      font-weight: 600;

      &::after {
        opacity: 1;
        transform: scaleX(1);
      }
    }
  }

  &__refresh {
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid var(--v-surface-border);
    border-radius: 50%;
    background: var(--v-surface-bg);
    color: var(--v-text-secondary);
    cursor: pointer;

    &:hover:not(:disabled),
    &:focus-visible {
      border-color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      color: var(--el-color-primary);
      outline: none;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
  }

  &__content {
    width: min(920px, calc(100% - 48px));
    margin: 24px auto;

    &--wide {
      width: min(1280px, calc(100% - 48px));
    }
  }

  &__tab-panel {
    min-height: 360px;
  }
}

.profile-panel {
  overflow: hidden;
  border: 1px solid var(--v-surface-border);
  border-radius: var(--v-radius-md);
  background: var(--v-surface-bg);
  box-shadow: var(--v-shadow-sm);
}

.profile-summary {
  min-height: 146px;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 28px 32px;
  border-bottom: 1px solid var(--v-divider);

  &__copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 7px;

    strong,
    small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    strong {
      color: var(--v-text-primary);
      font-size: var(--v-font-2xl);
      font-weight: 700;
    }

    small {
      color: var(--v-text-secondary);
      font-size: var(--v-font-xs);
    }
  }
}

.profile-avatar {
  width: 80px;
  height: 80px;
  flex: 0 0 80px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 3px solid var(--v-surface-bg);
  border-radius: 50%;
  background: var(--el-color-primary);
  box-shadow: 0 0 0 1px var(--v-surface-border);
  color: var(--v-text-inverse);
  font-size: var(--v-font-3xl);
  font-weight: 700;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.profile-details {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));

  &__item {
    min-width: 0;
    min-height: 88px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 18px 24px;
    border-right: 1px solid var(--v-divider);
    border-bottom: 1px solid var(--v-divider);

    &:nth-child(2n) {
      border-right: 0;
    }

    &--wide {
      grid-column: 1 / -1;
      border-right: 0;
    }

    &:last-child {
      border-bottom: 0;
    }
  }

  &__icon {
    width: 34px;
    height: 34px;
    flex: 0 0 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--v-radius-sm);
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
  }

  &__copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;

    small {
      color: var(--v-text-tertiary);
      font-size: var(--v-font-xs);
    }

    strong {
      overflow: hidden;
      color: var(--v-text-primary);
      font-size: var(--v-font-sm);
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
}

.profile-projects {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  &__item {
    max-width: 240px;
    min-height: 30px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 9px;
    border: 1px solid var(--v-surface-border);
    border-radius: var(--v-radius-sm);
    background: var(--v-surface-bg-subtle);
    color: var(--v-text-secondary);
    font: inherit;
    font-size: var(--v-font-xs);
    font-weight: 600;
    cursor: pointer;

    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    svg {
      flex: 0 0 auto;
    }

    &:hover,
    &:focus-visible {
      border-color: var(--el-color-primary-light-5);
      background: var(--el-color-primary-light-9);
      color: var(--el-color-primary);
      outline: none;
    }
  }
}

.profile-empty {
  min-height: 360px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 9px;
  color: var(--v-text-secondary);
  font-size: var(--v-font-sm);

  &__icon {
    width: 48px;
    height: 48px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--v-surface-bg-subtle);
    color: var(--v-text-tertiary);
  }

  strong {
    color: var(--v-text-primary);
    font-size: var(--v-font-md);
  }

  &--secrets {
    border: 1px dashed var(--v-surface-border);
    border-radius: var(--v-radius-md);
    background: var(--v-surface-bg);
  }
}

@media (max-width: 700px) {
  .profile-page {
    &__toolbar-inner {
      width: calc(100% - 32px);
    }

    &__tabs {
      gap: 0;
    }

    &__tab {
      min-width: 0;
      flex: 1 1 0;
      padding: 0 8px;
    }

    &__content {
      width: calc(100% - 32px);
      margin: 16px auto;

      &--wide {
        width: calc(100% - 32px);
      }
    }
  }

  .profile-summary {
    min-height: 126px;
    padding: 22px 20px;
  }

  .profile-avatar {
    width: 68px;
    height: 68px;
    flex-basis: 68px;
    font-size: var(--v-font-2xl);
  }

  .profile-details {
    grid-template-columns: minmax(0, 1fr);

    &__item,
    &__item:nth-child(2n),
    &__item--wide {
      grid-column: auto;
      border-right: 0;
      border-bottom: 1px solid var(--v-divider);
    }

    &__item:last-child {
      border-bottom: 0;
    }
  }
}
</style>
