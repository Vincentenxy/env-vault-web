export const UPPERCASE_SECRET_KEY_PATTERN = '^[A-Z][A-Z0-9_]*$'
export const LOWERCASE_SECRET_KEY_PATTERN = '^[a-z][a-z0-9-]*$'

export type CreateKeyPatternMode = 'none' | 'uppercase' | 'lowercase' | 'custom'
export type EditKeyPatternMode = 'none' | 'custom'

/** 根据 Folder 创建时选择的模式生成最终存储表达式 */
export function resolveCreateKeyPattern(mode: CreateKeyPatternMode, customPattern: string): string {
  if (mode === 'uppercase') return UPPERCASE_SECRET_KEY_PATTERN
  if (mode === 'lowercase') return LOWERCASE_SECRET_KEY_PATTERN
  if (mode === 'custom') return customPattern
  return ''
}

/** 校验浏览器是否能够编译自定义表达式 */
export function isValidKeyPattern(pattern: string): boolean {
  if (!pattern) return true
  try {
    compileFullKeyPattern(pattern)
    return true
  } catch {
    return false
  }
}

/** 使用 Folder 表达式完整匹配 Secret key */
export function matchesKeyPattern(key: string, pattern: string): boolean {
  if (!pattern) return true
  try {
    const match = compileFullKeyPattern(pattern).exec(key)
    return match !== null && match[0].length === key.length
  } catch {
    return false
  }
}

function compileFullKeyPattern(pattern: string): RegExp {
  return new RegExp(`^(?:${pattern})$`)
}
