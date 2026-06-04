import type { Environment } from '@/types/env'

/**
 * 拿一个 env 的所属 project id。
 *
 * 背景:`Environment` 类型使用语义化字段 `projectId`,但后端 list/info 响应里
 * 实际下发的是 `parentId`(与 `CreateEnvironmentRequest` / `EnvironmentLookup` 一致)。
 * 客户端按 `e.projectId` 过滤 → 空数组 → 下拉里没东西可选。
 *
 * 兜底顺序:`parentId` → `projectId` → 空串。
 */
export function getEnvProjectId(e: Environment): string {
  const x = e as Environment & { parentId?: string }
  return x.parentId ?? e.projectId ?? ''
}
