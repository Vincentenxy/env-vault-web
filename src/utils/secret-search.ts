import type {
  SecretSearchEnvironmentValue,
  SecretSearchGroup,
  SecretSearchScope,
} from '@/types/secret-search'

export interface SecretSearchRow {
  id: string
  secret: SecretSearchGroup
  environment: SecretSearchEnvironmentValue
  scopeSpan: number
  secretSpan: number
}

export function secretScopePath(scope: SecretSearchScope): string[] {
  return [
    scope.tenant.id,
    scope.organization.id,
    scope.project.id,
    ...scope.folders.map((folder) => folder.id),
  ]
}

// 合并基于完整路径和 groupId，不使用可重名的文件夹名称或 Key
// 先让同范围的密钥连续，再把每个环境展开为物理行
export function buildSecretSearchRows(groups: SecretSearchGroup[]): SecretSearchRow[] {
  const scopes = new Map<string, SecretSearchGroup[]>()
  for (const secret of groups) {
    if (!secret.values.length) continue
    const key = JSON.stringify(secretScopePath(secret.scope))
    const entries = scopes.get(key) ?? []
    entries.push(secret)
    scopes.set(key, entries)
  }
  return [...scopes.values()].flatMap((secrets) => {
    const scopeSpan = secrets.reduce((count, secret) => count + secret.values.length, 0)
    return secrets.flatMap((secret, secretIndex) =>
      [...secret.values]
        .sort((a, b) => a.orderNo - b.orderNo)
        .map((environment, envIndex) => ({
          id: `${secret.groupId}:${environment.secretId}`,
          secret,
          environment,
          scopeSpan: secretIndex === 0 && envIndex === 0 ? scopeSpan : 0,
          secretSpan: envIndex === 0 ? secret.values.length : 0,
        })),
    )
  })
}

export function secretSearchSpan({
  row,
  columnIndex,
}: {
  row: SecretSearchRow
  columnIndex: number
}): [number, number] {
  const span =
    columnIndex === 0 ? row.scopeSpan : [1, 2, 5].includes(columnIndex) ? row.secretSpan : 1
  return span ? [span, 1] : [0, 0]
}
