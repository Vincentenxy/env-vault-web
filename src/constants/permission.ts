/**
 * 权限码常量。所有写权限判断必须从这里引用,不允许散落字符串。
 *
 * 与后端 RBAC 注册的 permissionCode 保持一致,后续增加码值时必须前后端同步。
 *
 * 命名格式 `<resource>:<action>`,action 取自 RBAC 设计的常见动作:
 *   read / list / create / update / delete / reveal / manage / force_delete ...
 *
 * 增删时同步检视 rbac.yaml 与 useRbacStore 的加载逻辑。
 */
export const Permission = {
  // ---------- Org ----------
  OrgRead: 'org:read',
  OrgList: 'org:list',
  OrgCreate: 'org:create',
  OrgUpdate: 'org:update',
  OrgDelete: 'org:delete',
  OrgForceDelete: 'org:force_delete',

  // ---------- Project ----------
  ProjectRead: 'project:read',
  ProjectList: 'project:list',
  ProjectCreate: 'project:create',
  ProjectUpdate: 'project:update',
  ProjectDelete: 'project:delete',
  ProjectForceDelete: 'project:force_delete',

  // ---------- Env ----------
  EnvRead: 'env:read',
  EnvList: 'env:list',
  EnvCreate: 'env:create',
  EnvUpdate: 'env:update',
  EnvDelete: 'env:delete',
  EnvForceDelete: 'env:force_delete',

  // ---------- Env template ----------
  // 注意:permission code 跟后端 /rbac/me/permissions 的实际返回完全对齐,
  // 必须用冒号风格(env:template:read)。历史上曾用过下划线(env_template:read),
  // 与后端不一致会导致 has() 永远 false —— 这里已统一。
  EnvTemplateRead: 'env:template:read',
  EnvTemplateManage: 'env:template:manage',

  // ---------- Folder ----------
  FolderRead: 'folder:read',
  FolderList: 'folder:list',
  FolderCreate: 'folder:create',
  FolderUpdate: 'folder:update',
  FolderDelete: 'folder:delete',

  // ---------- Secret ----------
  SecretRead: 'secret:read',
  SecretList: 'secret:list',
  SecretReveal: 'secret:reveal',
  SecretCreate: 'secret:create',
  SecretUpdate: 'secret:update',
  SecretDelete: 'secret:delete',

  // ---------- Audit ----------
  AuditRead: 'audit:read',
  AuditExport: 'audit:export',

  // ---------- RBAC ----------
  RbacRoleRead: 'rbac:role:read',
  RbacRoleManage: 'rbac:role:manage',
  RbacBindingRead: 'rbac:binding:read',
  RbacBindingManage: 'rbac:binding:manage',
  RbacUserRead: 'rbac:user:read',
} as const

export type PermissionCode = (typeof Permission)[keyof typeof Permission]
