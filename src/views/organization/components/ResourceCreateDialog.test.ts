import { afterEach, describe, expect, it } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'

import ResourceCreateDialog, { type CreateResourceType } from './ResourceCreateDialog.vue'

const tenants = [
  {
    id: 'tenant-1',
    name: '租户一',
    orgList: [
      {
        id: 'organization-1',
        name: '组织一',
        projectList: [],
      },
    ],
  },
]

const DialogStub = defineComponent({
  props: {
    modelValue: Boolean,
  },
  template: '<div v-if="modelValue"><slot /><slot name="header" /><slot name="footer" /></div>',
})

const FormStub = defineComponent({
  setup(_, { expose, slots }) {
    expose({ clearValidate: () => undefined })
    return () => h('form', slots.default?.())
  },
})

afterEach(() => {
  window.localStorage.clear()
})

describe('ResourceCreateDialog', () => {
  it.each<[CreateResourceType, string]>([
    ['tenant', '新建租户'],
    ['organization', '新建组织'],
    ['project', '新建项目'],
  ])('opens on the current %s level', async (initialType, expectedTab) => {
    const wrapper = shallowMount(ResourceCreateDialog, {
      props: {
        modelValue: false,
        tenants,
        initialType,
        initialTenantId: 'tenant-1',
        initialOrganizationId: 'organization-1',
      },
      global: {
        plugins: [createPinia()],
        stubs: {
          ElDialog: DialogStub,
          ElButton: true,
          ElForm: FormStub,
          ElFormItem: true,
          ElIcon: true,
          ElInput: true,
          ElOption: true,
          ElSelect: true,
          ElSwitch: true,
          ElTooltip: true,
          ManagerSelect: true,
        },
      },
    })

    await wrapper.setProps({ modelValue: true })
    await nextTick()

    expect(wrapper.get('.resource-create-tabs__item.is-active').text()).toBe(expectedTab)

    wrapper.unmount()
  })
})
