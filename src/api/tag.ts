import { http } from './http'
import type { PageRequest } from '@/types/api'

export interface Tag {
  id: string
  tenantId: string
  code: string
  name: string
  remark: string
  allowValueSearch: boolean
  createAt: string
  updateAt: string
}

export interface TagForm {
  code: string
  name: string
  remark: string
  allowValueSearch: boolean
}

export function listTags(
  request: PageRequest & { tenantId: string; keyword?: string },
): Promise<{ list: Tag[]; total: number }> {
  return http.post('/tag/list', request)
}

/** 查询租户标签详情 */
export function getTag(request: { tenantId: string; id: string }): Promise<Tag> {
  return http.post('/tag/info', request)
}

export function createTag(
  request: TagForm & { tenantId: string },
  options?: { silent?: boolean },
): Promise<Tag> {
  return http.post('/tag/create', request, options)
}

export function updateTag(
  request: Omit<TagForm, 'code'> & { tenantId: string; id: string },
): Promise<Tag> {
  return http.post('/tag/update', request)
}

export function deleteTag(request: { tenantId: string; id: string }): Promise<void> {
  return http.post('/tag/delete', request)
}
