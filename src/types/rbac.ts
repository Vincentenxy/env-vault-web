import type { Uuid } from './api'

/* ============================================================
 * 权限域
 * ============================================================ */

/** rbac.yaml ScopeType */
export type ScopeType = 'global' | 'organization' | 'project' | 'environment' | 'folder'

/**
 * 任意 scope 的描述。`scopeType = 'global'` 时 `scopeId` 省略。
 * 对应后端 `ScopeRequest`。
 */
export interface Scope {
  scopeType: ScopeType
  scopeId?: Uuid
}
