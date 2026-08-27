<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import ManagerSelect from '@/components/ManagerSelect.vue'
import { isValidKeyPattern, type EditKeyPatternMode } from '@/utils/secret-key-pattern'

export interface CardEditPayload {
  name: string
  remark: string
  managerId?: string
  keyPattern?: string
}

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title: string
    name: string
    remark: string
    submitting: boolean
    managerId?: string
    managerProjectId?: string
    showKeyPattern?: boolean
    keyPattern?: string
  }>(),
  { managerId: '', managerProjectId: '', showKeyPattern: false, keyPattern: '' },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [payload: CardEditPayload]
}>()

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const formRef = ref<FormInstance>()
const form = reactive({
  name: '',
  remark: '',
  managerId: '',
  keyPatternMode: 'none' as EditKeyPatternMode,
  keyPattern: '',
})
const rules: FormRules<typeof form> = {
  name: [
    { required: true, message: '请输入名称', trigger: 'blur' },
    { max: 64, message: '长度不能超过 64 个字符', trigger: 'blur' },
  ],
  remark: [{ max: 256, message: '长度不能超过 256 个字符', trigger: 'blur' }],
  managerId: [{ required: true, message: '请选择管理员', trigger: 'change' }],
  keyPattern: [
    {
      validator: (_rule, value: string, callback) => {
        if (!props.showKeyPattern || form.keyPatternMode === 'none') {
          callback()
        } else if (!value) {
          callback(new Error('请输入自定义表达式'))
        } else if (!isValidKeyPattern(value)) {
          callback(new Error('表达式格式不正确'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
}

const hasChanges = computed(
  () =>
    form.name.trim() !== props.name.trim() ||
    form.remark.trim() !== props.remark.trim() ||
    (Boolean(props.managerProjectId) && form.managerId !== props.managerId) ||
    (props.showKeyPattern &&
      (form.keyPatternMode === 'none' ? '' : form.keyPattern) !== props.keyPattern),
)

function resetForm(): void {
  form.name = props.name
  form.remark = props.remark
  form.managerId = props.managerId
  form.keyPatternMode = props.keyPattern ? 'custom' : 'none'
  form.keyPattern = props.keyPattern
  nextTick(() => formRef.value?.clearValidate())
}

async function submit(): Promise<void> {
  if (props.submitting || !hasChanges.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  emit('submit', {
    name: form.name.trim(),
    remark: form.remark.trim(),
    ...(props.managerProjectId ? { managerId: form.managerId } : {}),
    ...(props.showKeyPattern
      ? { keyPattern: form.keyPatternMode === 'none' ? '' : form.keyPattern }
      : {}),
  })
}

watch(
  () => [props.modelValue, props.name, props.remark, props.managerId, props.keyPattern] as const,
  ([visible]) => {
    if (visible) resetForm()
  },
  { flush: 'post', immediate: true },
)
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    width="620px"
    class="vault-card-edit-dialog"
    :close-on-click-modal="false"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
    align-center
    destroy-on-close
    @closed="resetForm"
  >
    <template #header>
      <strong class="vault-card-edit-dialog__title">{{ title }}</strong>
    </template>

    <div class="vault-card-edit-dialog__body">
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="left"
        label-width="96px"
        require-asterisk-position="right"
        class="vault-card-edit-dialog__form"
      >
        <el-form-item label="名称" prop="name">
          <el-input
            v-model="form.name"
            maxlength="64"
            show-word-limit
            placeholder="请输入名称"
            :disabled="submitting"
          />
        </el-form-item>
        <el-form-item v-if="managerProjectId" label="管理员" prop="managerId">
          <ManagerSelect
            v-model="form.managerId"
            :project-id="managerProjectId"
            :disabled="submitting"
          />
        </el-form-item>
        <el-form-item label="备注" prop="remark">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="4"
            maxlength="256"
            show-word-limit
            placeholder="可选，填写相关说明"
            :disabled="submitting"
          />
        </el-form-item>
        <el-form-item v-if="showKeyPattern" label="Key 校验">
          <el-radio-group v-model="form.keyPatternMode" :disabled="submitting">
            <el-radio-button value="none">关闭校验</el-radio-button>
            <el-radio-button value="custom">自定义表达式</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item
          v-if="showKeyPattern && form.keyPatternMode === 'custom'"
          label="表达式"
          prop="keyPattern"
        >
          <el-input
            v-model="form.keyPattern"
            placeholder="^[A-Z][A-Z0-9_]*$"
            :disabled="submitting"
          />
        </el-form-item>
      </el-form>
    </div>

    <template #footer>
      <el-button :disabled="submitting" @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" :disabled="!hasChanges" @click="submit">
        保存
      </el-button>
    </template>
  </el-dialog>
</template>
