<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { createTag, type Tag, type TagForm } from '@/api/tag'
import { ApiError } from '@/types/api'

const props = defineProps<{ modelValue: boolean; tenantId: string }>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  created: [tag: Tag]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => {
    if (!submitting.value) emit('update:modelValue', value)
  },
})
const formRef = ref<FormInstance>()
const submitting = ref(false)
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
  remark: [{ max: 1024, message: '描述不能超过 1024 个字符', trigger: 'blur' }],
}

function reset(): void {
  Object.assign(form, { code: '', name: '', remark: '', allowValueSearch: true })
  void nextTick(() => formRef.value?.clearValidate())
}

async function submit(): Promise<void> {
  if (submitting.value || !props.tenantId) return
  if (!(await formRef.value?.validate().catch(() => false))) return

  submitting.value = true
  try {
    const tag = await createTag({
      tenantId: props.tenantId,
      code: form.code.trim(),
      name: form.name.trim(),
      remark: form.remark.trim(),
      allowValueSearch: form.allowValueSearch,
    })
    emit('created', tag)
    ElMessage.success('标签创建成功')
    emit('update:modelValue', false)
  } catch (error) {
    if (!(error instanceof ApiError)) ElMessage.error('标签创建失败')
  } finally {
    submitting.value = false
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) reset()
  },
)
</script>

<template>
  <el-dialog
    v-model="visible"
    title="新增标签"
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
        ref="formRef"
        class="vault-card-edit-dialog__form"
        :model="form"
        :rules="rules"
        label-position="left"
        label-width="110px"
        require-asterisk-position="right"
        :disabled="submitting"
        @submit.prevent="submit"
      >
        <el-form-item label="Code" prop="code">
          <el-input
            v-model="form.code"
            maxlength="64"
            placeholder="如 password、ip"
            aria-label="标签 Code"
          />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input
            v-model="form.name"
            maxlength="64"
            placeholder="标签名称"
            aria-label="标签名称"
          />
        </el-form-item>
        <el-form-item label="描述" prop="remark">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="3"
            maxlength="1024"
            show-word-limit
            placeholder="标签的用途或适用范围"
            aria-label="标签描述"
          />
        </el-form-item>
        <el-form-item label="允许值检索" prop="allowValueSearch">
          <el-switch v-model="form.allowValueSearch" aria-label="允许值检索" />
        </el-form-item>
      </el-form>
    </div>
    <template #footer>
      <el-button :disabled="submitting" @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">创建</el-button>
    </template>
  </el-dialog>
</template>
