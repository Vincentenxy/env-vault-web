<script setup lang="ts">
import { computed, reactive, ref, type Component } from 'vue'
import { ElMessage } from 'element-plus'
import { FolderOpen, Globe, KeyRound } from '@lucide/vue'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CopyDocument,
  Delete,
  Edit,
  FolderOpened,
  Hide,
  Key as ElementKey,
  OfficeBuilding,
  Plus,
  Search,
  Star,
  StarFilled,
  View,
} from '@element-plus/icons-vue'
import { copyToClipboard } from '@/utils/copy'

type FolderType = 'customer' | 'global' | 'groups'
type CascadeLevel = 'organization' | 'project'
type SecretEnv = 'dev' | 'test' | 'sim'

interface ProjectOption {
  id: string
  orgId: string
  name: string
}

interface OrganizationOption {
  id: string
  name: string
}

interface VaultFolder {
  id: string
  projectId: string
  name: string
  type: FolderType
  description: string
  owner: string
  count: number
  groups?: number
  favorite: boolean
}

interface SecretRow {
  key: string
  dev: string
  test: string
  sim: string
}

interface ServiceGroup {
  id: string
  name: string
  description: string
  count: number
}

const organizations: OrganizationOption[] = [
  { id: 'org-1', name: '技术中台' },
  { id: 'org-2', name: '金融科技' },
  { id: 'org-3', name: '数据平台' },
]

const projects: ProjectOption[] = [
  { id: 'project-1', orgId: 'org-1', name: '用户服务平台' },
  { id: 'project-2', orgId: 'org-1', name: '订单管理系统' },
  { id: 'project-3', orgId: 'org-2', name: '支付网关' },
  { id: 'project-4', orgId: 'org-2', name: '风控引擎' },
  { id: 'project-5', orgId: 'org-3', name: '数据仓库' },
]

const folders = reactive<VaultFolder[]>([
  {
    id: 'customer-prod',
    projectId: 'project-1',
    name: 'customer-prod',
    type: 'customer',
    description: '生产环境客户专属配置，包含数据库连接、JWT 密钥、OSS 凭证等核心参数',
    owner: '张明',
    count: 8,
    favorite: true,
  },
  {
    id: 'global',
    projectId: 'project-1',
    name: 'global',
    type: 'global',
    description: '全局通用配置，所有服务共享的基础参数，如 Region、日志级别、连接池大小',
    owner: '李华',
    count: 7,
    favorite: false,
  },
  {
    id: 'groups',
    projectId: 'project-1',
    name: 'groups',
    type: 'groups',
    description: '按微服务分组管理的配置，每个分组对应一个独立微服务的专属配置集',
    owner: '王芳',
    count: 10,
    groups: 3,
    favorite: true,
  },
  {
    id: 'customer-staging',
    projectId: 'project-1',
    name: 'customer-staging',
    type: 'customer',
    description: '预发布环境客户配置，与生产环境隔离的独立参数集',
    owner: '陈磊',
    count: 2,
    favorite: false,
  },
  {
    id: 'api-keys',
    projectId: 'project-1',
    name: 'api-keys',
    type: 'customer',
    description: '第三方 API 密钥集中管理，包含支付、短信、地图等服务的接入凭证',
    owner: '赵静',
    count: 3,
    favorite: false,
  },
  {
    id: 'infra-global',
    projectId: 'project-1',
    name: 'infra-global',
    type: 'global',
    description: '基础设施层全局配置，K8s 命名空间、Docker Registry、服务网格参数',
    owner: '刘强',
    count: 3,
    favorite: false,
  },
])

