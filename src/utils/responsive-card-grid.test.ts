import { describe, expect, it } from 'vitest'
import {
  calculateCardColumns,
  calculateCardPageSize,
  calculateCardRows,
} from './responsive-card-grid'

describe('calculateCardColumns', () => {
  it('calculates the number of cards that fit in one row', () => {
    expect(calculateCardColumns(2430, 230, 14)).toBe(10)
    expect(calculateCardColumns(500, 230, 14)).toBe(2)
  })

  it('returns zero until the container has a measurable width', () => {
    expect(calculateCardColumns(0, 230, 14)).toBe(0)
    expect(calculateCardColumns(-1, 230, 14)).toBe(0)
  })

  it('calculates rows and the complete visible card capacity', () => {
    expect(calculateCardRows(577, 183, 14)).toBe(3)
    expect(calculateCardPageSize(2430, 577, 230, 183, 14)).toBe(30)
  })
})
