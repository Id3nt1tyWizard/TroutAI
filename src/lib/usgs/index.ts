/**
 * USGS streamflow wrapper.
 *
 * Real-time data + gage discovery come from the USGS Water Data OGC API
 * (https://api.waterdata.usgs.gov/ogcapi/v0 — GeoJSON, no key). The historical
 * percentile baseline used to classify *streamflow status* comes from the
 * legacy USGS Statistics service (https://waterservices.usgs.gov/nwis/stat) —
 * the OGC API exposes only raw daily values, not pre-computed percentiles, so
 * we use the stat service (the same source USGS WaterWatch uses) for that one
 * job. Both are keyless.
 *
 * Collections used on the OGC API:
 *   - `monitoring-locations` — gage metadata, searchable by bounding box.
 *   - `latest-continuous`    — most recent continuous reading per gage/parameter
 *                              (accepts a bbox: one request covers a region).
 *
 * The planner-facing entry point is `getStreamConditions()`, which joins gages
 * with their live readings, drops gages with no current data, classifies flow
 * status against the historical norm, and surfaces water temperature in °F.
 * This is what satisfies the non-negotiable: "Never recommend a spot without
 * checking current streamflow status."
 */

import { fetchJson, fetchText } from '../http'

const DEFAULT_BASE_URL = 'https://api.waterdata.usgs.gov/ogcapi/v0'
const DEFAULT_STATS_BASE_URL = 'https://waterservices.usgs.gov/nwis/stat'

/** USGS NWIS parameter codes relevant to trout fishing. */
export const USGS_PARAMETERS = {
  /** Discharge / streamflow, cubic feet per second */
  discharge: '00060',
  /** Gage height (stage), feet */
  gageHeight: '00065',
  /** Water temperature, degrees Celsius */
  waterTemperature: '00010',
} as const

/** Parameters fetched by default — flow, stage, and (for trout) water temp. */
const DEFAULT_PARAMETERS = [
  USGS_PARAMETERS.discharge,
  USGS_PARAMETERS.gageHeight,
  USGS_PARAMETERS.waterTemperature,
]

const PARAMETER_NAMES: Record<string, string> = {
  '00060': 'Discharge',
  '00065': 'Gage height',
  '00010': 'Water temperature',
}

/** Bounding box in the order USGS/OGC expects: west, south, east, north. */
export interface BoundingBox {
  west: number
  south: number
  east: number
  north: number
}

export interface StreamGage {
  /** Full OGC id, e.g. "USGS-06040300" */
  id: string
  /** Bare NWIS site number, e.g. "06040300" */
  siteNumber: string
  name: string
  latitude: number
  longitude: number
  state: string | null
  county: string | null
  /** Site type label, e.g. "Stream" */
  siteType: string | null
  /** Drainage area in square miles, when reported */
  drainageAreaSqMi: number | null
  /** Gage altitude in feet, when reported */
  altitudeFt: number | null
}

export interface StreamflowReading {
  /** OGC id of the gage this reading belongs to, e.g. "USGS-06041000" */
  gageId: string
  /** NWIS parameter code, e.g. "00060" */
  parameterCode: string
  /** Plain-English parameter name, e.g. "Discharge" */
  parameterName: string
  /** Numeric measurement; null if the raw value couldn't be parsed */
  value: number | null
  /** Unit string as reported, e.g. "ft^3/s" */
  unit: string
  /** ISO-8601 timestamp of the reading (with timezone offset) */
  time: string
  /** "Provisional" (live, unreviewed) or "Approved" (QA'd) */
  approvalStatus: string
  /** Data qualifier code, when present */
  qualifier: string | null
}

/** Historical daily-flow percentiles for a single day-of-year, in cfs. */
export interface FlowPercentiles {
  p10: number | null
  p25: number | null
  p50: number | null
  p75: number | null
  p90: number | null
}

/** USGS WaterWatch flow categories, low → high. */
export type FlowCategory =
  | 'much-below-normal'
  | 'below-normal'
  | 'normal'
  | 'above-normal'
  | 'much-above-normal'

export interface FlowStatus {
  category: FlowCategory
  /** Human-readable label, e.g. "Below normal" */
  label: string
  /** Current discharge, cfs */
  dischargeCfs: number
  /** Historical median (p50) discharge for this day-of-year, cfs */
  medianCfs: number | null
  /** Current discharge as a percentage of the historical median */
  percentOfMedian: number | null
  /** The percentile bands the classification used */
  percentiles: FlowPercentiles
}