const secretRows = reactive<Record<string, SecretRow[]>>({
  'customer-prod': [
    {
      key: 'database.host',
      dev: 'localhost:5432',
      test: 'test-db.company.com:5432',
      sim: 'sim-db.company.com:5432',
    },
    {
      key: 'database.password',
      dev: 'dev_pass_2024',
      test: 'test_p@ss_2024!',
      sim: 'sim_secure_pass#2024',
    },
    {
      key: 'redis.host',
      dev: 'localhost:6379',
      test: 'test-redis.company.com:6379',
      sim: 'sim-redis.company.com:6379',
    },
    {
      key: 'redis.password',
      dev: 'dev_redis_pass',
      test: 'test_redis_pass_2024',
      sim: 'sim_redis_pass_2024',
    },
    {
      key: 'jwt.secret',
      dev: 'dev_jwt_secret_key_2024',
      test: 'test_jwt_secret_key_2024!',
      sim: 'sim_jwt_secret_secure#2024',
    },
    {
      key: 'oss.access.key.id',
      dev: 'DEV_ACCESS_KEY_ID_2024',
      test: 'TEST_ACCESS_KEY_ID_2024',
      sim: 'SIM_ACCESS_KEY_ID_2024',
    },
    {
      key: 'oss.access.key',
      dev: 'dev_oss_secret_key',
      test: 'test_oss_secret_key',
      sim: 'sim_oss_secret_key',
    },
    {
      key: 'smtp.password',
      dev: 'dev_smtp_pass',
      test: 'test_smtp_password',
      sim: 'sim_smtp_password',
    },
  ],
  global: [
    { key: 'app.region', dev: 'cn-shanghai', test: '', sim: '' },
    { key: 'log.level', dev: 'INFO', test: '', sim: '' },
    { key: 'pool.max.size', dev: '50', test: '', sim: '' },
    { key: 'timezone', dev: 'Asia/Shanghai', test: '', sim: '' },
    { key: 'trace.enabled', dev: 'true', test: '', sim: '' },
    { key: 'service.timeout', dev: '30000', test: '', sim: '' },
    { key: 'retry.count', dev: '3', test: '', sim: '' },
  ],
  'customer-staging': [
    {
      key: 'api.endpoint',
      dev: 'http://localhost:8080',
      test: 'https://test-api.company.com',
      sim: 'https://sim-api.company.com',
    },
    { key: 'database.password', dev: 'staging_dev', test: 'staging_test', sim: 'staging_sim' },
  ],
  'api-keys': [
    { key: 'payment.api.key', dev: 'pay_dev_key', test: 'pay_test_key', sim: 'pay_sim_key' },
    { key: 'sms.api.key', dev: 'sms_dev_key', test: 'sms_test_key', sim: 'sms_sim_key' },
    { key: 'maps.api.key', dev: 'maps_dev_key', test: 'maps_test_key', sim: 'maps_sim_key' },
  ],
  'infra-global': [
    { key: 'k8s.namespace', dev: 'platform-core', test: '', sim: '' },
    { key: 'docker.registry', dev: 'registry.company.com', test: '', sim: '' },
    { key: 'service.mesh', dev: 'istio-system', test: '', sim: '' },
  ],
})

const serviceGroups: ServiceGroup[] = [
  {
    id: 'user-service',
    name: 'user-service',
    description: '用户、认证及个人资料服务配置',
    count: 4,
  },
  {
    id: 'order-service',
    name: 'order-service',
    description: '订单处理与状态流转服务配置',
    count: 3,
  },
  {
    id: 'notification-service',
    name: 'notification-service',
    description: '邮件、短信及站内通知服务配置',
    count: 3,
  },
]

const groupRows = reactive<Record<string, SecretRow[]>>({
  'user-service': [
    { key: 'jwt.expire.seconds', dev: '7200', test: '', sim: '' },
    { key: 'profile.cache.ttl', dev: '600', test: '', sim: '' },
    { key: 'auth.max.retry', dev: '5', test: '', sim: '' },
    { key: 'mfa.enabled', dev: 'true', test: '', sim: '' },
  ],
  'order-service': [
    { key: 'order.lock.timeout', dev: '30', test: '', sim: '' },
    { key: 'order.worker.count', dev: '8', test: '', sim: '' },
    { key: 'payment.retry', dev: '3', test: '', sim: '' },
  ],
  'notification-service': [
    { key: 'smtp.host', dev: 'smtp.company.com', test: '', sim: '' },
    { key: 'sms.provider', dev: 'aliyun', test: '', sim: '' },
    { key: 'template.locale', dev: 'zh-CN', test: '', sim: '' },
  ],
})

const selectedOrgId = ref('org-1')
const selectedProjectId = ref('project-1')
const cascadeLevel = ref<CascadeLevel>('organization')
const cascadeSearch = ref('')
const cascadeOpen = ref(false)
const folderSearch = ref('')
const activeFolderId = ref('')
const activeGroupId = ref('')
const revealedCells = reactive<Record<string, boolean>>({})
const keyDialogVisible = ref(false)
const keyForm = reactive({ key: '', dev: '', test: '', sim: '' })

