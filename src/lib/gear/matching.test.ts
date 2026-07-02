import { describe, expect, it } from 'vitest'
import {
  flyMatchesHatch,
  matchGearToSpot,
  parseHookSizeRange,
  parseTippetX,
  tippetXForHookSize,
  type SpotConditionsInput,
} from './matching'
import { HATCHES } from '../hatches'
import type { Fly, FullGearProfile, Line, Rod, Reel, TippetSpool } from '@/types/database'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const hatch = (name: string) => {
  const h = HATCHES.find((h) => h.name === name)
  if (!h) throw new Error(`No hatch named ${name}`)
  return h
}

let seq = 0
const id = () => `id-${++seq}`

function fly(over: Partial<Fly> = {}): Fly {
  return {
    id: id(),
    gear_profile_id: 'gp',
    box_id: null,
    pattern: 'Parachute Adams',
    category: 'dry',
    hook_size: 16,
    color: null,
    weighted: false,
    quantity: 3,
    imitates: null,
    created_at: '2026-01-01',
    ...over,
  }
}

function rod(over: Partial<Rod> = {}): Rod {
  return {
    id: id(),
    gear_profile_id: 'gp',
    make: 'Sage',
    model: null,
    length_ft: 9,
    weight_class: 5,
    action: 'fast',
    pieces: 4,
    ...over,
  }
}

function reel(over: Partial<Reel> = {}): Reel {
  return {
    id: id(),
    gear_profile_id: 'gp',
    make: 'Lamson',
    model: null,
    line_weight: 5,
    arbor: 'large',
    ...over,
  }
}

function line(over: Partial<Line> = {}): Line {
  return {
    id: id(),
    gear_profile_id: 'gp',
    type: 'floating',
    weight: 5,
    taper: 'WF',
    sink_ips: null,
    ...over,
  }
}

function spool(over: Partial<TippetSpool> = {}): TippetSpool {
  return {
    id: id(),
    gear_profile_id: 'gp',
    x_size: '5X',
    material: 'mono',
    breaking_lb: 4.75,
    low_stock: false,
    ...over,
  }
}

function profile(over: Partial<FullGearProfile> = {}): FullGearProfile {
  return {
    id: 'gp',
    user_id: 'u',
    wading_setup: 'waders',
    fly_sort: 'category',
    updated_at: '2026-01-01',
    rods: [rod()],
    reels: [reel()],
    lines: [line()],
    leaders: [],
    fly_boxes: [],
    flies: [fly()],
    tippet_spools: [spool()],
    ...over,
  }
}

/** July in Montana (west of the 100th meridian), normal flow, good temp. */
const julyWest: SpotConditionsInput = {
  flowCategory: 'normal',
  waterTempF: 55,
  month: 7,
  longitude: -111.5,
}

const finding = (r: ReturnType<typeof matchGearToSpot>, kind: string) =>
  r.findings.find((f) => f.kind === kind)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

describe('tippetXForHookSize', () => {
  it('applies hook ÷ 4', () => {
    expect(tippetXForHookSize(16)).toBe(4)
    expect(tippetXForHookSize(20)).toBe(5)
    expect(tippetXForHookSize(4)).toBe(1)
  })
  it('clamps to the 0X–8X range', () => {
    expect(tippetXForHookSize(40)).toBe(8)
    expect(tippetXForHookSize(0)).toBe(0)
  })
})

describe('parseHookSizeRange', () => {
  it('parses en-dash ranges like the hatch table uses', () => {
    expect(parseHookSizeRange('#18–24')).toEqual({ min: 18, max: 24 })
  })
  it('parses a single size as a degenerate range', () => {
    expect(parseHookSizeRange('#12')).toEqual({ min: 12, max: 12 })
  })
  it('returns null when there are no numbers', () => {
    expect(parseHookSizeRange('varies')).toBeNull()
  })
})

