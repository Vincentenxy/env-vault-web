<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Edit, Delete, Plus, Search } from '@element-plus/icons-vue'
import { updateTag, deleteTag, listTags, type Tag, type TagForm } from '@/api/tag'
import { ApiError } from '@/types/api'
import TenantTagCreatePanel from './TenantTagCreatePanel.vue'

const props = defineProps<{ tenantId: string; active: boolean }>()
const emit = defineEmits<{ busy: [value: boolean] }>()
const items = ref<Tag[]>([])
const loading = ref(false)
const failed = ref(false)
const total = ref(0)
const page = ref(1)
const pageSize = 10
const keyword = ref('')
const dialogVisible = ref(false)
const editingId = ref('')
const submitting = ref(false)
const deletingId = ref('')
const confirming = ref(false)
const creating = ref(false)
const createBusy = ref(false)
const createPanel = ref<InstanceType<typeof TenantTagCreatePanel>>()
const busy = computed(
  () => submitting.value || createBusy.value || !!deletingId.value || confirming.value,
)
const formRef = ref<FormInstance>()
const form = reactive<TagForm>({ code: '', name: '', remark: '', allowValueSearch: true })
const rules: FormRules<TagForm> = {
  code: [
    { required: true, message: '请输入 Code', trigger: 'blur' },
    {
      pattern: /^[a-z][a-z0-9_-]{0,63}$/,
      message: '小写字母开头，支持数字、中横线和下划线，最多 64 字符',
      trigger: 'blur',
    },
  ],
  name: [
    { required: true, whitespace: true, message: '请输入名称', trigger: 'blur' },
    { max: 64, message: '名称不能超过 64 个字符', trigger: 'blur' },
  ],
  remark: [{ max: 1024, message: '备注不能超过 1024 个字符', trigger: 'blur' }],
}
let sequence = 0
let timer: ReturnType<typeof setTimeout> | undefined

watch(busy, (value) => emit('busy', value), { flush: 'sync' })

async function load(): Promise<void> {
  if (!props.active || !props.tenantId) return
  const request = ++sequence
  loading.value = true
  failed.value = false
  try {
    const result = await listTags({
      tenantId: props.tenantId,
      keyword: keyword.value.trim(),
      pageNum: page.value,
      pageSize,
    })
    if (request !== sequence) return
    items.value = result.list
    total.value = result.total
    if (!items.value.length && page.value > 1 && result.total <= (page.value - 1) * pageSize) {
      page.value = Math.max(1, Math.ceil(result.total / pageSize))
      await load()
    }
  } catch {
    if (request !== sequence) return
    failed.value = true
    items.value = []
    total.value = 0
  } finally {
    if (request === sequence) loading.value = false
  }
}

function search(): void {
  clearTimeout(timer)
  sequence += 1
  page.value = 1
  loading.value = true
  timer = setTimeout(() => void load(), 300)
}

function openCreate(): void {
  if (busy.value) return
  creating.value = true
  createPanel.value?.open()
}

function onCreated(): void {
  page.value = 1
  void load()
}

function openEditor(tag?: Tag): void {
  if (!tag || busy.value) return
  editingId.value = tag.id
  Object.assign(form, {
    code: tag?.code ?? '',
    name: tag?.name ?? '',
    remark: tag?.remark ?? '',
    allowValueSearch: tag?.allowValueSearch ?? true,
  })
  formRef.value?.clearValidate()
  dialogVisible.value = true
}

async function save(): Promise<void> {
  if (submitting.value) return
  submitting.value = true
  try {
    if (!(await formRef.value?.validate().catch(() => false))) return
    const values = {
      tenantId: props.tenantId,
      name: form.name.trim(),
      remark: form.remark.trim(),
      allowValueSearch: form.allowValueSearch,
    }
    await updateTag({ ...values, id: editingId.value })
    ElMessage.success('Tag 已更新')
    dialogVisible.value = false
    await load()
  } catch (error) {
    if (!(error instanceof ApiError)) ElMessage.error('保存 Tag 失败')
  } finally {
    submitting.value = false
  }
}