const selectedOrg = computed<OrganizationOption>(
  () => organizations.find((item) => item.id === selectedOrgId.value) ?? organizations[0]!,
)
const selectedProject = computed<ProjectOption>(
  () => projects.find((item) => item.id === selectedProjectId.value) ?? projects[0]!,
)
const availableProjects = computed(() =>
  projects.filter((item) => item.orgId === selectedOrgId.value),
)
const activeFolder = computed(
  () => folders.find((item) => item.id === activeFolderId.value) ?? null,
)
const visibleFolders = computed(() => {
  const keyword = folderSearch.value.trim().toLowerCase()
  return folders.filter((folder) => {
    if (folder.projectId !== selectedProjectId.value) return false
    return (
      !keyword ||
      folder.name.toLowerCase().includes(keyword) ||
      folder.description.toLowerCase().includes(keyword)
    )
  })
})
const activeRows = computed(() => {
  const rows = activeGroupId.value
    ? (groupRows[activeGroupId.value] ?? [])
    : (secretRows[activeFolderId.value] ?? [])
  const keyword = folderSearch.value.trim().toLowerCase()
  return keyword ? rows.filter((row) => row.key.toLowerCase().includes(keyword)) : rows
})
const cascadeItems = computed(() => {
  const keyword = cascadeSearch.value.trim().toLowerCase()
  const items = cascadeLevel.value === 'organization' ? organizations : availableProjects.value
  return items.filter((item) => !keyword || item.name.toLowerCase().includes(keyword))
})
const activeServiceGroup = computed(
  () => serviceGroups.find((item) => item.id === activeGroupId.value) ?? null,
)

function folderMeta(type: FolderType): { label: string; icon: Component } {
  if (type === 'global') return { label: '全局配置', icon: Globe }
  if (type === 'groups') return { label: '分组配置', icon: FolderOpen }
  return { label: '客户配置', icon: KeyRound }
}

function ownerColor(owner: string): string {
  const colors: Record<string, string> = {
    张明: '#4f46e5',
    李华: '#2563eb',
    王芳: '#2563eb',
    陈磊: '#0d9488',
    赵静: '#d97706',
    刘强: '#059669',
  }
  return colors[owner] ?? '#2563eb'
}

function selectOrganization(id: string): void {
  selectedOrgId.value = id
  selectedProjectId.value = projects.find((item) => item.orgId === id)?.id ?? ''
  cascadeLevel.value = 'project'
  cascadeSearch.value = ''
}

function selectProject(id: string): void {
  selectedProjectId.value = id
  cascadeOpen.value = false
  cascadeSearch.value = ''
}

function switchCascadeLevel(level: CascadeLevel): void {
  cascadeLevel.value = level
  cascadeSearch.value = ''
}

function selectCascadeItem(id: string): void {
  if (cascadeLevel.value === 'organization') selectOrganization(id)
  else selectProject(id)
}

function openFolder(folder: VaultFolder): void {
  activeFolderId.value = folder.id
  activeGroupId.value = ''
  folderSearch.value = ''
}

function goBack(): void {
  if (activeGroupId.value) {
    activeGroupId.value = ''
    folderSearch.value = ''
    return
  }
  activeFolderId.value = ''
  folderSearch.value = ''
}

function closeDetail(): void {
  activeFolderId.value = ''
  activeGroupId.value = ''
}

function toggleFavorite(folder: VaultFolder): void {
  folder.favorite = !folder.favorite
}

function cellId(row: SecretRow, env: SecretEnv): string {
  return `${activeFolderId.value}:${activeGroupId.value}:${row.key}:${env}`
}

function displayValue(row: SecretRow, env: SecretEnv): string {
  return revealedCells[cellId(row, env)] ? row[env] : '••••••••'
}

function toggleReveal(row: SecretRow, env: SecretEnv): void {
  const id = cellId(row, env)
  revealedCells[id] = !revealedCells[id]
}

async function copyValue(value: string): Promise<void> {
  const copied = await copyToClipboard(value)
  ElMessage[copied ? 'success' : 'warning'](
    copied ? '已复制到剪贴板' : '复制失败，请检查浏览器权限',
  )
}

function openKeyDialog(): void {
  keyForm.key = ''
  keyForm.dev = ''
  keyForm.test = ''
  keyForm.sim = ''
  keyDialogVisible.value = true
}

function createKey(): void {
  const key = keyForm.key.trim()
  if (!key || !activeFolder.value) {
    ElMessage.warning('请输入密钥名称')
    return
  }
  const target = activeGroupId.value
    ? (groupRows[activeGroupId.value] ??= [])
    : (secretRows[activeFolder.value.id] ??= [])
  target.push({ key, dev: keyForm.dev, test: keyForm.test, sim: keyForm.sim })
  activeFolder.value.count += 1
  keyDialogVisible.value = false
  ElMessage.success('密钥已创建')
}

