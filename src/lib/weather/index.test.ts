import { describe, it, expect } from 'vitest'
import { describeWeatherCode } from './index'

describe('describeWeatherCode', () => {
  it('maps known WMO codes to plain English', () => {
    expect(describeWeatherCode(0)).toBe('Clear sky')
    expect(describeWeatherCode(3)).toBe('Overcast')
    expect(describeWeatherCode(61)).toBe('Slight rain')
    expect(describeWeatherCode(95)).toBe('Thunderstorm')
  })

  it('falls back gracefully for unknown codes', () => {
    expect(describeWeatherCode(123)).toMatch(/Unknown/)
  })
})
