import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref } from 'vue'
import { clearNavigationMemory, useNavigationMemory } from './use-navigation-memory'

const wrappers: ReturnType<typeof mount>[] = []
const defaults = { projectId: '', folderId: '', page: 1, expanded: [] as string[] }

function page(scope = 'secrets', initialReady = true) {
  const state = ref({ ...defaults })
  const ready = ref(initialReady)
  const wrapper = mount(
    defineComponent({
      setup() {
        const memory = useNavigationMemory(scope, defaults)
        state.value = memory.saved
        memory.track(() => (ready.value ? state.value : null))
        return () => null
      },
    }),
  )
  wrappers.push(wrapper)
  return { state, ready, wrapper }
}

beforeEach(() => sessionStorage.clear())
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.restoreAllMocks()
})

describe('page navigation memory', () => {
  it('restores nested folder and page even when refreshed before the watcher flushes', () => {
    const first = page()
    first.state.value = {
      projectId: 'project-2',
      folderId: 'group-child',
      page: 2,
      expanded: ['groups'],
    }
    window.dispatchEvent(new Event('beforeunload'))
    first.wrapper.unmount()
    expect(page().state.value).toEqual(first.state.value)
  })

  it('keeps the saved path during asynchronous initialization and stores the validated fallback', async () => {
    sessionStorage.setItem(
      'env-vault:navigation:v1:secrets',
      JSON.stringify({ ...defaults, folderId: 'deleted' }),
    )
    const current = page('secrets', false)
    current.state.value.folderId = ''
    await nextTick()
    window.dispatchEvent(new Event('beforeunload'))
    expect(JSON.parse(sessionStorage.getItem('env-vault:navigation:v1:secrets')!).folderId).toBe(
      'deleted',
    )
    current.ready.value = true
    await nextTick()
    expect(JSON.parse(sessionStorage.getItem('env-vault:navigation:v1:secrets')!).folderId).toBe('')
  })

  it('isolates different pages and projects', async () => {
    const first = page('project:one')
    first.state.value.folderId = 'folder-one'
    await nextTick()
    expect(page('project:two').state.value.folderId).toBe('')
    expect(page('project:one').state.value.folderId).toBe('folder-one')
  })

  it('clears session navigation without allowing late requests to restore an old account path', async () => {
    const current = page()
    sessionStorage.setItem('unrelated', 'keep')
    await nextTick()
    clearNavigationMemory()
    current.state.value.folderId = 'late-response'
    await nextTick()
    window.dispatchEvent(new Event('beforeunload'))
    expect(sessionStorage.getItem('env-vault:navigation:v1:secrets')).toBeNull()
    expect(sessionStorage.getItem('unrelated')).toBe('keep')
  })

  it('rejects invalid types and only persists explicitly declared navigation fields', async () => {
    sessionStorage.setItem(
      'env-vault:navigation:v1:secrets',
      JSON.stringify({
        projectId: {},
        folderId: 'valid',
        page: -1,
        expanded: [1],
        value: 'must-not-persist',
      }),
    )
    const current = page()
    await nextTick()
    expect(current.state.value).toEqual({ ...defaults, folderId: 'valid' })
    expect(sessionStorage.getItem('env-vault:navigation:v1:secrets')).not.toContain(
      'must-not-persist',
    )
  })

  it('handles corrupt or disabled browser storage without blocking navigation', async () => {
    sessionStorage.setItem('env-vault:navigation:v1:secrets', '{broken')
    expect(page().state.value).toEqual(defaults)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('disabled')
    })
    const current = page()
    current.state.value.folderId = 'folder'
    await nextTick()
    expect(() => window.dispatchEvent(new Event('beforeunload'))).not.toThrow()
  })
})
