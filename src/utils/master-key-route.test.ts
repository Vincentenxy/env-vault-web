import { describe, expect, it } from 'vitest'
import {
  MASTER_KEY_ROUTE_PATH,
  buildMasterKeyLocation,
  isMasterKeyRoute,
  resolveMasterKeyRedirect,
} from './master-key-route'

describe('master key route helpers', () => {
  it('builds a startup route containing the current location', () => {
    expect(buildMasterKeyLocation('/app/secrets?folder=core#value')).toBe(
      '/masterKey?redirect=%2Fapp%2Fsecrets%3Ffolder%3Dcore%23value',
    )
  })

  it('recognizes the public master key route', () => {
    expect(isMasterKeyRoute(MASTER_KEY_ROUTE_PATH)).toBe(true)
    expect(isMasterKeyRoute(`${MASTER_KEY_ROUTE_PATH}/`)).toBe(true)
    expect(isMasterKeyRoute('/app/secrets')).toBe(false)
  })

  it('accepts only non-recursive internal redirect targets', () => {
    expect(resolveMasterKeyRedirect('/app/projects?id=1#env')).toBe('/app/projects?id=1#env')
    expect(resolveMasterKeyRedirect('https://example.com')).toBe('/app/secrets')
    expect(resolveMasterKeyRedirect('//example.com/path')).toBe('/app/secrets')
    expect(resolveMasterKeyRedirect('/masterKey?redirect=/app/projects')).toBe('/app/secrets')
    expect(resolveMasterKeyRedirect(undefined)).toBe('/app/secrets')
  })
})
