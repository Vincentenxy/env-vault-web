<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CascaderOption, CascaderProps } from 'element-plus'
import { Search as SearchIcon } from '@element-plus/icons-vue'
import { CircleHelp, Search } from '@lucide/vue'
import PageRefreshButton from '@/components/PageRefreshButton.vue'
import SecretSearchResults from '@/components/SecretSearchResults.vue'
import SecretSearchHistoryDialog from '@/components/SecretSearchHistoryDialog.vue'
import type { SecretSearchGroup, SecretSearchPreviewData } from '@/types/secret-search'
import { secretScopePath } from '@/utils/secret-search'
import { getTenantWithOrgProject, type TenantHierarchyOption } from '@/api/tenant'
import { listEnvironments } from '@/api/env'
import { listFolders, type ListFoldersRequest } from '@/api/folder'
import {
  listSecretSearchTags,
  searchSecrets,
  type SearchSecretsRequest,
  type SecretSearchScopeRequest,
  type SecretSearchTagOption,
} from '@/api/secret-search'
import { useNavigationMemory } from '@/composables/use-navigation-memory'
import type { Environment } from '@/types/env'

const props = defineProps<{ previewData?: SecretSearchPreviewData }>()
const navigation = useNavigationMemory('secret-search', {
  scopePaths: '[]',
  envCodes: [] as string[],
})
const tenants = ref<TenantHierarchyOption[]>([])
const scopePaths = ref<string[][]>([])
const scopeLoading = ref(false)
const scopeError = ref(false)
const scopeReady = ref(false)
const envLoading = ref(false)
const envError = ref(false)
const environments = ref<Environment[]>([])
const envCodes = ref<string[]>([])
const keyword = ref('')
const tagIds = ref<string[]>([])
const tagOptions = ref<SecretSearchTagOption[]>([])
const tagLoading = ref(false)
const tagOptionsFailed = ref(false)
const tagKeyword = ref('')
const tagPage = ref(0)
const tagTotal = ref(0)
const tagFetched = ref(0)
const submitted = ref(false)
const appliedKeyword = ref('')
const resultGroups = ref<SecretSearchGroup[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(20)
const searchLoading = ref(false)
const searchError = ref('')
let searchSequence = 0
let searchAbort: AbortController | undefined
const historySecret = ref<SecretSearchGroup | null>(null)
const historyVisible = ref(false)
let envRequest = 0
let restoreEnvironments = true
let tagSequence = 0
let tagAbort: AbortController | undefined
let tagSearchTimer: ReturnType<typeof setTimeout> | undefined
const tagPageSize = 50

// 只有全部选中范围都落在同一个项目内，才允许共用一组环境条件
const project = computed(() => {
  const first = scopePaths.value[0]
  if (
    !first ||
    first.length < 3 ||
    !scopePaths.value.every(
      (path) =>
        path.length >= 3 && path[0] === first[0] && path[1] === first[1] && path[2] === first[2],
    )
  )
    return undefined
  return tenants.value
    .find((item) => item.id === first[0])
    ?.orgList.find((item) => item.id === first[1])
    ?.projectList.find((item) => item.id === first[2])
})
const options = computed<CascaderOption[]>(() =>
  tenants.value.map((item) => ({
    value: item.id,
    label: item.name,
    leaf: !item.orgList.length,
    children: item.orgList.map((org) => ({
      value: org.id,
      label: org.name,
      leaf: !org.projectList.length,
      children: org.projectList.map((proj) => ({
        value: proj.id,
        label: proj.name,
        projectId: proj.id,
        leaf: false,
      })),
    })),
  })),
)

const description = computed(() => {
  if (project.value) return '项目层面支持筛选指定环境的秘钥'
  if (scopePaths.value.length) return '查询所选范围下全部环境内的秘钥'
  return '查询所有可访问范围下的全部环境内的秘钥'
})
const searchDisabled = computed(
  () =>
    scopeLoading.value ||
    scopeError.value ||
    envLoading.value ||
    (Boolean(project.value) && (envError.value || !envCodes.value.length)),
)
const tagHasMore = computed(() => tagFetched.value < tagTotal.value)

// 独立预览使用虚构数据，正常路由只使用后端当前页的搜索结果
const previewResults = computed(() =>
  (props.previewData?.groups ?? [])
    .filter((secret) => {
      const path = secretScopePath(secret.scope)
      return (
        (!scopePaths.value.length ||
          scopePaths.value.some((scope) => scope.every((id, index) => path[index] === id))) &&
        (!appliedKeyword.value ||
          `${secret.key} ${secret.remark}`.toLowerCase().includes(appliedKeyword.value)) &&
        (!tagIds.value.length || secret.tagList.some((tag) => tagIds.value.includes(tag.id)))
      )
    })
    .map((secret) => ({
      ...secret,
      values: project.value
        ? secret.values.filter((env) => envCodes.value.includes(env.envCode))
        : secret.values,
    }))
    .filter((secret) => secret.values.length),
)
const results = computed(() =>
  props.previewData
    ? previewResults.value.slice(
        (pageNum.value - 1) * pageSize.value,
        pageNum.value * pageSize.value,
      )
    : resultGroups.value,
)
const resultTotal = computed(() => (props.previewData ? previewResults.value.length : total.value))
const resultSummary = computed(() => ({
  scopes: new Set(results.value.map((secret) => JSON.stringify(secretScopePath(secret.scope))))
    .size,
  values: results.value.reduce((count, secret) => count + secret.values.length, 0),
}))

function openHistory(secret: SecretSearchGroup): void {
  historySecret.value = secret
  historyVisible.value = true
}

// 文件夹按需展开，使用跨环境共享的 groupId 作为范围标识
// 分页取全当前层，避免第 201 个目录在范围选择中消失
const cascaderProps: CascaderProps = {
  multiple: true,
  checkStrictly: true,
  emitPath: true,
  lazy: true,
  async lazyLoad(node, resolve, reject) {
    const projectId = node.data.projectId as string | undefined
    const parentFolderId = node.data.folderId as string | undefined
    if (!projectId) {
      resolve([])
      return
    }
    const folders: CascaderOption[] = []
    try {
      let fetched = 0
      for (let pageNum = 1; ; pageNum += 1) {
        const range: ListFoldersRequest = parentFolderId ? { parentFolderId } : { projectId }
        const response = await listFolders({ ...range, pageNum, pageSize: 200 })
        for (const folder of response.list) {
          folders.push({
            value: folder.groupId || folder.id,
            label: `${folder.name} (${folder.code})`,
            projectId,
            folderId: folder.id,
            leaf: Boolean(parentFolderId) || (folder.code !== 'groups' && folder.type !== 'groups'),
          })
        }
        fetched += response.list.length
        if (!response.list.length || fetched >= response.total) break
      }
      resolve(folders)
    } catch {
      // 保持未加载状态，允许重新展开重试
      reject()
    }
  },
}

function selectedScopes(): SecretSearchScopeRequest[] {
  return scopePaths.value.map((path) => ({
    scopeType:
      path.length === 1
        ? 'tenant'
        : path.length === 2
          ? 'org'
          : path.length === 3
            ? 'project'
            : 'folder',
    scopeId: path.at(-1)!,
  }))
}

function resetTagOptions(clearSelection: boolean): void {
  clearTimeout(tagSearchTimer)
  tagAbort?.abort()
  tagSequence += 1
  tagLoading.value = false
  tagOptionsFailed.value = false
  tagKeyword.value = ''
  tagOptions.value = []
  tagPage.value = 0
  tagTotal.value = 0
  tagFetched.value = 0
  if (clearSelection) tagIds.value = []
}

function previewTagOptions(query: string): SecretSearchTagOption[] {
  const normalized = query.trim().toLowerCase()
  const selected = scopePaths.value
  const options = new Map<string, SecretSearchTagOption>()
  for (const secret of props.previewData?.groups ?? []) {
    const path = secretScopePath(secret.scope)
    if (
      selected.length &&
      !selected.some((scope) => scope.every((id, index) => path[index] === id))
    )
      continue
    for (const tag of secret.tagList) {
      const option = {
        id: tag.id,
        tenantId: secret.scope.tenant.id,
        tenantName: secret.scope.tenant.name,
        code: tag.code,
        name: tag.name,
        remark: '',
      }
      if (
        !normalized ||
        `${option.name} ${option.code} ${option.remark}`.toLowerCase().includes(normalized)
      )
        options.set(option.id, option)
    }
  }
  return [...options.values()].sort((a, b) =>
    `${a.tenantName}\u0000${a.name}\u0000${a.code}`.localeCompare(
      `${b.tenantName}\u0000${b.name}\u0000${b.code}`,
    ),
  )
}

// 标签下拉按范围远程分页，选中项在重新搜索候选时继续保留展示文本
async function loadTagOptions(reset = true): Promise<void> {
  if (
    scopeLoading.value ||
    scopeError.value ||
    !scopeReady.value ||
    envLoading.value ||
    (project.value && (envError.value || !envCodes.value.length))
  )
    return
  if (props.previewData) {
    const list = previewTagOptions(tagKeyword.value)
    tagOptions.value = list
    tagTotal.value = list.length
    tagFetched.value = list.length
    tagPage.value = 1
    return
  }
  tagAbort?.abort()
  const controller = new AbortController()
  tagAbort = controller
  const sequence = ++tagSequence
  const targetPage = reset ? 1 : tagPage.value + 1
  tagLoading.value = true
  tagOptionsFailed.value = false
  try {
    const response = await listSecretSearchTags(
      {
        scopes: selectedScopes(),
        envList: project.value ? [...envCodes.value] : [],
        keyword: tagKeyword.value,
        pageNum: targetPage,
        pageSize: tagPageSize,
      },
      controller.signal,
    )
    if (sequence !== tagSequence) return
    const selected = tagOptions.value.filter((tag) => tagIds.value.includes(tag.id))
    const existing = reset ? selected : tagOptions.value
    tagOptions.value = [
      ...new Map([...existing, ...response.list].map((tag) => [tag.id, tag])).values(),
    ]
    tagPage.value = targetPage
    tagTotal.value = response.total
    tagFetched.value = reset
      ? response.list.length
      : Math.min(response.total, tagFetched.value + response.list.length)
  } catch {
    if (sequence !== tagSequence || controller.signal.aborted) return
    tagOptionsFailed.value = true
  } finally {
    if (sequence === tagSequence) tagLoading.value = false
  }
}

function searchTagOptions(query: string): void {
  clearTimeout(tagSearchTimer)
  tagKeyword.value = query.trim()
  tagSearchTimer = setTimeout(() => void loadTagOptions(true), 250)
}

function handleTagDropdown(visible: boolean): void {
  if (visible && !tagOptions.value.length && !tagLoading.value) void loadTagOptions(true)
}

function tagOptionLabel(tag: SecretSearchTagOption): string {
  return `${tag.tenantName} / ${tag.name} (${tag.code})`
}

async function loadScope(): Promise<void> {
  if (scopeLoading.value) return
  scopeLoading.value = true
  scopeError.value = false
  try {
    const response = await getTenantWithOrgProject()
    tenants.value = response.tenantList ?? []
    // 逐条校验记忆中的租户、组织、项目，移除已经失效的选中项
    let saved = scopePaths.value
    if (!scopeReady.value) {
      try {
        saved = normalizeScopePaths(JSON.parse(navigation.saved.scopePaths))
      } catch {
        saved = []
      }
    }
    scopePaths.value = saved.filter((path) => {
      const selectedTenant = tenants.value.find((item) => item.id === path[0])
      if (!selectedTenant) return false
      if (path.length === 1) return true
      const selectedOrg = selectedTenant.orgList.find((item) => item.id === path[1])
      if (!selectedOrg) return false
      return path.length === 2 || selectedOrg.projectList.some((item) => item.id === path[2])
    })
    scopeReady.value = true
  } catch {
    scopeError.value = true
  } finally {
    scopeLoading.value = false
  }
}

async function loadEnvironments(projectId: string, preferred: string[] = []): Promise<void> {
  const request = ++envRequest
  envCodes.value = []
  environments.value = []
  envError.value = false
  envLoading.value = true
  try {
    const list = await listEnvironments({ projectId })
    // 快速切换项目时，旧请求不能覆盖新项目的环境或默认选项
    if (request !== envRequest) return
    environments.value = [...list].sort((a, b) => a.orderNo - b.orderNo)
    const available = preferred.filter((code) => list.some((env) => env.code === code))
    envCodes.value = available.length
      ? available
      : environments.value.slice(0, 1).map((env) => env.code)
  } catch {
    if (request === envRequest) envError.value = true
  } finally {
    if (request === envRequest) envLoading.value = false
  }
}

watch(
  () => project.value?.id,
  (projectId) => {
    envRequest += 1
    envCodes.value = []
    environments.value = []
    envError.value = false
    envLoading.value = false
    if (projectId) {
      const preferred = restoreEnvironments ? navigation.saved.envCodes : []
      void loadEnvironments(projectId, preferred)
    }
    restoreEnvironments = false
  },
)
watch(
  scopePaths,
  (current, previous) => {
    if (JSON.stringify(current) !== JSON.stringify(previous)) resetTagOptions(true)
  },
  { deep: true },
)
watch(
  envCodes,
  (current, previous) => {
    if (JSON.stringify(current) !== JSON.stringify(previous)) resetTagOptions(false)
  },
  { deep: true },
)
watch(
  [scopePaths, envCodes, keyword, tagIds],
  () => {
    searchAbort?.abort()
    searchSequence += 1
    searchLoading.value = false
    searchError.value = ''
    resultGroups.value = []
    total.value = 0
    pageNum.value = 1
    submitted.value = false
    historyVisible.value = false
  },
  { deep: true },
)

// 只记忆范围和环境，不保存检索文本或密钥内容
navigation.track(() =>
  scopeReady.value && !envLoading.value && !envError.value
    ? { scopePaths: JSON.stringify(scopePaths.value), envCodes: envCodes.value }
    : null,
)
onMounted(loadScope)
onBeforeUnmount(() => {
  envRequest += 1
  searchAbort?.abort()
  clearTimeout(tagSearchTimer)
  tagAbort?.abort()
  searchSequence += 1
  tagSequence += 1
})

async function search(): Promise<void> {
  if (searchDisabled.value) return
  appliedKeyword.value = keyword.value.trim().toLowerCase()
  pageNum.value = 1
  submitted.value = true
  await loadResults()
}

// 每次翻页重新查询本页，筛选条件变化或新请求开始时取消旧请求
async function loadResults(targetPage = pageNum.value): Promise<void> {
  if (searchDisabled.value) return
  pageNum.value = targetPage
  if (props.previewData) return
  searchAbort?.abort()
  const controller = new AbortController()
  searchAbort = controller
  const sequence = ++searchSequence
  searchLoading.value = true
  searchError.value = ''
  const request: SearchSecretsRequest = {
    scopes: selectedScopes(),
    envList: project.value ? [...envCodes.value] : [],
    tagIdList: [...tagIds.value],
    keyword: keyword.value.trim(),
    pageNum: targetPage,
    pageSize: pageSize.value,
  }
  try {
    const response = await searchSecrets(request, controller.signal)
    if (sequence !== searchSequence) return
    resultGroups.value = response.list.map((secret) => ({
      ...secret,
      // 搜索结果默认展示明文，是否有权获取值由后端决定
      values: secret.values.map((env) => ({ ...env, masked: false })),
    }))
    total.value = response.total
  } catch (error) {
    if (sequence !== searchSequence || controller.signal.aborted) return
    resultGroups.value = []
    total.value = 0
    searchError.value = error instanceof Error ? error.message : '搜索失败，请重试'
  } finally {
    if (sequence === searchSequence) searchLoading.value = false
  }
}

function changePageSize(size: number): void {
  pageSize.value = size
  void loadResults(1)
}

function updateScope(value: unknown): void {
  scopePaths.value = normalizeScopePaths(value)
}

function normalizeScopePaths(value: unknown): string[][] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (path): path is string[] =>
      Array.isArray(path) &&
      path.length > 0 &&
      path.length <= 5 &&
      path.every((id) => typeof id === 'string' && id.length > 0),
  )
}

