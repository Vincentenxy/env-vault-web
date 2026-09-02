import { describe, expect, it } from 'vitest'
import { stripAppBase, withAppBase } from './app-base-path'

describe('app base path helpers', () => {
  it('adds a normalized deployment base to an internal path', () => {
    expect(withAppBase('/login?redirect=%2Fapp', '/envvault/')).toBe(
      '/envvault/login?redirect=%2Fapp',
    )
    expect(withAppBase('/login', '/')).toBe('/login')
  })

  it('strips only the complete deployment base segment', () => {
    expect(stripAppBase('/envvault/app/secrets', '/envvault/')).toBe('/app/secrets')
    expect(stripAppBase('/envvault', '/envvault/')).toBe('/')
    expect(stripAppBase('/envvault-other/app', '/envvault/')).toBe('/envvault-other/app')
  })
})