/** Everything the planner needs to judge a spot, per gage. */
export interface StreamConditions {
  gage: StreamGage
  discharge: StreamflowReading | null
  gageHeight: StreamflowReading | null
  /** Water temperature as reported (°C), or null */
  waterTempC: number | null
  /** Water temperature converted to °F (US fishing convention), or null */
  waterTempF: number | null
  /** Flow classification vs. historical norm; null if no baseline/flow */
  status: FlowStatus | null
  /** All raw readings for this gage */
  readings: StreamflowReading[]
}

export interface FindGagesOptions {
  /** Max gages to return (default 50) */
  limit?: number
  /**
   * Restrict to a USGS site type code. Defaults to "ST" (Stream) — the only
   * type relevant to a fly-fishing planner. Pass null to return all types.
   */
  siteTypeCode?: string | null
}

export interface LatestStreamflowOptions {
  /** Parameter codes to fetch (default: discharge + gage height + water temp) */
  parameterCodes?: string[]
  /** Max readings to return (default 300) */
  limit?: number
}

export interface StreamConditionsOptions {
  /** Max gages to evaluate (default 50) */
  maxGages?: number
}

interface RawFeature {
  id: string
  properties: Record<string, unknown>
  geometry?: { type: string; coordinates: [number, number] }
}

interface RawLink {
  rel: string
  href: string
}

interface RawFeatureCollection {
  features?: RawFeature[]
  links?: RawLink[]
}

function baseUrl() {
  return process.env.USGS_OGC_BASE_URL ?? DEFAULT_BASE_URL
}

function statsBaseUrl() {
  return process.env.USGS_STATS_BASE_URL ?? DEFAULT_STATS_BASE_URL
}

function bboxParam(bbox: BoundingBox): string {
  return `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`
}

/**
 * Fetch GeoJSON features from an OGC items URL, following `next` links so dense
 * regions aren't silently truncated. Stops at `maxResults` or `maxPages`.
 */
async function fetchFeatures(
  url: string,
  maxResults = Infinity,
  maxPages = 10
): Promise<RawFeature[]> {
  const out: RawFeature[] = []
  let next: string | undefined = url
  let page = 0
  while (next && page < maxPages && out.length < maxResults) {
    const data: RawFeatureCollection = await fetchJson(next, {
      headers: { Accept: 'application/geo+json' },
    })
    out.push(...(data.features ?? []))
    next = data.links?.find((l) => l.rel === 'next')?.href
    page++
  }
  return out.slice(0, maxResults === Infinity ? undefined : maxResults)
}

/**
 * Find monitoring gages within a bounding box. Defaults to stream sites only.
 * Returns an empty array when no gages fall inside the box. Note: this returns
 * gages by location regardless of whether they currently report data — use
 * `getStreamConditions` when you need only gages with live readings.
 */
export async function findStreamGages(
  bbox: BoundingBox,
  options: FindGagesOptions = {}
): Promise<StreamGage[]> {
  const siteType =
    options.siteTypeCode === undefined ? 'ST' : options.siteTypeCode
  const limit = options.limit ?? 50

  const params = new URLSearchParams({
    bbox: bboxParam(bbox),
    limit: String(limit),
    f: 'json',
  })
  if (siteType) params.set('site_type_code', siteType)

  const url = `${baseUrl()}/collections/monitoring-locations/items?${params.toString()}`
  const features = await fetchFeatures(url, limit)
  return features.map(normalizeGage)
}

/**
 * Fetch the latest continuous reading for the given parameters across every
 * gage in a bounding box — one request covers a whole region. Returns a flat
 * list of readings; use `groupReadingsByGage` to pivot per gage.
 */
export async function getLatestStreamflow(
  bbox: BoundingBox,
  options: LatestStreamflowOptions = {}
): Promise<StreamflowReading[]> {
  const codes = options.parameterCodes ?? DEFAULT_PARAMETERS
  const limit = options.limit ?? 300

  const params = new URLSearchParams({
    bbox: bboxParam(bbox),
    parameter_code: codes.join(','),
    limit: String(limit),
    f: 'json',
  })

  const url = `${baseUrl()}/collections/latest-continuous/items?${params.toString()}`
  const features = await fetchFeatures(url, limit)
  return features.map(normalizeReading)
}

/**
 * Fetch the latest continuous reading for specific gages by id (full OGC ids
 * like "USGS-06041000"). Useful once a gage of interest is already known.
 */