async function refresh(): Promise<void> {
  const reloadResults = submitted.value
  const reloadTags = tagOptions.value.length > 0 || tagIds.value.length > 0
  await loadScope()
  if (project.value && !envLoading.value && !scopeError.value) {
    await loadEnvironments(project.value.id, envCodes.value)
  }
  if (reloadTags) await loadTagOptions(true)
  if (reloadResults && !searchDisabled.value) await search()
}
</script>

<template>
  <section class="secret-search" aria-label="秘钥检索">
    <header class="secret-search__toolbar">
      <div class="secret-search__filters">
        <div v-loading="scopeLoading" class="secret-search__scope">
          <el-cascader
            :model-value="scopePaths"
            popper-class="secret-search-scope-popper"
            :options="options"
            :props="cascaderProps"
            :disabled="scopeLoading || scopeError"
            placeholder="全部范围 · 租户 / 组织 / 项目 / 文件夹"
            aria-label="检索范围"
            clearable
            collapse-tags
            collapse-tags-tooltip
            :max-collapse-tags="1"
            separator=" / "
            @update:model-value="updateScope"
          />
        </div>
        <el-select
          v-model="tagIds"
          class="secret-search__tags"
          multiple
          filterable
          remote
          clearable
          collapse-tags
          collapse-tags-tooltip
          :max-collapse-tags="1"
          :remote-method="searchTagOptions"
          :loading="tagLoading"
          :disabled="scopeLoading || scopeError || envLoading"
          popper-class="secret-search-tag-popper"
          placeholder="全部标签"
          aria-label="标签筛选"
          @visible-change="handleTagDropdown"
        >
          <el-option
            v-for="tag in tagOptions"
            :key="tag.id"
            :value="tag.id"
            :label="tagOptionLabel(tag)"
          >
            <span class="secret-search-tag-option">
              <span class="secret-search-tag-option__title">
                <span class="secret-search-tag-option__tenant">{{ tag.tenantName }}</span>
                <span>/</span>
                <strong>{{ tag.name }}</strong>
                <code>({{ tag.code }})</code>
              </span>
              <span class="secret-search-tag-option__description">
                {{ tag.remark || '暂无描述' }}
              </span>
            </span>
          </el-option>
          <template #footer>
            <div class="secret-search-tag-footer">
              <el-button
                v-if="tagOptionsFailed"
                link
                type="primary"
                :disabled="tagLoading"
                @click.stop="loadTagOptions(true)"
              >
                加载失败，重试
              </el-button>
              <el-button
                v-else-if="tagHasMore"
                link
                type="primary"
                :loading="tagLoading"
                @click.stop="loadTagOptions(false)"
              >
                加载更多
              </el-button>
              <span v-else>{{ tagTotal }} 个标签</span>
            </div>
          </template>
        </el-select>
        <div v-if="project" v-loading="envLoading" class="secret-search__environments">
          <span class="secret-search__label">环境</span>
          <el-checkbox-group v-model="envCodes" aria-label="检索环境">
            <el-checkbox v-for="env in environments" :key="env.id" :value="env.code">
              {{ env.name }} <span class="secret-search__env-code">{{ env.code }}</span>
            </el-checkbox>
          </el-checkbox-group>
          <span v-if="envLoading" class="secret-search__hint">加载中</span>
          <el-button v-else-if="envError" type="danger" link @click="loadEnvironments(project.id)"
            >环境加载失败，重试</el-button
          >
          <span v-else-if="!environments.length" class="secret-search__hint">暂无环境</span>
          <span v-else-if="!envCodes.length" class="secret-search__error">请至少选择一个环境</span>
        </div>
        <span class="secret-search__description">{{ description }}</span>
      </div>
      <form class="secret-search__actions" @submit.prevent="search">
        <el-input
          v-model="keyword"
          class="secret-search__input"
          placeholder="搜索 Key 或备注"
          aria-label="检索关键词"
          clearable
        >
          <template #prefix>
            <button
              class="secret-search__search-button"
              type="submit"
              :disabled="searchDisabled || searchLoading"
              aria-label="搜索"
            >
              <SearchIcon />
            </button>
          </template>
          <template #suffix>
            <el-popover
              placement="bottom-end"
              :width="340"
              trigger="click"
              popper-class="secret-search-help-popper"
            >
              <template #reference>
                <button type="button" class="secret-search__help-button" aria-label="搜索说明">
                  <CircleHelp :size="16" :stroke-width="1.8" />
                </button>
              </template>
              <div class="secret-search-help">
                <strong>搜索说明</strong>
                <ul>
                  <li>同时匹配秘钥 Key 和备注，按完整输入进行包含搜索</li>
                  <li>可单独按标签搜索；选择多个标签时匹配任意一个</li>
                  <li>标签与范围、环境、Key 或备注条件之间取交集</li>
                  <li>搜索全部范围、租户或组织时，关键词需包含至少 3 个连续的中文、字母或数字</li>
                  <li>选择项目或文件夹后，可搜索 1 至 2 个字符的短关键词</li>
                </ul>
              </div>
            </el-popover>
          </template>
        </el-input>
        <PageRefreshButton
          aria-label="刷新范围"
          :loading="scopeLoading || envLoading || tagLoading || searchLoading"
          :action="refresh"
        />
      </form>
    </header>
    <el-alert
      v-if="scopeError"
      title="范围加载失败，请点击右侧刷新重试"
      type="error"
      :closable="false"
      show-icon
    />
    <div class="secret-search__result-heading">
      <strong>检索结果</strong>
      <el-tag v-if="previewData" type="info" size="small" effect="plain">模拟数据</el-tag>
      <span v-if="previewData || (submitted && !searchError)" class="secret-search__result-count"
        >本页 {{ resultSummary.scopes }} 个范围 · {{ results.length }} 个秘钥 ·
        {{ resultSummary.values }} 项环境值</span
      >
    </div>
    <el-alert v-if="searchError" :title="searchError" type="error" :closable="false" show-icon>
      <el-button type="danger" link @click="loadResults()">重试</el-button>
    </el-alert>
    <div v-loading="searchLoading" class="secret-search__results" :aria-busy="searchLoading">
      <SecretSearchResults :groups="results" @history="openHistory">
        <template #empty>
          <div class="secret-search__empty" role="status">
            <Search :size="32" :stroke-width="1.4" />
            <strong>{{
              previewData
                ? '没有符合条件的示例秘钥'
                : searchError
                  ? '搜索失败'
                  : submitted
                    ? '未找到匹配的秘钥'
                    : '暂无检索结果'
            }}</strong>
          </div>
        </template>
      </SecretSearchResults>
    </div>
    <div v-if="previewData || submitted" class="secret-search__pagination">
      <el-pagination
        :current-page="pageNum"
        :page-size="pageSize"
        :total="resultTotal"
        :page-sizes="[20, 50, 100]"
        :disabled="searchLoading || searchDisabled"
        layout="total, sizes, prev, pager, next"
        @current-change="loadResults"
        @size-change="changePageSize"
      />
    </div>
    <SecretSearchHistoryDialog
      v-if="historySecret"
      v-model="historyVisible"
      :secret="historySecret"
      :history="previewData?.histories[historySecret.groupId]"
      :batches="previewData?.batches"
    />
  </section>
