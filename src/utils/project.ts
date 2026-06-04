import type { Project } from '@/types/project'

/**
 * 拿一个 project 的所属 org id。
 *
 * 背景:`Project` 类型使用语义化字段 `orgId`,但后端 core.yaml 在 list/info 的响应里
 * 实际下发的是 `parentId`(与 Create/Lookup 请求体的字段名保持一致)。
 * 两边命名不一致 → 客户端按 `p.orgId` 过滤会得到空数组,下拉里没东西可选。
 *
 * 这里做一个向后兼容:优先 `parentId`,缺失再回退 `orgId`,都没有就空串。
 */
export function getProjectOrgId(p: Project): string {
  const x = p as Project & { parentId?: string }
  return x.parentId ?? p.orgId ?? ''
}
