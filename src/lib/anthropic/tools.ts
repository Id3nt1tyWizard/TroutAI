/**
 * Tool definitions + dispatch for the planner agent.
 *
 * Each tool wraps an existing Step 3 data wrapper (geo / weather / usgs) or the
 * angler's gear profile, returning a compact JSON summary — raw wrapper payloads
 * are trimmed to the fields the agent needs so we don't burn context on noise.
 *
 * `check_regulations` and `get_hatch_data` are STUBS: there is no regulations
 * wrapper yet (Step 7) and no hatch data source built. They return a structured
 * "not integrated" signal so the agent still runs the regulation-check step and
 * surfaces the required manual-verification warning.
 */

import type Anthropic from '@anthropic-ai/sdk'
import { geocode, boundingBox } from '@/lib/geo'
import { getForecast } from '@/lib/weather'
import { getStreamConditions } from '@/lib/usgs'
import { getHatches } from '@/lib/hatches'
import type { FullGearProfile } from '@/types/database'

/**
 * Context the executor needs that can't live in this module — chiefly the
 * authed user's gear, resolved server-side from `auth.uid()` (never trusting a
 * client-supplied id). Injected by the agent route.
 */
export interface ToolContext {
  getGearProfile: () => Promise<FullGearProfile | null>
}

/** Result of running one tool — `isError` drives the `is_error` flag on the tool_result. */
export interface ToolResult {
  content: string
  isError: boolean
}

export const plannerTools: Anthropic.Tool[] = [
  {
    name: 'geocode_place',
    description:
      'Resolve a place or water name to coordinates and admin region. Weak on compound names ("Madison River, Montana") — prefer a town or county and disambiguate from the results.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Place name to look up, e.g. "Ennis, Montana"' },
        count: { type: 'integer', description: 'Max results to return (default 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_stream_conditions',
    description:
      'Real-time USGS streamflow for gages within a radius of a point: discharge (cfs), flow status vs. historical norm, water temperature (°F), and gage height. Call this before recommending any spot.',
    input_schema: {
      type: 'object',
      properties: {
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        radius_miles: { type: 'number', description: 'Search radius in miles (default 25)' },
        max_gages: { type: 'integer', description: 'Max gages to evaluate (default 25)' },
      },
      required: ['latitude', 'longitude'],
    },
  },
  {
    name: 'get_weather_forecast',
    description:
      'Daily + current weather forecast for a point (imperial units): temps, precipitation, wind, and conditions. Use for the trip dates.',
    input_schema: {
      type: 'object',
      properties: {
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        forecast_days: { type: 'integer', description: '1–16, default 7' },
        past_days: { type: 'integer', description: '0–92, default 0' },
      },
      required: ['latitude', 'longitude'],
    },
  },
  {
    name: 'get_gear_profile',
    description:
      "Fetch the signed-in angler's saved gear: rods, reels, lines, leaders, fly boxes, wading setup, and tippet sizes. Match recommendations to this and flag mismatches.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'check_regulations',
    description:
      'Check state fishing regulations for an area. NOTE: live regulations data is not yet integrated — this returns a signal that you must surface a manual-verification warning to the angler.',
    input_schema: {
      type: 'object',
      properties: {
        state: { type: 'string', description: 'State or region name' },
        water_body: { type: 'string' },
        species: { type: 'string' },
      },
      required: ['state'],
    },
  },
  {
    name: 'get_hatch_data',
    description:
      'Likely insect hatches for a location and date from a curated seasonal calendar: name, active months, hook sizes, suggested patterns, and timing. Pass longitude to narrow West vs. East and date to pick the month.',
    input_schema: {
      type: 'object',
      properties: {
        latitude: { type: 'number' },
        longitude: { type: 'number', description: 'Narrows West/East hatch regime' },
        date: { type: 'string', description: 'ISO date (YYYY-MM-DD); picks the month' },
        region: { type: 'string' },
      },
      required: [],
    },
  },
]

type Input = Record<string, unknown>

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined
const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined

/** Run a single tool call. Throws are caught by the caller and turned into error results. */
export async function executeTool(
  name: string,
  input: unknown,
  ctx: ToolContext
): Promise<ToolResult> {
  const args = (input ?? {}) as Input
  try {
    switch (name) {
      case 'geocode_place':
        return ok(await toolGeocode(args))
      case 'get_stream_conditions':
        return ok(await toolStreamConditions(args))
      case 'get_weather_forecast':
        return ok(await toolWeather(args))
      case 'get_gear_profile':
        return ok(await toolGearProfile(ctx))
      case 'check_regulations':
        return ok(toolRegulations(args))
      case 'get_hatch_data':
        return ok(toolHatch(args))
      default:
        return err(`Unknown tool: ${name}`)
    }
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Tool execution failed')
  }
}

