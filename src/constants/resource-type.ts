/**
 * RBAC 资源类型枚举(resourceType),与后端 `user_role_bindings.scope_type` 对齐。
 */
export const ResourceType = {
  Global: 'global',
  Organization: 'organization',
  Project: 'project',
  Environment: 'environment',
  Folder: 'folder',
  Secret: 'secret',
  EnvTemplate: 'env_template',
} as const

export type ResourceTypeValue = (typeof ResourceType)[keyof typeof ResourceType]
