/**
 * Unit tests for tool dispatch — pure paths only (no network), matching the
 * Step 3 convention. Tools that call USGS/Open-Meteo are exercised only on their
 * pre-network validation/early-return branches.
 */

import { describe, it, expect } from 'vitest'
import { executeTool, type ToolContext } from './tools'
import type { FullGearProfile } from '@/types/database'

const noGear: ToolContext = { getGearProfile: async () => null }

function parse(content: string) {
  return JSON.parse(content)
}

describe('check_regulations (stub)', () => {
  it('signals not-integrated and echoes the state', async () => {
    const res = await executeTool('check_regulations', { state: 'Montana' }, noGear)
    expect(res.isError).toBe(false)
    const data = parse(res.content)
    expect(data.integrated).toBe(false)
    expect(data.state).toBe('Montana')
    expect(data.note).toMatch(/verify/i)
  })
})

describe('get_hatch_data (integrated)', () => {
  it('returns active hatches for the month + region from date/longitude', async () => {
    const res = await executeTool(
      'get_hatch_data',
      { date: '2026-06-15', longitude: -111.7 },
      noGear
    )
    expect(res.isError).toBe(false)
    const data = parse(res.content)
    expect(data.integrated).toBe(true)
    expect(data.monthName).toBe('June')
    expect(data.region).toBe('west')
    const names = data.hatches.map((h: { name: string }) => h.name)
    expect(names).toContain('Salmonfly')
  })

  it('falls back to the current month when no date is given', async () => {
    const res = await executeTool('get_hatch_data', {}, noGear)
    const data = parse(res.content)
    expect(data.integrated).toBe(true)
    expect(typeof data.month).toBe('number')
  })
})

describe('get_gear_profile', () => {
  it('reports not found when the angler has no profile', async () => {
    const res = await executeTool('get_gear_profile', {}, noGear)
    const data = parse(res.content)
    expect(data.found).toBe(false)
  })

  it('maps a full profile to compact camelCase fields', async () => {
    const profile: FullGearProfile = {
      id: 'p1',
      user_id: 'u1',
      wading_setup: 'waders',
      fly_sort: 'category',
      updated_at: '2026-06-25T00:00:00Z',
      rods: [
        { id: 'r1', gear_profile_id: 'p1', make: 'Sage', model: null, length_ft: 9, weight_class: 5, action: 'fast', pieces: 4 },
      ],
      reels: [{ id: 're1', gear_profile_id: 'p1', make: 'Lamson', model: null, line_weight: 5, arbor: 'large' }],
      lines: [{ id: 'l1', gear_profile_id: 'p1', type: 'floating', weight: 5, taper: 'WF', sink_ips: null }],
      leaders: [{ id: 'le1', gear_profile_id: 'p1', material: 'fluoro', length_ft: 9, tippet_x: '5X' }],
      fly_boxes: [{ id: 'b1', gear_profile_id: 'p1', label: 'Dry box' }],
      flies: [
        {
          id: 'f1',
          gear_profile_id: 'p1',
          box_id: 'b1',
          pattern: 'Adams',
          category: 'dry',
          hook_size: 16,
          color: 'gray',
          weighted: false,
          quantity: 6,
          imitates: 'baetis',
          created_at: '2026-06-25T00:00:00Z',
        },
      ],
      tippet_spools: [
        { id: 't1', gear_profile_id: 'p1', x_size: '5X', material: 'fluoro', breaking_lb: 4.5, low_stock: false },
      ],
    }
    const ctx: ToolContext = { getGearProfile: async () => profile }

    const res = await executeTool('get_gear_profile', {}, ctx)
    const data = parse(res.content)
    expect(data.found).toBe(true)
    expect(data.wadingSetup).toBe('waders')
    expect(data.rods[0]).toEqual({ make: 'Sage', model: null, lengthFt: 9, weightClass: 5, action: 'fast' })
    expect(data.tippet[0]).toEqual({ xSize: '5X', material: 'fluoro', breakingLb: 4.5, lowStock: false })
    expect(data.flies[0]).toEqual({
      pattern: 'Adams',
      category: 'dry',
      hookSize: 16,
      color: 'gray',
      weighted: false,
      quantity: 6,
      imitates: 'baetis',
      box: 'Dry box',
    })
  })
})

describe('geocode_place', () => {
  it('returns empty results for a blank query without hitting the network', async () => {
    const res = await executeTool('geocode_place', { query: '   ' }, noGear)
    const data = parse(res.content)
    expect(data.results).toEqual([])
  })
})

describe('input validation', () => {
  it('errors when stream conditions are missing coordinates', async () => {
    const res = await executeTool('get_stream_conditions', { radius_miles: 25 }, noGear)
    expect(res.isError).toBe(true)
    expect(parse(res.content).error).toMatch(/latitude and longitude/i)
  })

  it('errors when weather is missing coordinates', async () => {
    const res = await executeTool('get_weather_forecast', {}, noGear)
    expect(res.isError).toBe(true)
  })

  it('errors on an unknown tool', async () => {
    const res = await executeTool('does_not_exist', {}, noGear)
    expect(res.isError).toBe(true)
    expect(parse(res.content).error).toMatch(/unknown tool/i)
  })
})