function deleteKey(row: SecretRow): void {
  const target = activeGroupId.value
    ? groupRows[activeGroupId.value]
    : secretRows[activeFolderId.value]
  const index = target?.indexOf(row) ?? -1
  if (index >= 0) target?.splice(index, 1)
  if (activeFolder.value && activeFolder.value.count > 0) activeFolder.value.count -= 1
  ElMessage.success('密钥已删除')
}

function editKey(): void {
  ElMessage.info('编辑表单将在接口字段确认后接入')
}
</script>

<template>
  <div class="vault-page">
    <template v-if="!activeFolder">
      <div class="vault-page__toolbar">
        <el-popover
          v-model:visible="cascadeOpen"
          placement="bottom-start"
          :width="330"
          trigger="click"
          popper-class="vault-cascade-popper"
        >
          <template #reference>
            <button type="button" class="vault-page__cascade">
              <el-icon><OfficeBuilding /></el-icon>
              <strong>{{ selectedOrg.name }}</strong>
              <el-icon class="vault-page__chevron"><ArrowRight /></el-icon>
              <el-icon><FolderOpened /></el-icon>
              <strong>{{ selectedProject.name }}</strong>
              <el-icon class="vault-page__cascade-down"><ArrowRight /></el-icon>
            </button>
          </template>

          <div class="vault-cascade">
            <el-input
              v-model="cascadeSearch"
              :prefix-icon="Search"
              placeholder="搜索..."
              clearable
            />
            <div class="vault-cascade__tabs">
              <button
                type="button"
                :class="{ 'is-active': cascadeLevel === 'organization' }"
                @click="switchCascadeLevel('organization')"
              >
                组织
                <el-icon v-if="selectedOrgId"><Check /></el-icon>
              </button>
              <button
                type="button"
                :class="{ 'is-active': cascadeLevel === 'project' }"
                @click="switchCascadeLevel('project')"
              >
                项目
                <el-icon v-if="selectedProjectId"><Check /></el-icon>
              </button>
            </div>
            <div class="vault-cascade__list">
              <button
                v-for="item in cascadeItems"
                :key="item.id"
                type="button"
                :class="{
                  'is-selected':
                    cascadeLevel === 'organization'
                      ? item.id === selectedOrgId
                      : item.id === selectedProjectId,
                }"
                @click="selectCascadeItem(item.id)"
              >
                <span>{{ item.name }}</span>
                <el-icon v-if="cascadeLevel === 'organization'"><ArrowRight /></el-icon>
                <el-icon v-else-if="item.id === selectedProjectId" class="vault-cascade__check"
                  ><Check
                /></el-icon>
              </button>
              <div v-if="cascadeItems.length === 0" class="vault-cascade__empty">没有匹配项</div>
            </div>
          </div>
        </el-popover>
      </div>

      <div class="vault-page__content">
        <div v-if="visibleFolders.length" class="vault-folders">
          <article
            v-for="folder in visibleFolders"
            :key="folder.id"
            class="vault-folder"
            tabindex="0"
            role="button"
            @click="openFolder(folder)"
            @keydown.enter="openFolder(folder)"
          >
            <div class="vault-folder__top">
              <span class="vault-folder__icon" :class="`is-${folder.type}`">
                <el-icon><component :is="folderMeta(folder.type).icon" /></el-icon>
              </span>
              <span class="vault-folder__labels">
                <span class="vault-folder__tag" :class="`is-${folder.type}`">
                  {{ folderMeta(folder.type).label }}
                </span>
                <button
                  type="button"
                  class="vault-folder__favorite"
                  :class="{ 'is-active': folder.favorite }"
                  :aria-label="folder.favorite ? '取消收藏' : '收藏'"
                  @click.stop="toggleFavorite(folder)"
                >
                  <el-icon><component :is="folder.favorite ? StarFilled : Star" /></el-icon>
                </button>
              </span>
            </div>

            <h2>{{ folder.name }}</h2>
            <p>{{ folder.description }}</p>

            <footer>
              <span class="vault-folder__owner">
                <span
                  class="vault-folder__avatar"
                  :style="{ background: ownerColor(folder.owner) }"
                >
                  {{ folder.owner.slice(0, 1) }}
                </span>
                {{ folder.owner }}
              </span>
              <span v-if="folder.type === 'groups'"
                >{{ folder.groups }} 个分组 · {{ folder.count }} 个密钥</span
              >
              <span v-else>{{ folder.count }} 个密钥</span>
            </footer>
          </article>
        </div>

        <div v-else class="vault-empty">
          <el-icon><FolderOpened /></el-icon>
          <strong>暂无匹配文件夹</strong>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="vault-page__detail-head">
        <button type="button" class="vault-page__back" aria-label="返回" @click="goBack">
          <el-icon><ArrowLeft /></el-icon>
        </button>
        <button type="button" @click="closeDetail">
          {{ selectedOrg.name }}
        </button>
        <el-icon><ArrowRight /></el-icon>
        <button type="button" @click="closeDetail">
          {{ selectedProject.name }}
        </button>
        <el-icon><ArrowRight /></el-icon>
        <button v-if="activeGroupId" type="button" @click="activeGroupId = ''">
          {{ activeFolder.name }}
        </button>
        <el-icon v-if="activeGroupId"><ArrowRight /></el-icon>
        <strong>{{ activeServiceGroup?.name ?? activeFolder.name }}</strong>
      </div>

      <div class="vault-page__detail-toolbar">
        <div class="vault-page__detail-meta">
          <span class="vault-folder__tag" :class="`is-${activeFolder.type}`">
            {{ activeGroupId ? '分组配置' : folderMeta(activeFolder.type).label }}
          </span>
          <span>{{ activeRows.length }} 个密钥</span>
        </div>
        <div class="vault-page__toolbar-actions">
          <el-input
            v-model="folderSearch"
            :prefix-icon="Search"
            clearable
            class="vault-page__search"
            placeholder="搜索密钥名..."
          />
          <el-button type="primary" :icon="Plus" @click="openKeyDialog">新建密钥</el-button>
        </div>
      </div>

      <div v-if="activeFolder.type === 'groups' && !activeGroupId" class="vault-page__content">
        <div class="vault-groups">
          <article
            v-for="group in serviceGroups"
            :key="group.id"
            tabindex="0"
            role="button"
            @click="activeGroupId = group.id"
            @keydown.enter="activeGroupId = group.id"
          >
            <span class="vault-folder__icon is-groups"
              ><el-icon><FolderOpened /></el-icon
            ></span>
            <div>
              <h2>{{ group.name }}</h2>
              <p>{{ group.description }}</p>
            </div>
            <span>{{ group.count }} 个密钥</span>
            <el-icon><ArrowRight /></el-icon>
          </article>
        </div>
      </div>

      <div v-else class="vault-table-wrap">
        <table
          v-if="activeRows.length"
          class="vault-table"
          :class="{ 'is-global': activeFolder.type === 'global' || activeGroupId }"
        >
          <thead>
            <tr v-if="activeFolder.type === 'customer' && !activeGroupId">
              <th>密钥名称</th>
              <th><span class="vault-env is-dev">DEV</span> 开发环境</th>
              <th><span class="vault-env is-test">TEST</span> 测试环境</th>
              <th><span class="vault-env is-sim">SIM</span> 仿真环境</th>
              <th>操作</th>
            </tr>
            <tr v-else>
              <th>密钥名称</th>
              <th>密钥值</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in activeRows" :key="row.key">
              <td>
                <span class="vault-table__key"
                  ><el-icon><ElementKey /></el-icon><code>{{ row.key }}</code></span
                >
              </td>

              <template v-if="activeFolder.type === 'customer' && !activeGroupId">
                <td v-for="env in ['dev', 'test', 'sim'] as SecretEnv[]" :key="env">
                  <span class="vault-table__value">
                    <code>{{ displayValue(row, env) }}</code>
                    <span class="vault-table__value-actions">
                      <button
                        type="button"
                        :aria-label="revealedCells[cellId(row, env)] ? '隐藏' : '显示'"
                        @click="toggleReveal(row, env)"
                      >
                        <el-icon
                          ><component :is="revealedCells[cellId(row, env)] ? Hide : View"
                        /></el-icon>
                      </button>
                      <button type="button" aria-label="复制" @click="copyValue(row[env])">
                        <el-icon><CopyDocument /></el-icon>
                      </button>
                    </span>
                  </span>
                </td>
              </template>

              <td v-else>
                <span class="vault-table__value">
                  <code>{{ displayValue(row, 'dev') }}</code>
                  <span class="vault-table__value-actions">
                    <button
                      type="button"
                      :aria-label="revealedCells[cellId(row, 'dev')] ? '隐藏' : '显示'"
                      @click="toggleReveal(row, 'dev')"
                    >
                      <el-icon
                        ><component :is="revealedCells[cellId(row, 'dev')] ? Hide : View"
                      /></el-icon>
                    </button>
                    <button type="button" aria-label="复制" @click="copyValue(row.dev)">
                      <el-icon><CopyDocument /></el-icon>
                    </button>
                  </span>
                </span>
              </td>

              <td class="vault-table__operations">
                <button type="button" @click="editKey">
                  <el-icon><Edit /></el-icon><span>编辑</span>
                </button>
                <button type="button" class="is-danger" @click="deleteKey(row)">
                  <el-icon><Delete /></el-icon><span>删除</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else class="vault-empty">
          <el-icon><ElementKey /></el-icon>
          <strong>暂无密钥</strong>
        </div>
      </div>
    </template>

    <el-dialog
      v-model="keyDialogVisible"
      title="新建密钥"
      width="560px"
      :close-on-click-modal="false"
    >
      <el-form label-position="top">
        <el-form-item label="密钥名称" required>
          <el-input v-model="keyForm.key" placeholder="例如 database.password" />
        </el-form-item>
        <template v-if="activeFolder?.type === 'customer' && !activeGroupId">
          <el-form-item label="DEV 开发环境"
            ><el-input v-model="keyForm.dev" show-password
          /></el-form-item>
          <el-form-item label="TEST 测试环境"
            ><el-input v-model="keyForm.test" show-password
          /></el-form-item>
          <el-form-item label="SIM 仿真环境"
            ><el-input v-model="keyForm.sim" show-password
          /></el-form-item>
        </template>
        <el-form-item v-else label="密钥值"
          ><el-input v-model="keyForm.dev" show-password
        /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="keyDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="createKey">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