describe('parseTippetX', () => {
  it('parses preset-style designations, case-insensitively', () => {
    expect(parseTippetX('5X')).toBe(5)
    expect(parseTippetX('0x')).toBe(0)
  })
  it('rejects custom text', () => {
    expect(parseTippetX('heavy')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// flyMatchesHatch
// ---------------------------------------------------------------------------

describe('flyMatchesHatch', () => {
  it('matches by imitates taxon when hook size fits', () => {
    const f = fly({ pattern: 'Custom Olive Thing', imitates: 'baetis', hook_size: 18 })
    expect(flyMatchesHatch(f, hatch('Blue-Winged Olive'))).toBe(true)
  })

  it('rejects a taxon match when the hook size is outside the hatch range', () => {
    const f = fly({ imitates: 'baetis', hook_size: 10 }) // BWO is #16–22
    expect(flyMatchesHatch(f, hatch('Blue-Winged Olive'))).toBe(false)
  })

  it('falls back to pattern-name matching against suggested patterns', () => {
    const f = fly({ pattern: 'Elk Hair Caddis (tan)', imitates: null, hook_size: 16 })
    expect(flyMatchesHatch(f, hatch('Caddis'))).toBe(true)
  })

  it('accepts a taxon match when the fly has no hook size', () => {
    const f = fly({ imitates: 'midge', hook_size: null })
    expect(flyMatchesHatch(f, hatch('Midges'))).toBe(true)
  })

  it('does not match an unrelated fly', () => {
    const f = fly({ pattern: 'Woolly Bugger', imitates: 'sculpin', hook_size: 6 })
    expect(flyMatchesHatch(f, hatch('Trico'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// matchGearToSpot
// ---------------------------------------------------------------------------

describe('matchGearToSpot — outfit balance', () => {
  it('reports a balanced outfit when rod, line, and reel weights align', () => {
    const r = matchGearToSpot(profile(), julyWest)
    expect(finding(r, 'outfit')?.status).toBe('good')
  })

  it('flags no rods as an explicit mismatch', () => {
    const r = matchGearToSpot(profile({ rods: [] }), julyWest)
    expect(finding(r, 'outfit')?.status).toBe('mismatch')
    expect(r.overall).toBe('mismatch')
  })

  it('is partial when the line balances but no reel is within ±1', () => {
    const r = matchGearToSpot(profile({ reels: [reel({ line_weight: 8 })] }), julyWest)
    expect(finding(r, 'outfit')?.status).toBe('partial')
  })

  it('mismatches when no line is within one weight class of any rod', () => {
    const r = matchGearToSpot(profile({ lines: [line({ weight: 8 })] }), julyWest)
    expect(finding(r, 'outfit')?.status).toBe('mismatch')
  })
})

describe('matchGearToSpot — line type vs. flow', () => {
  it('mismatches high water with only floating lines and no weighted flies', () => {
    const r = matchGearToSpot(
      profile({ flies: [fly({ weighted: false })] }),
      { ...julyWest, flowCategory: 'much-above-normal' }
    )
    expect(finding(r, 'line-type')?.status).toBe('mismatch')
    expect(r.overall).toBe('mismatch')
  })

  it('is partial in high water when weighted flies compensate for a floating-only quiver', () => {
    const r = matchGearToSpot(
      profile({ flies: [fly({ weighted: true })] }),
      { ...julyWest, flowCategory: 'above-normal' }
    )
    expect(finding(r, 'line-type')?.status).toBe('partial')
  })

  it('is good in high water with a sinking line', () => {
    const r = matchGearToSpot(
      profile({ lines: [line(), line({ type: 'sink-tip', sink_ips: 3 })] }),
      { ...julyWest, flowCategory: 'above-normal' }
    )
    expect(finding(r, 'line-type')?.status).toBe('good')
  })

  it('prefers floating at normal flows', () => {
    const r = matchGearToSpot(profile(), julyWest)
    expect(finding(r, 'line-type')?.status).toBe('good')
  })

  it('reports info (not a verdict) when there is no flow baseline', () => {
    const r = matchGearToSpot(profile(), { ...julyWest, flowCategory: null })
    expect(finding(r, 'line-type')?.status).toBe('info')
  })
})

describe('matchGearToSpot — flies and tippet vs. hatches', () => {
  it('lists uncovered hatches explicitly instead of silently deprioritizing', () => {
    const r = matchGearToSpot(profile({ flies: [fly({ imitates: 'pmd', hook_size: 16, pattern: 'PMD Sparkle Dun' })] }), julyWest)
    const f = finding(r, 'flies')
    expect(f?.status).toBe('partial')
    expect(f?.summary).toContain('Pale Morning Dun')
    expect(f?.summary).toContain('nothing matches')
  })

  it('mismatches when no flies exist at all', () => {
    const r = matchGearToSpot(profile({ flies: [] }), julyWest)
    expect(finding(r, 'flies')?.status).toBe('mismatch')
  })

  it('mismatches tippet when there are no spools', () => {
    const r = matchGearToSpot(profile({ tippet_spools: [] }), julyWest)
    expect(finding(r, 'tippet')?.status).toBe('mismatch')
  })

  it('covers tippet within ±1X of what the hatch sizes call for', () => {
    // July-west hatches span roughly #6 (golden stone) to #24 (midge/trico):
    // needed X ≈ 1–2 up to 5–6. Spools at 2X..6X ±1 cover 1X..7X.
    const spools = ['2X', '3X', '4X', '5X', '6X'].map((x) => spool({ x_size: x }))
    const r = matchGearToSpot(profile({ tippet_spools: spools }), julyWest)
    expect(finding(r, 'tippet')?.status).toBe('good')
  })

  it('flags low-stock spools that the month depends on', () => {
    const spools = ['2X', '3X', '4X', '5X', '6X'].map((x) =>
      spool({ x_size: x, low_stock: x === '5X' })
    )
    const r = matchGearToSpot(profile({ tippet_spools: spools }), julyWest)
    const f = finding(r, 'tippet')
    expect(f?.status).toBe('partial')
    expect(f?.summary).toContain('5X')
    expect(f?.summary).toContain('low stock')
  })
})

describe('matchGearToSpot — wading setup', () => {
  it('mismatches wet wading in numbing water', () => {
    const r = matchGearToSpot(profile({ wading_setup: 'wet' }), { ...julyWest, waterTempF: 45 })
    expect(finding(r, 'wading')?.status).toBe('mismatch')
  })

  it('warns on wet wading in chilly water', () => {
    const r = matchGearToSpot(profile({ wading_setup: 'wet' }), { ...julyWest, waterTempF: 55 })
    expect(finding(r, 'wading')?.status).toBe('partial')
  })

  it('is good wet wading in comfortable water', () => {
    const r = matchGearToSpot(profile({ wading_setup: 'wet' }), { ...julyWest, waterTempF: 62 })
    expect(finding(r, 'wading')?.status).toBe('good')
  })

  it('emits nothing for waders (they work in any water)', () => {
    const r = matchGearToSpot(profile({ wading_setup: 'waders' }), { ...julyWest, waterTempF: 45 })
    expect(finding(r, 'wading')).toBeUndefined()
  })

  it('emits nothing when the gage does not report temperature', () => {
    const r = matchGearToSpot(profile({ wading_setup: 'wet' }), { ...julyWest, waterTempF: null })
    expect(finding(r, 'wading')).toBeUndefined()
  })
})

describe('matchGearToSpot — water temperature', () => {
  it('mismatches at 67°F and above', () => {
    const r = matchGearToSpot(profile(), { ...julyWest, waterTempF: 68 })
    expect(finding(r, 'water-temp')?.status).toBe('mismatch')
    expect(r.overall).toBe('mismatch')
  })

  it('warns approaching 67°F', () => {
    const r = matchGearToSpot(profile(), { ...julyWest, waterTempF: 65.5 })
    expect(finding(r, 'water-temp')?.status).toBe('partial')
  })

  it('is good in the productive band', () => {
    const r = matchGearToSpot(profile(), { ...julyWest, waterTempF: 55 })
    expect(finding(r, 'water-temp')?.status).toBe('good')
  })

  it('emits no temp finding when the gage does not report temperature', () => {
    const r = matchGearToSpot(profile(), { ...julyWest, waterTempF: null })
    expect(finding(r, 'water-temp')).toBeUndefined()
  })
})

describe('matchGearToSpot — aggregation', () => {
  it('info findings never drag the overall down', () => {
    // Well-stocked box covering all July-west hatches, no flow baseline (info).
    const flies = [
      fly({ imitates: 'midge', hook_size: 20, pattern: 'Zebra Midge' }),
      fly({ imitates: 'caddis', hook_size: 16, pattern: 'Elk Hair Caddis' }),
      fly({ imitates: 'stonefly', hook_size: 8, pattern: "Pat's Rubber Legs" }),
      fly({ imitates: 'pmd', hook_size: 16, pattern: 'PMD Sparkle Dun' }),
      fly({ imitates: 'trico', hook_size: 22, pattern: 'Trico Spinner' }),
      fly({ hook_size: 14, pattern: 'Callibaetis Sparkle Dun' }),
      fly({ imitates: 'hopper', hook_size: 10, pattern: 'Chubby Chernobyl' }),
      fly({ hook_size: 14, pattern: 'Yellow Sally' }),
    ]
    const spools = ['1X', '2X', '3X', '4X', '5X', '6X'].map((x) => spool({ x_size: x }))
    const r = matchGearToSpot(
      profile({ flies, tippet_spools: spools }),
      { ...julyWest, flowCategory: null }
    )
    expect(finding(r, 'flies')?.status).toBe('good')
    expect(finding(r, 'line-type')?.status).toBe('info')
    expect(r.overall).toBe('good')
  })
})
