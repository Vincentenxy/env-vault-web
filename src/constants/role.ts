/**
 * 角色常量(roleType)。与后端 roles.code 对齐。
 */
export const Role = {
  OrgAdmin: 'org_admin',
  ProjectAdmin: 'project_admin',
  ProjectDeveloper: 'project_developer',
  ProjectViewer: 'project_viewer',
} as const

export type RoleType = (typeof Role)[keyof typeof Role]