.vault-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  color: var(--v-text-primary);

  &__toolbar,
  &__detail-head,
  &__detail-toolbar {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
    background: var(--v-surface-bg-subtle);
    border-bottom: 1px solid var(--v-divider);
  }

  &__toolbar {
    min-height: 59px;
    padding: 0 24px;
  }

  &__cascade {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 430px;
    height: 32px;
    padding: 0 12px;
    border: 1px solid var(--v-surface-border);
    border-radius: 9px;
    background: var(--v-surface-bg);
    color: var(--v-text-secondary);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
    box-shadow: var(--v-shadow-sm);

    strong {
      color: var(--v-text-primary);
      font-weight: 600;
      white-space: nowrap;
    }
  }

  &__chevron {
    color: var(--v-text-tertiary);
    font-size: 12px;
  }

  &__cascade-down {
    margin-left: 1px;
    transform: rotate(90deg);
    color: var(--v-text-tertiary);
    font-size: 11px;
  }

  &__toolbar-actions,
  &__detail-meta {
    display: flex;
    align-items: center;
  }

  &__toolbar-actions {
    gap: 8px;
  }

  &__search {
    width: 210px;

    :deep(.el-input__wrapper) {
      border-radius: 9px;
      background: var(--v-app-bg);
      box-shadow: none;
    }
  }

  &__content {
    flex: 1;
    min-height: 0;
    padding: 19px 24px;
    overflow: auto;
    background: var(--v-app-bg);
  }

  &__detail-head {
    justify-content: flex-start;
    gap: 8px;
    min-height: 46px;
    padding: 0 22px;
    color: var(--v-text-tertiary);
    font-size: 13px;

    > button:not(.vault-page__back) {
      max-width: 220px;
      padding: 0;
      overflow: hidden;
      border: 0;
      background: transparent;
      color: var(--v-text-secondary);
      font: inherit;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;

      &:hover {
        color: #2563eb;
      }
    }

    > .el-icon {
      flex: 0 0 auto;
      font-size: 11px;
    }

    strong {
      overflow: hidden;
      color: var(--v-text-primary);
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  &__back {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--v-text-secondary);
    cursor: pointer;

    &:hover {
      background: var(--v-surface-row-hover);
      color: var(--v-text-primary);
    }
  }

  &__detail-toolbar {
    min-height: 55px;
    padding: 0 22px;
    background: var(--v-app-bg);
  }

  &__detail-meta {
    gap: 10px;
    color: var(--v-text-secondary);
    font-size: 13px;
  }
}

