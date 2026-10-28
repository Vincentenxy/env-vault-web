import type { AuditRecord } from '@/types/audit'

export const auditResourceLabels: Record<string, string> = {
  tenant: '租户',
  organization: '组织',
  project: '项目',
  environment: '环境',
  folder: '文件夹',
  secret: '共享密钥',
  tag: '标签',
  personalSecret: '个人密钥',
  user: '用户',
  userCollection: '用户列表',
  userAccount: '登录账号',
  masterKey: '系统主密钥',
  authentication: '认证请求',
}

const actionVerbs: Record<string, string> = {
  create: '创建',
  update: '修改',
  delete: '删除',
  read: '查看详情',
  list: '查询列表',
  reveal: '查看密钥值',
  history: '查询历史版本',
  'history.reveal': '查看历史值',
  'manage.update': '管理端修改',
  'manage.list': '管理端查询列表',
  'member.add': '添加成员',
  'member.remove': '移除成员',
}

export function auditActionLabel(action: string): string {
  if (action === 'auth.login') return '登录'
  if (action === 'auth.authorize') return '认证校验'
  const dot = action.indexOf('.')
  const resource = auditResourceLabels[action.slice(0, dot)]
  const verb = actionVerbs[action.slice(dot + 1)]
  return resource && verb ? `${resource} · ${verb}` : action
}

export function auditActor(record: AuditRecord): string {
  return (
    record.createByName ||
    record.createBy ||
    (record.actorType === 'anonymous'
      ? '未认证用户'
      : record.actorType === 'system'
        ? '系统'
        : '未知用户')
  )
}

export function auditValue(value: unknown): string {
  if (value === undefined || value === null) return '未设置'
  if (value === '') return '空值'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  return JSON.stringify(value, null, 2)
}