export async function getStreamflowForGages(
  gageIds: string[],
  options: LatestStreamflowOptions = {}
): Promise<StreamflowReading[]> {
  if (gageIds.length === 0) return []

  const codes = options.parameterCodes ?? DEFAULT_PARAMETERS
  const limit = options.limit ?? 300

  const params = new URLSearchParams({
    monitoring_location_id: gageIds.join(','),
    parameter_code: codes.join(','),
    limit: String(limit),
    f: 'json',
  })

  const url = `${baseUrl()}/collections/latest-continuous/items?${params.toString()}`
  const features = await fetchFeatures(url, limit)
  return features.map(normalizeReading)
}

/**
 * The planner-facing call. For a bounding box, returns one `StreamConditions`
 * per gage that currently reports data: live discharge / gage height / water
 * temperature, plus a flow-status classification against the historical norm.
 * Gages with no current readings are dropped (no point recommending a dead
 * gage), honoring "never recommend a spot without checking streamflow status."
 */
export async function getStreamConditions(
  bbox: BoundingBox,
  options: StreamConditionsOptions = {}
): Promise<StreamConditions[]> {
  const maxGages = options.maxGages ?? 50

  const [gages, readings] = await Promise.all([
    findStreamGages(bbox, { limit: maxGages }),
    getLatestStreamflow(bbox, { limit: maxGages * DEFAULT_PARAMETERS.length + 50 }),
  ])

  const byGage = groupReadingsByGage(readings)

  // Active-gage filter: keep only stream gages that actually reported readings.
  const active = gages.filter((g) => byGage.has(g.id))

  // Batch the percentile baseline for every active gage with a discharge value.
  const siteNumbers = active
    .filter((g) =>
      byGage.get(g.id)!.some(
        (r) => r.parameterCode === USGS_PARAMETERS.discharge && r.value != null
      )
    )
    .map((g) => g.siteNumber)

  // The percentile baseline is supplementary: if the stat service is slow or
  // down, still return live conditions (status falls back to null) rather than
  // failing the whole call and losing the real-time data.
  let percentilesBySite: Map<string, FlowPercentiles> = new Map()
  try {
    percentilesBySite = await getFlowPercentiles(siteNumbers)
  } catch {
    percentilesBySite = new Map()
  }

  return active.map((g) => {
    const rs = byGage.get(g.id) ?? []
    const discharge =
      rs.find((r) => r.parameterCode === USGS_PARAMETERS.discharge) ?? null
    const gageHeight =
      rs.find((r) => r.parameterCode === USGS_PARAMETERS.gageHeight) ?? null
    const temp =
      rs.find((r) => r.parameterCode === USGS_PARAMETERS.waterTemperature) ?? null

    const waterTempC = temp?.value ?? null
    const waterTempF = waterTempC != null ? celsiusToFahrenheit(waterTempC) : null

    const pct = percentilesBySite.get(g.siteNumber) ?? null
    const status =
      discharge?.value != null && pct ? classifyFlow(discharge.value, pct) : null

    return { gage: g, discharge, gageHeight, waterTempC, waterTempF, status, readings: rs }
  })
}

/**
 * Fetch historical daily discharge percentiles (for today's day-of-year) for
 * one or more gages from the USGS Statistics service. Keyed by bare NWIS site
 * number. Returns an empty map for an empty input.
 */
export async function getFlowPercentiles(
  siteNumbers: string[],
  date: Date = new Date()
): Promise<Map<string, FlowPercentiles>> {
  if (siteNumbers.length === 0) return new Map()

  const params = new URLSearchParams({
    format: 'rdb',
    sites: siteNumbers.join(','),
    statReportType: 'daily',
    statTypeCd: 'p10,p25,p50,p75,p90',
    parameterCd: USGS_PARAMETERS.discharge,
  })

  const url = `${statsBaseUrl()}/?${params.toString()}`
  const text = await fetchText(url)
  return parseStatRdb(text, date)
}

/** Pivot a flat reading list into a map keyed by gage id. */
export function groupReadingsByGage(
  readings: StreamflowReading[]
): Map<string, StreamflowReading[]> {
  const byGage = new Map<string, StreamflowReading[]>()
  for (const r of readings) {
    const list = byGage.get(r.gageId)
    if (list) list.push(r)
    else byGage.set(r.gageId, [r])
  }
  return byGage
}

const FLOW_LABELS: Record<FlowCategory, string> = {
  'much-below-normal': 'Much below normal',
  'below-normal': 'Below normal',
  normal: 'Normal',
  'above-normal': 'Above normal',
  'much-above-normal': 'Much above normal',
}