</template>

<style lang="scss" scoped>
.secret-search,
:global(.secret-search-scope-popper),
:global(.secret-search-tag-popper) {
  --el-color-primary: var(--v-brand-primary);
  --el-color-primary-light-3: color-mix(in srgb, var(--v-brand-primary), white 30%);
  --el-color-primary-light-5: color-mix(in srgb, var(--v-brand-primary), white 50%);
  --el-color-primary-light-7: color-mix(in srgb, var(--v-brand-primary), white 70%);
  --el-color-primary-light-8: color-mix(in srgb, var(--v-brand-primary), white 80%);
  --el-color-primary-light-9: color-mix(in srgb, var(--v-brand-primary), white 90%);
  --el-color-primary-dark-2: color-mix(in srgb, var(--v-brand-primary), black 20%);
}

.secret-search {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  min-height: 0;
  color: var(--v-text-primary);
  background: var(--v-surface-bg);

  &__toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 20px;
    padding: 14px 24px;
    border-bottom: 1px solid var(--v-divider);
  }

  &__filters,
  &__environments,
  &__actions,
  &__result-heading {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  &__filters {
    flex: 1 1 650px;
    flex-wrap: wrap;
  }

  &__scope {
    width: 340px;
    max-width: 100%;
    :deep(.el-cascader) {
      width: 100%;
    }
  }
  &__tags {
    width: 240px;
    max-width: 100%;
    flex: 0 1 240px;
  }
  &__environments {
    flex-wrap: wrap;
    min-height: 32px;
  }
  &__label,
  &__hint,
  &__description {
    font-size: 12px;
    color: var(--v-text-secondary);
  }
  &__description {
    line-height: 18px;
  }
  &__env-code {
    color: var(--v-text-tertiary);
    font-size: 11px;
  }
  &__error {
    font-size: 12px;
    color: var(--el-color-danger);
  }
  :deep(.el-checkbox-group) {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
  }
  :deep(.el-checkbox) {
    margin-right: 0;
  }
  :deep(.el-checkbox__label) {
    font-size: 12px;
  }

  &__actions {
    flex: 0 0 auto;
    margin-left: auto;
    gap: 10px;
  }

  &__input {
    width: 240px;
    min-width: 0;

    :deep(.el-input__wrapper) {
      min-height: 34px;
      border-radius: 999px !important;
      background: var(--v-surface-bg-subtle);
      box-shadow: none;
    }
  }

  &__search-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 24px;
    padding: 0;
    border: 0;
    color: var(--el-input-icon-color, var(--el-text-color-placeholder));
    background: transparent;
    cursor: pointer;
    pointer-events: auto;
    svg {
      width: 14px;
      height: 14px;
    }
    &:hover:not(:disabled),
    &:focus-visible {
      color: var(--v-brand-primary);
    }
    &:disabled {
      opacity: 0.48;
      cursor: not-allowed;
    }
  }

  &__help-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 24px;
    flex: 0 0 18px;
    padding: 0;
    border: 0;
    border-radius: 0;
    color: var(--el-input-icon-color, var(--el-text-color-placeholder));
    background: transparent;
    cursor: pointer;

    &:hover,
    &:focus-visible {
      color: var(--v-brand-primary);
    }
  }

  &__result-heading {
    padding: 16px 24px;
    font-size: 13px;
    flex-wrap: wrap;
  }
  &__result-count {
    color: var(--v-text-tertiary);
    font-size: 12px;
  }
  &__results {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  &__pagination {
    display: flex;
    justify-content: flex-start;
    padding: 12px 20px;
    border-top: 1px solid var(--v-divider);
    overflow-x: auto;
    flex: 0 0 auto;
    :deep(.el-pagination) {
      flex: 0 0 auto;
      margin-left: auto;
    }
  }
  &__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 64px 20px;
    line-height: 20px;
    color: var(--v-text-tertiary);
    strong {
      font-size: 14px;
      font-weight: 500;
      color: var(--v-text-secondary);
    }
    span {
      font-size: 12px;
    }
  }
}