const ok = (data: unknown): ToolResult => ({ content: JSON.stringify(data), isError: false })
const err = (message: string): ToolResult => ({
  content: JSON.stringify({ error: message }),
  isError: true,
})

async function toolGeocode(args: Input) {
  const query = str(args.query)
  if (!query) return { results: [], note: 'No query provided.' }
  const results = await geocode(query, { count: num(args.count) ?? 5 })
  return {
    results: results.map((r) => ({
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      admin1: r.admin1,
      admin2: r.admin2,
      country: r.country,
      feature_code: r.feature_code,
      elevation_m: r.elevation_m,
    })),
  }
}

async function toolStreamConditions(args: Input) {
  const latitude = num(args.latitude)
  const longitude = num(args.longitude)
  if (latitude === undefined || longitude === undefined) {
    throw new Error('latitude and longitude are required')
  }
  const bbox = boundingBox(latitude, longitude, num(args.radius_miles) ?? 25)
  const conditions = await getStreamConditions(bbox, {
    maxGages: num(args.max_gages) ?? 25,
  })
  return {
    gageCount: conditions.length,
    gages: conditions.map((c) => ({
      name: c.gage.name,
      siteNumber: c.gage.siteNumber,
      latitude: c.gage.latitude,
      longitude: c.gage.longitude,
      dischargeCfs: c.discharge?.value ?? null,
      dischargeTime: c.discharge?.time ?? null,
      flowStatus: c.status?.label ?? 'unknown',
      percentOfMedian: c.status?.percentOfMedian ?? null,
      gageHeightFt: c.gageHeight?.value ?? null,
      waterTempF: c.waterTempF,
    })),
  }
}

async function toolWeather(args: Input) {
  const latitude = num(args.latitude)
  const longitude = num(args.longitude)
  if (latitude === undefined || longitude === undefined) {
    throw new Error('latitude and longitude are required')
  }
  const forecast = await getForecast(latitude, longitude, {
    forecastDays: num(args.forecast_days) ?? 7,
    pastDays: num(args.past_days) ?? 0,
  })
  return {
    timezone: forecast.timezone,
    current: forecast.current,
    daily: forecast.daily,
  }
}

async function toolGearProfile(ctx: ToolContext) {
  const profile = await ctx.getGearProfile()
  if (!profile) {
    return { found: false, note: 'No gear profile found for this angler.' }
  }
  return {
    found: true,
    wadingSetup: profile.wading_setup,
    tippetSizes: profile.tippet_sizes,
    rods: profile.rods.map((r) => ({ make: r.make, lengthFt: r.length_ft, weightClass: r.weight_class })),
    reels: profile.reels.map((r) => ({ make: r.make, lineWeight: r.line_weight })),
    lines: profile.lines.map((l) => ({ type: l.type, weight: l.weight })),
    leaders: profile.leaders.map((l) => ({ material: l.material, lengthFt: l.length_ft })),
    flyBoxes: profile.fly_boxes.map((f) => ({ category: f.category, patterns: f.patterns })),
  }
}

function toolRegulations(args: Input) {
  return {
    integrated: false,
    state: str(args.state) ?? null,
    note:
      'Live state regulations are not yet integrated (planned for a later build step). You MUST include a prominent warning in the itinerary telling the angler to verify current licenses, open seasons, special-regulation/closure waters, and limits with the state wildlife agency before fishing.',
  }
}

function monthFromDate(date: string | undefined): number {
  if (date) {
    const m = /^\d{4}-(\d{2})-\d{2}/.exec(date)
    if (m) {
      const month = Number(m[1])
      if (month >= 1 && month <= 12) return month
    }
  }
  return new Date().getMonth() + 1
}

function toolHatch(args: Input) {
  const month = monthFromDate(str(args.date))
  const result = getHatches({ month, longitude: num(args.longitude) })
  return {
    integrated: true,
    month: result.month,
    monthName: result.monthName,
    region: result.region,
    hatches: result.hatches,
    note: 'Seasonal hatch guidance — exact timing shifts with elevation, latitude, flows, and weather. Confirm current activity with a local fly shop.',
  }
}
