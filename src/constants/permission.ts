/**
 * 权限码常量。所有写权限判断必须从这里引用,不允许散落字符串。
 *
 * 与后端 RBAC 注册的 permissionCode 保持一致,后续增加码值时必须前后端同步。
 */
export const Permission = {
  SecretRead: 'secret:read',
  SecretReveal: 'secret:reveal',
  SecretUpdate: 'secret:update',
  SecretDelete: 'secret:delete',
  SecretCreate: 'secret:create',
  OrgForceDelete: 'org:force_delete',
  ProjectForceDelete: 'project:force_delete',
  EnvForceDelete: 'env:force_delete',
  EnvTemplateRead: 'env_template:read',
} as const

export type PermissionCode = (typeof Permission)[keyof typeof Permission]
