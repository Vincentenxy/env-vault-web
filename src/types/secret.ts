import type { Actor } from './user'
import type { Uuid } from './api'

/**
 * 单条 secret 在某个 env 下的完整实体(后端 list 响应里每 env 一份)。
 *
 * 注意:
 *  - `id` 是 env 专属的(同 code 在 dev / prod 下各有自己的 id),reveal / update
 *    都靠它定位。
 *  - `values` 现在是 `{ [envCode]: value }` 的 map,虽然每个 entry 只对应一个 env,
 *    但 shape 与单 secret 写入接口保持一致,后续支持批量场景能直接复用。
 *  - 严格不包含明文 `value` 字段(在明文 form 中);要看明文请调 reveal 接口。
 */
export interface SecretEntry extends Actor {
  id: Uuid
  orgId: Uuid
  orgCode: string
  projectId: Uuid
  projectCode: string
  environmentId: Uuid
  environmentCode: string
  folderId: Uuid
  folderCode: string
  key: string
  path: string
  /** envCode -> value。每个 entry 实际只对应一个 env(自己的 environmentCode) */
  values: Record<string, string>
  comment: string
  version: number
  createdAt: string
  updatedAt: string
}

/**
 * 后端 list 响应的新形态:一个 key 下挂 N 个 env entry(平铺,顶层 key 是 envCode)。
 * 例:`{ key: "DB_USER", dev: {...}, prod: {...} }`。
 *
 * 用 index signature + helper `getSecretEntries()` 来遍历;不要直接解构,
 * 因为 env code 是动态的(后端新增 env 不用改前端代码)。
 */
export interface SecretGroup {
  /** 顶层逻辑 key(对外稳定的 secret 标识);每个 env entry 里也有同名 `key`,值一致 */
  key: string
  [envCode: string]: SecretEntry | string | undefined
}

/** 从 SecretGroup 抽出所有 env entry(排除顶层的 `key` 字段)。 */
export function getSecretEntries(group: SecretGroup): SecretEntry[] {
  const out: SecretEntry[] = []
  for (const k of Object.keys(group)) {
    if (k === 'key') continue
    const entry = group[k]
    if (entry && typeof entry === 'object' && 'id' in entry) {
      out.push(entry as SecretEntry)
    }
  }
  return out
}

/** reveal 接口返回的明文,仅在弹窗内局部持有。 */
export interface SecretReveal {
  id: Uuid
  value: string
  version: number
}

// 旧 SecretMeta 保留作为 alias,旧代码引用 SecretMeta 不会立刻全断
export type SecretMeta = SecretEntry
