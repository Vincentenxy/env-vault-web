import { describe, expect, it } from 'vitest'
import { calculateEnvironmentOrderNo } from './environment-order'

describe('calculateEnvironmentOrderNo', () => {
  it('uses ten for the first environment', () => {
    expect(calculateEnvironmentOrderNo([], 0)).toBe(10)
  })

  it('appends after the current maximum order', () => {
    expect(calculateEnvironmentOrderNo([{ orderNo: 10 }, { orderNo: 40 }], 2)).toBe(50)
  })

  it('uses the average when inserted between environments', () => {
    const environments = [{ orderNo: 10 }, { orderNo: 20 }, { orderNo: 30 }, { orderNo: 40 }]
    expect(calculateEnvironmentOrderNo(environments, 3)).toBe(35)
  })

  it('places a new environment before the current first environment', () => {
    expect(calculateEnvironmentOrderNo([{ orderNo: 10 }], 0)).toBe(1)
  })

  it('shares the next order when no integer exists between adjacent orders', () => {
    expect(calculateEnvironmentOrderNo([{ orderNo: 30 }, { orderNo: 31 }], 1)).toBe(31)
  })
})