async function remove(tag?: Tag): Promise<void> {
  if (!tag || busy.value) return
  confirming.value = true
  try {
    await ElMessageBox.confirm(
      `确认删除“${tag.name}”么？所有密钥上的该标签也会被移除，密钥内容不受影响`,
      '删除 Tag',
      {
        customClass: 'vault-confirm-message-box',
        confirmButtonClass: 'vault-delete-confirm-button',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  } finally {
    confirming.value = false
  }
  deletingId.value = tag.id
  try {
    await deleteTag({ tenantId: props.tenantId, id: tag.id })
    ElMessage.success('Tag 已删除')
    await load()
  } catch (error) {
    if (!(error instanceof ApiError)) ElMessage.error('删除 Tag 失败')
  } finally {
    deletingId.value = ''
  }
}

watch(
  () => [props.active, props.tenantId] as const,
  ([active, tenantId], previous) => {
    clearTimeout(timer)
    sequence += 1
    loading.value = false
    if (tenantId !== previous?.[1]) {
      items.value = []
      total.value = 0
      keyword.value = ''
      page.value = 1
      dialogVisible.value = false
    }
    if (active) void load()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  clearTimeout(timer)
  sequence += 1
})
</script>

<template>
  <section class="tenant-tags" :class="{ 'tenant-tags--list': !creating }">
    <TenantTagCreatePanel
      ref="createPanel"
      v-show="creating"
      :tenant-id="tenantId"
      @back="creating = false"
      @restored="creating = $event"
      @created="onCreated"
      @busy="createBusy = $event"
    />
    <template v-if="!creating">
      <div class="resource-members__toolbar">
        <div class="resource-members__heading">
          <strong>Tag</strong><span>{{ total }} 个</span>
        </div>
        <div class="resource-members__actions">
          <el-input
            v-model="keyword"
            class="resource-members__search"
            placeholder="搜索名称或 Code"
            :prefix-icon="Search"
            clearable
            :disabled="busy"
            @input="search"
          />
          <button
            class="resource-members__add"
            type="button"
            aria-label="新建 Tag"
            :disabled="busy"
            @click="openCreate"
          >
            <el-icon><Plus /></el-icon>
          </button>
        </div>
      </div>
      <div v-loading="loading" class="resource-members__table-wrap tenant-tags__table-wrap">
        <el-table
          v-if="items.length && !failed"
          :data="items"
          height="100%"
          class="tenant-tags__table"
        >
          <el-table-column prop="code" label="Code" min-width="135" show-overflow-tooltip />
          <el-table-column prop="name" label="名称" min-width="120" show-overflow-tooltip />
          <el-table-column prop="remark" label="备注" min-width="150" show-overflow-tooltip />
          <el-table-column label="允许值检索" width="130"
            ><template #default="{ row }"
              ><el-tag :type="row.allowValueSearch ? 'success' : 'info'" size="small">{{
                row.allowValueSearch ? '允许' : '禁止'
              }}</el-tag></template
            ></el-table-column
          >
          <el-table-column label="操作" width="110" fixed="right"
            ><template #default="{ row, $index }">
              <div class="tenant-tags__actions">
                <el-button
                  circle
                  size="small"
                  :icon="Edit"
                  aria-label="编辑 Tag"
                  :disabled="busy"
                  @click="openEditor(items[$index])"
                />
                <el-button
                  circle
                  size="small"
                  type="danger"
                  plain
                  :icon="Delete"
                  aria-label="删除 Tag"
                  :disabled="busy"
                  :loading="deletingId === row.id"
                  @click="remove(items[$index])"
                />
              </div> </template
          ></el-table-column>
        </el-table>
        <div v-else-if="!loading" class="resource-members__empty">
          <span>{{
            failed ? 'Tag 加载失败' : keyword.trim() ? '没有匹配的 Tag' : '暂无 Tag'
          }}</span>
          <el-button v-if="failed" link type="primary" @click="load">重新加载</el-button>
        </div>
      </div>
      <el-pagination
        class="tenant-tags__pagination"
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        :disabled="loading || busy"
        @current-change="load"
      />
    </template>
    <el-dialog
      v-model="dialogVisible"
      title="编辑 Tag"
      width="600px"
      class="vault-card-edit-dialog"
      append-to-body
      align-center
      destroy-on-close
      :close-on-click-modal="false"
      :close-on-press-escape="!submitting"
      :show-close="!submitting"
    >
      <div class="vault-card-edit-dialog__body">
        <el-form
          class="vault-card-edit-dialog__form"
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="left"
          label-width="110px"
          require-asterisk-position="right"
          :disabled="submitting"
          @submit.prevent="save"
        >
          <el-form-item label="Code" prop="code"
            ><el-input
              v-model="form.code"
              :disabled="!!editingId"
              maxlength="64"
              placeholder="如 password、ip"
          /></el-form-item>
          <el-form-item label="名称" prop="name"
            ><el-input v-model="form.name" maxlength="64" placeholder="标签名称"
          /></el-form-item>
          <el-form-item label="备注" prop="remark"
            ><el-input
              v-model="form.remark"
              type="textarea"
              :rows="3"
              maxlength="1024"
              show-word-limit
          /></el-form-item>
          <el-form-item label="允许值检索" prop="allowValueSearch"
            ><el-switch v-model="form.allowValueSearch" aria-label="允许值检索"
          /></el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button :disabled="submitting" @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped lang="scss">
.tenant-tags {
  min-width: 0;
  &--list {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;

    > .resource-members__toolbar {
      flex-shrink: 0;
    }
  }
  &__table-wrap {
    flex: 1;
    height: auto;
    min-height: 0;
    overflow: hidden;
  }
  &__actions {
    display: flex;
    align-items: center;
    gap: 6px;
    .el-button + .el-button {
      margin-left: 0;
    }
  }
  &__pagination {
    flex-shrink: 0;
    margin-top: 12px;
    justify-content: flex-end;
    max-width: 100%;
    overflow-x: auto;
  }
}
</style>
