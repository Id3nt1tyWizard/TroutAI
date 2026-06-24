import { describe, it, expect } from 'vitest'
import { boundingBox } from './index'

describe('boundingBox', () => {
  it('centers the box on the point', () => {
    const b = boundingBox(45, -111, 25)
    expect((b.west + b.east) / 2).toBeCloseTo(-111, 6)
    expect((b.south + b.north) / 2).toBeCloseTo(45, 6)
  })

  it('latitude delta is ~radius/69 degrees', () => {
    const b = boundingBox(45, -111, 69)
    expect(b.north - 45).toBeCloseTo(1, 5)
  })

  it('widens the longitude span at higher latitude', () => {
    const lowLatSpan = (() => {
      const b = boundingBox(10, 0, 25)
      return b.east - b.west
    })()
    const highLatSpan = (() => {
      const b = boundingBox(60, 0, 25)
      return b.east - b.west
    })()
    expect(highLatSpan).toBeGreaterThan(lowLatSpan)
  })
})
