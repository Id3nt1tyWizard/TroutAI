import { describe, it, expect } from 'vitest'
import {
  classifyFlow,
  celsiusToFahrenheit,
  parseStatRdb,
  type FlowPercentiles,
} from './index'

describe('celsiusToFahrenheit', () => {
  it('converts known anchors', () => {
    expect(celsiusToFahrenheit(0)).toBe(32)
    expect(celsiusToFahrenheit(100)).toBe(212)
  })
  it('rounds to one decimal', () => {
    expect(celsiusToFahrenheit(12.3)).toBeCloseTo(54.1, 5)
  })
})

describe('classifyFlow', () => {
  const p: FlowPercentiles = { p10: 1110, p25: 1170, p50: 1330, p75: 1510, p90: 1800 }

  it('normal between p25 and p75', () => {
    const s = classifyFlow(1330, p)
    expect(s.category).toBe('normal')
    expect(s.percentOfMedian).toBe(100)
    expect(s.medianCfs).toBe(1330)
  })
  it('much below normal under p10', () => {
    expect(classifyFlow(900, p).category).toBe('much-below-normal')
  })
  it('below normal between p10 and p25', () => {
    expect(classifyFlow(1150, p).category).toBe('below-normal')
  })
  it('above normal between p75 and p90', () => {
    expect(classifyFlow(1600, p).category).toBe('above-normal')
  })
  it('much above normal over p90', () => {
    expect(classifyFlow(2000, p).category).toBe('much-above-normal')
  })
  it('degrades to normal when bands are missing', () => {
    const sparse: FlowPercentiles = { p10: null, p25: null, p50: null, p75: null, p90: null }
    const s = classifyFlow(500, sparse)
    expect(s.category).toBe('normal')
    expect(s.percentOfMedian).toBeNull()
  })
})

describe('parseStatRdb', () => {
  const sample = [
    '# USGS statistics',
    'agency_cd\tsite_no\tparameter_cd\tts_id\tloc_web_ds\tmonth_nu\tday_nu\tbegin_yr\tend_yr\tcount_nu\tp10_va\tp25_va\tp50_va\tp75_va\tp90_va',
    '5s\t15s\t5s\t10n\t15s\t3n\t3n\t6n\t6n\t8n\t12s\t12s\t12s\t12s\t12s',
    'USGS\t06041000\t00060\t80825\t\t6\t24\t1939\t2025\t82\t800\t950\t1200\t1500\t1900',
    'USGS\t06041000\t00060\t80825\t\t1\t1\t1939\t2025\t82\t1110\t1170\t1330\t1510\t',
  ].join('\n')

  it('extracts percentiles for the requested month/day', () => {
    const m = parseStatRdb(sample, new Date(2026, 5, 24)) // month index 5 = June
    const p = m.get('06041000')
    expect(p).toBeTruthy()
    expect(p!.p50).toBe(1200)
    expect(p!.p90).toBe(1900)
  })
  it('returns null for empty percentile cells', () => {
    const m = parseStatRdb(sample, new Date(2026, 0, 1)) // Jan 1 row has empty p90
    expect(m.get('06041000')!.p90).toBeNull()
    expect(m.get('06041000')!.p50).toBe(1330)
  })
  it('returns an empty map when no row matches the date', () => {
    expect(parseStatRdb(sample, new Date(2026, 6, 4)).size).toBe(0)
  })
})
