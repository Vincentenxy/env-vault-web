import type { SecretHistoryItem } from '@/api/secret'
import type {
  SecretSearchGroup,
  SecretSearchPreviewData,
  SecretSearchScope,
} from '@/types/secret-search'

const paymentScope: SecretSearchScope = {
  tenant: { id: 'preview-tenant', name: '效能平台' },
  organization: { id: 'preview-org', name: '平台研发' },
  project: { id: 'preview-project', name: '支付服务' },
  folders: [{ id: 'preview-folder-group', name: '通用配置', code: 'common' }],
}
const userScope: SecretSearchScope = {
  ...paymentScope,
  project: { id: 'preview-project-2', name: '用户中心' },
  folders: [
    { id: 'preview-groups-group', name: '配置分组', code: 'groups' },
    { id: 'preview-group-service', name: '服务配置', code: 'service' },
  ],
}
const monitoringScope: SecretSearchScope = {
  tenant: { id: 'preview-tenant-2', name: '基础设施' },
  organization: { id: 'preview-org-2', name: '运维平台' },
  project: { id: 'preview-project-3', name: '监控服务' },
  folders: [{ id: 'preview-folder-group', name: '通用配置', code: 'common' }],
}

const envNames: Record<string, string> = { dev: '开发', test: '测试', sim: '仿真', prod: '生产' }
const envOrder = ['dev', 'test', 'sim', 'prod']

function group(
  id: string,
  key: string,
  remark: string,
  scope: SecretSearchScope,
  values: Record<string, string>,
  tags: Array<[string, string]>,
): SecretSearchGroup {
  return {
    groupId: id,
    key,
    remark,
    scope,
    tagList: tags.map(([code, name]) => ({
      id: `${scope.tenant.id}:${code}`,
      code,
      name,
      allowValueSearch: false,
    })),
    values: Object.entries(values).map(([envCode, value], index) => ({
      secretId: `${id}:${envCode}`,
      envId: envCode,
      envCode,
      envName: envNames[envCode] ?? envCode,
      orderNo: envOrder.indexOf(envCode) * 10,
      value,
      version: index < 2 ? 3 : 2,
      updateAt: `2026-09-${index < 2 ? '15' : '14'}T10:20:00+08:00`,
      masked: false,
    })),
  }
}

// 全部为虚构的配置和提交记录，不读取或保存真实密钥
export function createSecretSearchPreview(): SecretSearchPreviewData {
  const groups = [
    group(
      'demo-payment-domain',
      'SERVICE_DOMAIN',
      '支付服务访问地址',
      paymentScope,
      {
        dev: 'https://pay.dev.example.com',
        test: 'https://pay.test.example.com',
        sim: 'https://pay.sim.example.com',
        prod: 'https://pay.example.com',
      },
      [
        ['service', '服务配置'],
        ['endpoint', '访问地址'],
      ],
    ),
    group(
      'demo-payment-timeout',
      'REQUEST_TIMEOUT',
      '请求超时时间，单位毫秒',
      paymentScope,
      { dev: '3000', test: '5000', prod: '5000' },
      [['runtime', '运行参数']],
    ),
    group(
      'demo-user-domain',
      'SERVICE_DOMAIN',
      '用户中心访问地址',
      userScope,
      { dev: 'https://users.dev.example.com', prod: 'https://users.example.com' },
      [
        ['service', '服务配置'],
        ['endpoint', '访问地址'],
      ],
    ),
    group(
      'demo-user-callback',
      'CALLBACK_URL',
      '回调地址，生产环境暂未启用',
      userScope,
      { dev: 'https://users.dev.example.com/callback', prod: '' },
      [],
    ),
    group(
      'demo-retention',
      'RETENTION_DAYS',
      '指标数据保留天数',
      monitoringScope,
      { dev: '7', test: '14', prod: '30' },
      [['observability', '可观测性']],
    ),
  ]
  const data: SecretSearchPreviewData = { groups, histories: {}, batches: {} }
  for (const secret of groups) {
    const history = (data.histories[secret.groupId] =
      {} as SecretSearchPreviewData['histories'][string])
    for (const env of secret.values) {
      const records: SecretHistoryItem[] = []
      for (let version = env.version; version >= 1; version -= 1) {
        const batchId = `demo-batch:${secret.scope.project.id}:${version}`
        const item: SecretHistoryItem = {
          id: `${env.secretId}:v${version}`,
          secretId: env.secretId,
          batchId,
          groupId: secret.groupId,
          folderId: secret.scope.folders.at(-1)!.id,
          envCode: env.envCode,
          value:
            version === env.version || !env.value
              ? env.value
              : /^\d+$/.test(env.value)
                ? String(Number(env.value) + (env.version - version) * 10)
                : env.value.replace('example.com', `v${version}.example.com`),
          valueType: '',
          version,
          commitMsg: version === 1 ? 'initial version' : `调整${secret.remark}`,
          createBy: 'demo-user',
          createByName: '示例管理员',
          createAt: `2026-09-${12 + version}T10:20:00+08:00`,
        }
        records.push(item)
        const batch = (data.batches[batchId] ??= [])
        let detail = batch.find((candidate) => candidate.groupId === secret.groupId)
        if (!detail) {
          detail = { groupId: secret.groupId, key: secret.key, remark: secret.remark, versions: {} }
          batch.push(detail)
        }
        detail.versions[env.envId] = item
      }
      history[env.envId] = { total: records.length, list: records }
    }
  }
  return data
}