:global(.secret-search-scope-popper) {
  max-width: calc(100vw - 32px);
}
:global(.secret-search-scope-popper .el-cascader-panel) {
  overflow-x: auto;
}
:global(.secret-search-tag-popper) {
  max-width: calc(100vw - 32px);
}
:global(.secret-search-tag-popper .el-select-dropdown__item) {
  height: auto;
  min-height: 54px;
  padding-block: 7px;
  line-height: normal;
}
:global(.secret-search-tag-option) {
  display: grid;
  min-width: 0;
  gap: 5px;
}
:global(.secret-search-tag-option__title) {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 5px;
  color: var(--v-text-primary);
  font-size: 13px;
}
:global(.secret-search-tag-option__title strong) {
  overflow: hidden;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:global(.secret-search-tag-option__title code) {
  color: var(--v-brand-primary);
  font-size: 11px;
}
:global(.secret-search-tag-option__tenant),
:global(.secret-search-tag-option__description) {
  overflow: hidden;
  color: var(--v-text-tertiary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:global(.secret-search-tag-footer) {
  display: flex;
  min-height: 30px;
  align-items: center;
  justify-content: center;
  color: var(--v-text-tertiary);
  font-size: 12px;
}
:global(.secret-search-help-popper) {
  padding: 14px 16px;
}
:global(.secret-search-help) {
  color: var(--v-text-primary);
}
:global(.secret-search-help strong) {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
}
:global(.secret-search-help ul) {
  display: grid;
  gap: 6px;
  margin: 0;
  padding-left: 18px;
  color: var(--v-text-secondary);
  font-size: 12px;
  line-height: 18px;
}
@media (max-width: 900px) {
  .secret-search__toolbar {
    padding: 12px 16px;
  }
  .secret-search__filters {
    flex-basis: 100%;
  }
  .secret-search__actions {
    flex-basis: 100%;
  }
  .secret-search__input {
    flex: 1;
    width: auto;
  }
  .secret-search__scope {
    width: 100%;
  }
  .secret-search__tags {
    width: 100%;
    flex-basis: 100%;
  }
}
</style>
