import type { Actor } from './user'
import type { Uuid } from './api'

/**
 * Secret 元数据。严格不包含明文 `value` 字段,与后端列表约定一致。
 */
export interface SecretMeta extends Actor {
  id: Uuid
  folderId: Uuid
  key: string
  comment: string
  version: number
  createdAt: string
  updatedAt: string
}

/** reveal 接口返回的明文,仅在弹窗内局部持有。 */
export interface SecretReveal {
  id: Uuid
  value: string
  version: number
}