.vault-folders {
  display: flex;
  align-items: stretch;
  width: max-content;
  min-width: 100%;
  gap: 16px;
}

.vault-folder {
  display: flex;
  width: 283px;
  min-width: 283px;
  min-height: 189px;
  flex: 0 0 283px;
  flex-direction: column;
  padding: 19px 18px 16px;
  border: 1px solid var(--v-surface-border);
  border-radius: 8px;
  background: var(--v-surface-bg);
  box-shadow: var(--v-shadow-sm);
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;

  &:hover,
  &:focus-visible {
    border-color: #bfdbfe;
    box-shadow: 0 5px 16px rgba(15, 23, 42, 0.07);
    outline: none;
    transform: translateY(-1px);

    .vault-folder__favorite:not(.is-active) {
      opacity: 1;
    }
  }

  &__top,
  &__labels,
  &__owner,
  footer {
    display: flex;
    align-items: center;
  }

  &__top {
    justify-content: space-between;
  }

  &__labels {
    gap: 7px;
  }

  &__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    font-size: 20px;

    &.is-customer {
      background: #eff6ff;
      color: #2563eb;
    }

    &.is-global {
      background: #ecfdf5;
      color: #059669;
    }

    &.is-groups {
      background: #faf5ff;
      color: #9333ea;
    }
  }

  &__tag {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 8px;
    border: 1px solid;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;

    &.is-customer {
      border-color: #bfdbfe;
      background: #eff6ff;
      color: #2563eb;
    }

    &.is-global {
      border-color: #a7f3d0;
      background: #ecfdf5;
      color: #059669;
    }

    &.is-groups {
      border-color: #ddd6fe;
      background: #f5f3ff;
      color: #7c3aed;
    }
  }

  &__favorite {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    background: transparent;
    color: #f59e0b;
    cursor: pointer;
    opacity: 0;
    transition:
      opacity 0.15s ease,
      transform 0.15s ease;

    &:hover {
      transform: scale(1.08);
    }

    &.is-active {
      opacity: 1;
    }
  }

  h2 {
    margin: 11px 0 5px;
    overflow: hidden;
    color: var(--v-text-primary);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 14px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  p {
    display: -webkit-box;
    min-height: 40px;
    margin: 0 0 12px;
    overflow: hidden;
    color: var(--v-text-secondary);
    font-size: 12px;
    line-height: 1.65;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  footer {
    justify-content: space-between;
    margin-top: auto;
    padding-top: 11px;
    border-top: 1px solid var(--v-divider);
    color: var(--v-text-secondary);
    font-size: 12px;
  }

  &__owner {
    gap: 7px;
  }

  &__avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 21px;
    height: 21px;
    border-radius: 50%;
    color: #fff;
    font-size: 10px;
    font-weight: 650;
  }
}

