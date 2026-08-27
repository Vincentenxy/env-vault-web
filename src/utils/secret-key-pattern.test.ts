import { describe, expect, it } from 'vitest'
import {
  LOWERCASE_SECRET_KEY_PATTERN,
  UPPERCASE_SECRET_KEY_PATTERN,
  isValidKeyPattern,
  matchesKeyPattern,
  resolveCreateKeyPattern,
} from './secret-key-pattern'

describe('secret key pattern', () => {
  it('resolves preset and custom expressions', () => {
    expect(resolveCreateKeyPattern('none', 'ignored')).toBe('')
    expect(resolveCreateKeyPattern('uppercase', '')).toBe(UPPERCASE_SECRET_KEY_PATTERN)
    expect(resolveCreateKeyPattern('lowercase', '')).toBe(LOWERCASE_SECRET_KEY_PATTERN)
    expect(resolveCreateKeyPattern('custom', '^custom$')).toBe('^custom$')
  })

  it('matches the complete key', () => {
    expect(matchesKeyPattern('DB_PASSWORD_1', UPPERCASE_SECRET_KEY_PATTERN)).toBe(true)
    expect(matchesKeyPattern('db-password-1', LOWERCASE_SECRET_KEY_PATTERN)).toBe(true)
    expect(matchesKeyPattern('prefix-foo', 'foo')).toBe(false)
    expect(matchesKeyPattern('AB', 'A|AB')).toBe(true)
  })

  it('rejects invalid expressions', () => {
    expect(isValidKeyPattern('[')).toBe(false)
    expect(matchesKeyPattern('anything', '[')).toBe(false)
  })
})
