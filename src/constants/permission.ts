/** UI 操作标识。最新接口未提供权限查询,最终权限由业务接口响应裁决。 */
export const Permission = {
  ProjectCreate: 'project:create',
  EnvRead: 'env:read',
  EnvCreate: 'env:create',
  FolderRead: 'folder:read',
  FolderCreate: 'folder:create',
  FolderUpdate: 'folder:update',
  FolderDelete: 'folder:delete',
  SecretCreate: 'secret:create',
  SecretUpdate: 'secret:update',
} as const

export type PermissionCode = (typeof Permission)[keyof typeof Permission]