.vault-empty {
  display: flex;
  min-height: 260px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--v-text-tertiary);

  > .el-icon {
    font-size: 38px;
  }

  strong {
    color: var(--v-text-secondary);
    font-size: 14px;
  }

  button {
    padding: 0;
    border: 0;
    background: transparent;
    color: #2563eb;
    cursor: pointer;
  }
}

.vault-table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: var(--v-surface-bg);
}

.vault-table {
  width: 100%;
  min-width: 920px;
  border-collapse: collapse;
  table-layout: fixed;

  th,
  td {
    height: 46px;
    padding: 0 22px;
    border-bottom: 1px solid var(--v-divider);
    text-align: left;
    vertical-align: middle;
  }

  th {
    height: 39px;
    background: var(--v-surface-bg-subtle);
    color: var(--v-text-secondary);
    font-size: 12px;
    font-weight: 600;
  }

  td {
    color: var(--v-text-primary);
    font-size: 13px;
  }

  th:first-child,
  td:first-child {
    width: 20%;
  }

  th:last-child,
  td:last-child {
    width: 130px;
  }

  tbody tr:hover {
    background: var(--v-surface-bg-subtle);

    .vault-table__value-actions {
      opacity: 1;
    }
  }

  &.is-global {
    min-width: 700px;

    th:first-child,
    td:first-child {
      width: 34%;
    }
  }

  &__key,
  &__value,
  &__value-actions,
  &__operations {
    display: flex;
    align-items: center;
  }

  &__key {
    min-width: 0;
    gap: 8px;

    .el-icon {
      flex: 0 0 auto;
      color: var(--v-text-secondary);
      transform: rotate(-35deg);
    }

    code {
      overflow: hidden;
      color: var(--v-text-primary);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  &__value {
    min-width: 0;
    justify-content: space-between;
    gap: 8px;

    > code {
      overflow: hidden;
      color: var(--v-text-secondary);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
      letter-spacing: 0;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  &__value-actions {
    flex: 0 0 auto;
    gap: 1px;
    opacity: 0;
    transition: opacity 0.15s ease;

    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 25px;
      height: 25px;
      padding: 0;
      border: 0;
      border-radius: 5px;
      background: transparent;
      color: var(--v-text-secondary);
      cursor: pointer;

      &:hover {
        background: var(--v-surface-row-hover);
        color: #2563eb;
      }
    }
  }

  &__operations {
    gap: 10px;

    button {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 0;
      border: 0;
      background: transparent;
      color: #2563eb;
      font: inherit;
      font-size: 12px;
      cursor: pointer;

      .el-icon {
        display: none;
      }

      &.is-danger {
        color: #ef4444;
      }
    }
  }
}

.vault-env {
  display: inline-flex;
  align-items: center;
  height: 20px;
  margin-right: 5px;
  padding: 0 6px;
  border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10px;

  &.is-dev {
    background: #ecfeff;
    color: #0891b2;
  }

  &.is-test {
    background: #fffbeb;
    color: #d97706;
  }

  &.is-sim {
    background: #f5f3ff;
    color: #7c3aed;
  }
}

.vault-groups {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;

  article {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) auto 18px;
    align-items: center;
    gap: 12px;
    min-height: 100px;
    padding: 16px;
    border: 1px solid var(--v-surface-border);
    border-radius: 8px;
    background: var(--v-surface-bg);
    color: var(--v-text-secondary);
    cursor: pointer;

    &:hover,
    &:focus-visible {
      border-color: #c4b5fd;
      box-shadow: var(--v-shadow-md);
      outline: none;
    }

    h2 {
      margin: 0 0 5px;
      color: var(--v-text-primary);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 14px;
    }

    p {
      margin: 0;
      color: var(--v-text-secondary);
      font-size: 12px;
      line-height: 1.5;
    }

    > span:not(.vault-folder__icon) {
      font-size: 12px;
      white-space: nowrap;
    }
  }
}

.vault-cascade {
  &__tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    margin-top: 10px;
    border-bottom: 1px solid var(--v-divider);

    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      height: 36px;
      border: 0;
      border-bottom: 2px solid transparent;
      background: transparent;
      color: var(--v-text-secondary);
      font: inherit;
      font-size: 13px;
      cursor: pointer;

      &.is-active {
        border-bottom-color: #2563eb;
        color: #2563eb;
        font-weight: 600;
      }

      .el-icon {
        color: #16a34a;
      }
    }
  }

  &__list {
    max-height: 240px;
    padding-top: 6px;
    overflow: auto;

    button {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      height: 36px;
      padding: 0 10px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--v-text-primary);
      font: inherit;
      font-size: 13px;
      text-align: left;
      cursor: pointer;

      &:hover,
      &.is-selected {
        background: #eff6ff;
        color: #2563eb;
      }
    }
  }

  &__check {
    color: #16a34a;
  }

  &__empty {
    padding: 24px 0;
    color: var(--v-text-tertiary);
    font-size: 12px;
    text-align: center;
  }
}

@media (max-width: 1050px) {
  .vault-groups {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 820px) {
  .vault-page {
    &__detail-toolbar {
      align-items: stretch;
      flex-direction: column;
      gap: 10px;
      padding-top: 12px;
      padding-bottom: 12px;
    }

    &__toolbar-actions {
      width: 100%;
    }

    &__search {
      flex: 1;
      width: auto;
    }

    &__content {
      padding: 14px;
    }
  }

  .vault-folders {
    width: 100%;
    min-width: 0;
    flex-direction: column;
  }

  .vault-folder {
    width: 100%;
    min-width: 0;
    min-height: 170px;
    flex-basis: auto;
  }
}

@media (max-width: 600px) {
  .vault-page {
    &__cascade {
      width: 100%;
      max-width: none;

      strong {
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }

    &__detail-head {
      padding: 0 12px;

      > button:not(.vault-page__back):first-of-type {
        display: none;
      }
    }
  }

  .vault-folder footer {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }

  .vault-table__operations button {
    width: 26px;
    height: 26px;
    align-items: center;
    justify-content: center;

    .el-icon {
      display: inline-flex;
    }

    span {
      display: none;
    }
  }
}
</style>
