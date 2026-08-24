<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'

export interface CardEditPayload {
  name: string
  remark: string
}

const props = defineProps<{
  modelValue: boolean
  title: string
  name: string
  remark: string
  submitting: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [payload: CardEditPayload]
}>()

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const formRef = ref<FormInstance>()
const form = reactive<CardEditPayload>({ name: '', remark: '' })
const rules: FormRules<CardEditPayload> = {
  name: [
    { required: true, message: '请输入名称', trigger: 'blur' },
    { max: 64, message: '长度不能超过 64 个字符', trigger: 'blur' },
  ],
  remark: [{ max: 256, message: '长度不能超过 256 个字符', trigger: 'blur' }],
}

const hasChanges = computed(
  () => form.name.trim() !== props.name.trim() || form.remark.trim() !== props.remark.trim(),
)

function resetForm(): void {
  form.name = props.name
  form.remark = props.remark
  nextTick(() => formRef.value?.clearValidate())
}

async function submit(): Promise<void> {
  if (props.submitting || !hasChanges.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  emit('submit', { name: form.name.trim(), remark: form.remark.trim() })
}

watch(
  () => [props.modelValue, props.name, props.remark] as const,
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
