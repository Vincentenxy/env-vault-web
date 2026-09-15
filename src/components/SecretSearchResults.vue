<script setup lang="ts">
import { computed } from 'vue'
import { History, KeyRound } from '@lucide/vue'
import type { SecretSearchGroup } from '@/types/secret-search'
import { buildSecretSearchRows, secretSearchSpan } from '@/utils/secret-search'
import { formatDateTime } from '@/utils/format'
import SecretValuePreview from './SecretValuePreview.vue'

const props = defineProps<{ groups: SecretSearchGroup[] }>()
const emit = defineEmits<{ history: [secret: SecretSearchGroup] }>()
const rows = computed(() => buildSecretSearchRows(props.groups))
function scopePath(secret: SecretSearchGroup): string {
  return [
    secret.scope.tenant.name,
    secret.scope.organization.name,
    secret.scope.project.name,
    ...secret.scope.folders.map((folder) => folder.name),
  ].join('/')
}
</script>
<template>
  <el-table
    class="secret-search-results"
    :data="rows"
    height="100%"
    row-key="id"
    border
    :span-method="secretSearchSpan"
    :row-class-name="
      ({ row }) => (row.scopeSpan ? 'is-scope-start' : row.secretSpan ? 'is-secret-start' : '')
    "
  >
    <el-table-column label="范围" width="480" show-overflow-tooltip>
      <template #default="{ row }">
        <span class="secret-search-results__scope"
          >{{ scopePath(row.secret)
          }}<span v-if="row.secret.scope.folders.at(-1)?.code"
            >(<code>{{ row.secret.scope.folders.at(-1).code }}</code
            >)</span
          ></span
        >
      </template>
    </el-table-column>
    <el-table-column label="秘钥 Key" width="260">
      <template #default="{ row }"
        ><div class="secret-search-results__key">
          <KeyRound :size="14" /><code>{{ row.secret.key }}</code>
        </div>
        <p class="secret-search-results__remark">{{ row.secret.remark }}</p></template
      >
    </el-table-column>
    <el-table-column label="标签" width="110">
      <template #default="{ row }"
        ><div class="secret-search-results__tags">
          <el-tag v-for="tag in row.secret.tagList" :key="tag.id" size="small" effect="plain">{{
            tag.name
          }}</el-tag
          ><span v-if="!row.secret.tagList.length" class="secret-search-results__muted">—</span>
        </div></template
      >
    </el-table-column>
    <el-table-column label="环境" min-width="280">
      <template #default="{ row }"
        ><div class="secret-search-results__environment">
          <span class="secret-search-results__env" :class="`is-${row.environment.envCode}`"
            ><b>{{ row.environment.envCode.toUpperCase() }}</b
            ><small>{{ row.environment.envName }}</small></span
          ><SecretValuePreview
            :key="row.id"
            :value="row.environment.value"
            :masked="row.environment.masked"
          /></div
      ></template>
    </el-table-column>
    <el-table-column label="更新时间" width="175">
      <template #default="{ row }"
        ><time>{{ formatDateTime(row.environment.updateAt) }}</time></template
      >
    </el-table-column>
    <el-table-column label="修改历史" width="100" align="center">
      <template #default="{ row }"
        ><button
          type="button"
          class="secret-search-results__history"
          :aria-label="`查看${row.secret.scope.project.name} ${row.secret.key}的修改历史`"
          @click="emit('history', row.secret)"
        >
          <History :size="16" :stroke-width="1.8" /></button
      ></template>
    </el-table-column>
    <template #empty><slot name="empty" /></template>
  </el-table>
</template>
<style scoped lang="scss">
.secret-search-results {
  :deep(td.el-table__cell) {
    padding: 6px 8px;
    height: 52px;
    border-bottom: 1px solid var(--v-divider);
    border-right: 1px solid var(--v-divider);
  }
  :deep(th.el-table__cell) {
    padding: 0 8px;
    border-right: 1px solid var(--v-divider);
  }
  :deep(th .cell) {
    padding: 0 6px;
    white-space: nowrap;
  }
  :deep(td[rowspan]:not([rowspan='1'])) {
    vertical-align: top;
    padding-top: 18px;
  }
  :deep(.is-scope-start:not(:first-child) td) {
    border-top: 2px solid var(--v-surface-border);
  }
  :deep(td .cell) {
    padding: 0 6px;
  }
  time {
    color: var(--v-text-secondary);
    font-size: 12px;
    white-space: nowrap;
  }
  &__scope {
    font-size: 12px;
    color: var(--v-text-secondary);
    line-height: 1.6;
    white-space: nowrap;
    code {
      color: var(--v-brand-primary);
      font-size: inherit;
    }
  }
  &__key {
    display: flex;
    gap: 8px;
    align-items: baseline;
    svg {
      color: var(--v-text-tertiary);
      flex-shrink: 0;
    }
    code {
      font-size: 12px;
      font-weight: 600;
      overflow-wrap: anywhere;
    }
  }
  &__remark {
    color: var(--v-text-tertiary);
    font-size: 12px;
    margin: 7px 0 0 22px;
    line-height: 1.6;
  }
  &__tags {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    :deep(.el-tag) {
      max-width: 100%;
      height: auto;
      min-height: 22px;
      white-space: normal;
    }
  }
  &__muted {
    color: var(--v-text-tertiary);
  }
  &__environment {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }
  &__env {
    flex: 0 0 40px;
    text-align: center;
    display: flex;
    flex-direction: column;
    line-height: 17px;
    b {
      font-size: 10px;
      color: var(--v-brand-primary);
    }
    small {
      font-size: 11px;
      color: var(--v-text-tertiary);
    }
    &.is-dev b {
      color: #0891b2;
    }
    &.is-test b {
      color: #d97706;
    }
    &.is-sim b {
      color: #7c3aed;
    }
    &.is-prod b {
      color: #ef4444;
    }
  }
  &__history {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 30px;
    width: 30px;
    border-radius: 50%;
    border: 1px solid var(--v-surface-border);
    background: var(--v-surface-bg);
    color: #d97706;
    cursor: pointer;
    &:hover {
      border-color: #d97706;
    }
  }
}
</style>
