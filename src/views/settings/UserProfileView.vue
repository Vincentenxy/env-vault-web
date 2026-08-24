<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { AtSign, Building2, IdCard, RefreshCw, UserRound, UsersRound } from '@lucide/vue'
import { getMe } from '@/api/me'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
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
const departmentName = computed(
  () => firstString(['departmentName', 'deptName', 'department', 'dept']) || '—',
)
const organizationName = computed(
  () => firstString(['organizationName', 'orgName', 'organization', 'org', 'tenantName']) || '—',
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
  if (!auth.currentUser) void loadProfile()
})
</script>

<template>
  <section v-loading="loading" class="profile-page">
    <header class="profile-page__toolbar">
      <h1>个人信息</h1>
      <el-tooltip content="刷新用户信息" placement="bottom">
        <button
          type="button"
          class="profile-page__refresh"
          :disabled="loading"
          aria-label="刷新用户信息"
          @click="loadProfile"
        >
          <RefreshCw :size="16" :stroke-width="1.8" />
        </button>
      </el-tooltip>
    </header>

    <main class="profile-page__content">
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
            <span class="profile-details__icon"><UserRound :size="17" :stroke-width="1.7" /></span>
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
            <span class="profile-details__icon"><UsersRound :size="17" :stroke-width="1.7" /></span>
            <span class="profile-details__copy">
              <small>部门</small>
              <strong :title="departmentName">{{ departmentName }}</strong>
            </span>
          </div>
          <div class="profile-details__item profile-details__item--wide">
            <span class="profile-details__icon"><Building2 :size="17" :stroke-width="1.7" /></span>
            <span class="profile-details__copy">
              <small>组织</small>
              <strong :title="organizationName">{{ organizationName }}</strong>
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
    </main>
  </section>
</template>

<style lang="scss" scoped>
.profile-page {
  width: 100%;
  height: 100%;
  min-height: 100%;
  overflow-y: auto;
  background: var(--v-page-bg);
  color: var(--v-text-primary);

  &__toolbar {
    min-height: 60px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
    border-bottom: 1px solid var(--v-divider);
    background: var(--v-surface-bg);

    h1 {
      margin: 0;
      font-size: 16px;
      font-weight: 650;
      letter-spacing: 0;
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
    color: #176dfb;
    cursor: pointer;

    &:hover:not(:disabled),
    &:focus-visible {
      border-color: #176dfb;
      background: rgba(23, 109, 251, 0.07);
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
  }
}

.profile-panel {
  overflow: hidden;
  border: 1px solid var(--v-surface-border);
  border-radius: 8px;
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
      font-size: 20px;
      font-weight: 700;
    }

    small {
      color: var(--v-text-secondary);
      font-size: 12px;
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
  background: #2563eb;
  box-shadow: 0 0 0 1px var(--v-surface-border);
  color: #fff;
  font-size: 28px;
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
    border-radius: 7px;
    background: rgba(23, 109, 251, 0.08);
    color: #176dfb;
  }

  &__copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;

    small {
      color: var(--v-text-tertiary);
      font-size: 11px;
    }

    strong {
      overflow: hidden;
      color: var(--v-text-primary);
      font-size: 13px;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
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
  font-size: 13px;

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
    font-size: 14px;
  }
}

@media (max-width: 700px) {
  .profile-page {
    &__toolbar {
      padding: 0 16px;
    }

    &__content {
      width: calc(100% - 32px);
      margin: 16px auto;
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
    font-size: 24px;
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