/**
 * Classify a current discharge against historical percentile bands, using the
 * USGS WaterWatch convention: <p10 much below, p10–p25 below, p25–p75 normal,
 * p75–p90 above, >p90 much above. Missing bands degrade gracefully toward
 * "normal".
 */
export function classifyFlow(
  dischargeCfs: number,
  p: FlowPercentiles
): FlowStatus {
  let category: FlowCategory = 'normal'
  if (p.p10 != null && dischargeCfs < p.p10) category = 'much-below-normal'
  else if (p.p25 != null && dischargeCfs < p.p25) category = 'below-normal'
  else if (p.p90 != null && dischargeCfs > p.p90) category = 'much-above-normal'
  else if (p.p75 != null && dischargeCfs > p.p75) category = 'above-normal'

  const percentOfMedian =
    p.p50 != null && p.p50 !== 0
      ? Math.round((dischargeCfs / p.p50) * 100)
      : null

  return {
    category,
    label: FLOW_LABELS[category],
    dischargeCfs,
    medianCfs: p.p50,
    percentOfMedian,
    percentiles: p,
  }
}

/** Convert °C to °F, rounded to one decimal. */
export function celsiusToFahrenheit(celsius: number): number {
  return Math.round(((celsius * 9) / 5 + 32) * 10) / 10
}

/**
 * Parse the USGS Statistics service RDB (tab-separated) response, returning the
 * percentiles for `date`'s month/day per site. Exported for unit testing.
 */
export function parseStatRdb(
  text: string,
  date: Date = new Date()
): Map<string, FlowPercentiles> {
  const month = date.getMonth() + 1
  const day = date.getDate()
  const out = new Map<string, FlowPercentiles>()

  // Drop comment (#) lines; the first two remaining rows are the column header
  // and the RDB format spec (e.g. "5s\t15s\t..."), then data rows follow.
  const lines = text.split(/\r?\n/).filter((l) => l && !l.startsWith('#'))
  if (lines.length < 3) return out

  const header = lines[0].split('\t')
  const col = (name: string) => header.indexOf(name)
  const iSite = col('site_no')
  const iMonth = col('month_nu')
  const iDay = col('day_nu')
  const iP10 = col('p10_va')
  const iP25 = col('p25_va')
  const iP50 = col('p50_va')
  const iP75 = col('p75_va')
  const iP90 = col('p90_va')
  if (iSite < 0 || iMonth < 0 || iDay < 0) return out

  for (const line of lines.slice(2)) {
    const c = line.split('\t')
    if (Number(c[iMonth]) !== month || Number(c[iDay]) !== day) continue
    const at = (i: number) => {
      // Empty cells (Number('') === 0) must read as null, not a flow of zero.
      const raw = i >= 0 ? c[i] : undefined
      if (raw === undefined || raw.trim() === '') return null
      const v = Number(raw)
      return Number.isFinite(v) ? v : null
    }
    out.set(c[iSite], {
      p10: at(iP10),
      p25: at(iP25),
      p50: at(iP50),
      p75: at(iP75),
      p90: at(iP90),
    })
  }
  return out
}

function normalizeGage(feature: RawFeature): StreamGage {
  const p = feature.properties
  const [longitude, latitude] = feature.geometry?.coordinates ?? [NaN, NaN]
  const id = String(feature.id ?? p.id ?? '')
  return {
    id,
    siteNumber: str(p.monitoring_location_number) ?? id.replace(/^USGS-/, ''),
    name: str(p.monitoring_location_name) ?? '',
    latitude,
    longitude,
    state: str(p.state_name),
    county: str(p.county_name),
    siteType: str(p.site_type),
    drainageAreaSqMi: numOrNull(p.drainage_area),
    altitudeFt: numOrNull(p.altitude),
  }
}

function normalizeReading(feature: RawFeature): StreamflowReading {
  const p = feature.properties
  const code = str(p.parameter_code) ?? ''
  return {
    gageId: str(p.monitoring_location_id) ?? '',
    parameterCode: code,
    parameterName: PARAMETER_NAMES[code] ?? code,
    value: numOrNull(p.value),
    unit: str(p.unit_of_measure) ?? '',
    time: str(p.time) ?? '',
    approvalStatus: str(p.approval_status) ?? '',
    qualifier: str(p.qualifier),
  }
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

/** USGS reports `value` as a string; parse to number, null if unparseable. */
function numOrNull(v: unknown): number | null {
  if (typeof v === 'number') return Number.isNaN(v) ? null : v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isNaN(n) ? null : n
  }
  return null
}
