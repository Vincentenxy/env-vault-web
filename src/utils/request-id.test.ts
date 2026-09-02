import { describe, expect, it } from 'vitest'

import { createRequestId } from './request-id'

describe('createRequestId', () => {
  it('uses crypto.randomUUID when it is available', () => {
    const source = {
      randomUUID: () => 'native-request-id',
    } as unknown as Crypto

    expect(createRequestId(source)).toBe('native-request-id')
  })

  it('creates a version 4 UUID when crypto.randomUUID is unavailable', () => {
    const source = {
      getRandomValues: (values: Uint8Array) => {
        values.fill(0)
        return values
      },
    } as unknown as Crypto

    expect(createRequestId(source)).toBe('00000000-0000-4000-8000-000000000000')
  })
})
