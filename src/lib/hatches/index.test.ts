import { describe, it, expect } from 'vitest'
import { getHatches, regionForLongitude, monthName } from './index'

const names = (r: ReturnType<typeof getHatches>) => r.hatches.map((h) => h.name)

describe('regionForLongitude', () => {
  it('classifies west of the 100th meridian as west', () => {
    expect(regionForLongitude(-111.7)).toBe('west') // Madison, MT
    expect(regionForLongitude(-105)).toBe('west')
  })
  it('classifies east of the 100th meridian as east', () => {
    expect(regionForLongitude(-77.5)).toBe('east') // Penn's Creek, PA
    expect(regionForLongitude(-99)).toBe('east')
  })
})

describe('getHatches', () => {
  it('returns June Western hatches including Salmonfly and PMD', () => {
    const res = getHatches({ month: 6, longitude: -111.7 })
    expect(res.region).toBe('west')
    expect(names(res)).toContain('Salmonfly')
    expect(names(res)).toContain('Pale Morning Dun')
  })

  it('excludes Eastern-only hatches from a Western query', () => {
    const res = getHatches({ month: 5, longitude: -111.7 })
    expect(names(res)).not.toContain('Hendrickson') // east-only
    expect(names(res)).not.toContain('Sulphur')
  })

  it('includes Eastern hatches for an Eastern query', () => {
    const res = getHatches({ month: 5, longitude: -77.5 })
    expect(res.region).toBe('east')
    expect(names(res)).toContain('Hendrickson')
  })

  it('always includes year-round midges', () => {
    expect(names(getHatches({ month: 1 }))).toContain('Midges')
    expect(names(getHatches({ month: 7 }))).toContain('Midges')
  })

  it('respects month windows (no Tricos in May)', () => {
    expect(names(getHatches({ month: 5 }))).not.toContain('Trico')
    expect(names(getHatches({ month: 8 }))).toContain('Trico')
  })

  it('without longitude includes both regions', () => {
    const res = getHatches({ month: 5 })
    expect(res.region).toBe('both')
    // Western Mother's Day Caddis and Eastern Hendrickson both present in May
    expect(names(res)).toContain("Mother's Day Caddis")
    expect(names(res)).toContain('Hendrickson')
  })

  it('labels the month', () => {
    expect(monthName(6)).toBe('June')
    expect(getHatches({ month: 6 }).monthName).toBe('June')
  })
})
