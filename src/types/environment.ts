import type { Uuid } from './api'

export interface Environment {
  id: Uuid
  projectId: Uuid
  code: string
  name: string
  remark: string
  orderNo: number
  isCheckPerm: boolean
  createBy: string
  updateBy: string
  createAt: string
  updateAt: string
}

/** org 层只读环境模板(name/comment 永远是首次创建时的快照)。 */
export interface EnvironmentTemplate {
  id: Uuid
  orgId: Uuid
  code: string
  name: string
  comment: string
  createdBy: string
  createdByLabel: string
  updatedBy: string
  updatedByLabel: string
  createdAt: string
  updatedAt: string
}
