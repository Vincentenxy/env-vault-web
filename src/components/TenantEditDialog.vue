<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { UserFilled } from '@element-plus/icons-vue'

export interface TenantEditPayload {
  name: string
  remark: string
}

type TenantEditTab = 'basic' | 'members'

const props = defineProps<{
  modelValue: boolean
  name: string
  remark: string
  submitting: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [payload: TenantEditPayload]
}>()

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const activeTab = ref<TenantEditTab>('basic')
const formRef = ref<FormInstance>()
const form = reactive<TenantEditPayload>({ name: '', remark: '' })
const rules: FormRules<TenantEditPayload> = {
  name: [
    { required: true, message: '请输入租户名称', trigger: 'blur' },
    { max: 64, message: '长度不能超过 64 个字符', trigger: 'blur' },
  ],
  remark: [{ max: 256, message: '长度不能超过 256 个字符', trigger: 'blur' }],
}

const hasChanges = computed(
  () => form.name.trim() !== props.name.trim() || form.remark.trim() !== props.remark.trim(),
)

function resetDialog(): void {
  activeTab.value = 'basic'
  form.name = props.name
  form.remark = props.remark
  nextTick(() => formRef.value?.clearValidate())
}

function switchTab(tab: TenantEditTab): void {
  activeTab.value = tab
}

async function submit(): Promise<void> {
  if (props.submitting || activeTab.value !== 'basic' || !hasChanges.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  emit('submit', { name: form.name.trim(), remark: form.remark.trim() })
}

watch(
  () => [props.modelValue, props.name, props.remark] as const,
  ([visible]) => {
    if (visible) resetDialog()
  },
  { flush: 'post', immediate: true },
)
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    width="860px"
    class="vault-card-edit-dialog tenant-edit-dialog"
    :close-on-click-modal="false"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
    align-center
    destroy-on-close
    @closed="resetDialog"
  >
    <template #header>
      <nav class="tenant-edit-tabs" aria-label="租户编辑菜单">
        <button
          type="button"
          class="tenant-edit-tabs__item"
          :class="{ 'is-active': activeTab === 'basic' }"
          :aria-current="activeTab === 'basic' ? 'page' : undefined"
          @click="switchTab('basic')"
        >
          基础信息
        </button>
        <button
          type="button"
          class="tenant-edit-tabs__item"
          :class="{ 'is-active': activeTab === 'members' }"
          :aria-current="activeTab === 'members' ? 'page' : undefined"
          @click="switchTab('members')"
        >
          成员管理
        </button>
      </nav>
    </template>

    <div class="tenant-edit-dialog__content">
      <el-form
        v-show="activeTab === 'basic'"
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="left"
        label-width="96px"
        require-asterisk-position="right"
        class="tenant-edit-dialog__form"
      >
        <el-form-item label="租户名称" prop="name">
          <el-input
            v-model="form.name"
            maxlength="64"
            show-word-limit
            placeholder="请输入租户名称"
            :disabled="submitting"
          />
        </el-form-item>
        <el-form-item label="备注" prop="remark">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="5"
            maxlength="256"
            show-word-limit
            placeholder="可选，填写租户相关说明"
            :disabled="submitting"
          />
        </el-form-item>
      </el-form>

      <div v-show="activeTab === 'members'" class="tenant-edit-dialog__members-placeholder">
        <span class="tenant-edit-dialog__members-icon">
          <el-icon><UserFilled /></el-icon>
        </span>
        <strong>成员管理</strong>
        <span>暂无成员配置</span>
      </div>
    </div>

    <template #footer>
      <el-button :disabled="submitting" @click="dialogVisible = false">
        {{ activeTab === 'basic' ? '取消' : '关闭' }}
      </el-button>
      <el-button
        v-if="activeTab === 'basic'"
        type="primary"
        :loading="submitting"
        :disabled="!hasChanges"
        @click="submit"
      >
        保存
      </el-button>
    </template>
  </el-dialog>
</template>
