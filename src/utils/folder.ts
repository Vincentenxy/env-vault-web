import type { Folder } from '@/types/folder'

/**
 * 拿一个 folder 的所属 env id。
 *
 * 类型里是 `environmentId`(语义化),但后端 list 响应里实际可能是 `envId` 或
 * 其它命名;同时 level=1 时 `parentId` 本身就是 env id,也可作为兜底。
 *
 * 兜底顺序:`environmentId` → `envId` → `parentId` → 空串。
 */
export function getFolderEnvId(f: Folder): string {
  const x = f as Folder & { envId?: string; parentId?: string }
  return x.environmentId ?? x.envId ?? x.parentId ?? ''
}
