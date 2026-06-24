/**
 * USGS streamflow wrapper around the USGS Water Data OGC API.
 *
 * Base: https://api.waterdata.usgs.gov/ogcapi/v0 — GeoJSON FeatureCollections,
 * no API key required. Two collections are used:
 *
 *   - `monitoring-locations` — gage metadata, searchable by bounding box. Feed
 *     it the geo wrapper's `boundingBox()` output to discover gages near a spot.
 *   - `latest-continuous`    — the most recent continuous (instantaneous)
 *     reading per gage/parameter. Accepts a bbox too, so we can pull current
 *     conditions for every gage in a region in a single request.
 *
 * Supports the non-negotiable: "Never recommend a spot without checking current
 * streamflow status." `approvalStatus` is surfaced so callers can tell live
 * provisional data from QA'd approved data.
 */

const DEFAULT_BASE_URL = 'https://api.waterdata.usgs.gov/ogcapi/v0'

/** USGS NWIS parameter codes relevant to trout fishing. */
export const USGS_PARAMETERS = {
  /** Discharge / streamflow, cubic feet per second */
  discharge: '00060',
  /** Gage height (stage), feet */
  gageHeight: '00065',
  /** Water temperature, degrees Celsius */
  waterTemperature: '00010',
} as const

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
  /** Parameter codes to fetch (default: discharge + gage height) */
  parameterCodes?: string[]
  /** Max readings to return (default 200) */
  limit?: number
}

interface RawFeature {
  id: string
  properties: Record<string, unknown>
  geometry?: { type: string; coordinates: [number, number] }
}

interface RawFeatureCollection {
  features?: RawFeature[]
}

function baseUrl() {
  return process.env.USGS_OGC_BASE_URL ?? DEFAULT_BASE_URL
}

function bboxParam(bbox: BoundingBox): string {
  return `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`
}

async function fetchFeatures(url: string): Promise<RawFeature[]> {
  const res = await fetch(url, { headers: { Accept: 'application/geo+json' } })
  if (!res.ok) {
    throw new Error(`USGS request failed (${res.status}): ${await res.text()}`)
  }
  const data = (await res.json()) as RawFeatureCollection
  return data.features ?? []
}

/**
 * Find monitoring gages within a bounding box. Defaults to stream sites only.
 * Returns an empty array when no gages fall inside the box.
 */
export async function findStreamGages(
  bbox: BoundingBox,
  options: FindGagesOptions = {}
): Promise<StreamGage[]> {
  const siteType =
    options.siteTypeCode === undefined ? 'ST' : options.siteTypeCode

  const params = new URLSearchParams({
    bbox: bboxParam(bbox),
    limit: String(options.limit ?? 50),
    f: 'json',
  })
  if (siteType) params.set('site_type_code', siteType)

  const url = `${baseUrl()}/collections/monitoring-locations/items?${params.toString()}`
  const features = await fetchFeatures(url)
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
  const codes = options.parameterCodes ?? [
    USGS_PARAMETERS.discharge,
    USGS_PARAMETERS.gageHeight,
  ]

  const params = new URLSearchParams({
    bbox: bboxParam(bbox),
    parameter_code: codes.join(','),
    limit: String(options.limit ?? 200),
    f: 'json',
  })

  const url = `${baseUrl()}/collections/latest-continuous/items?${params.toString()}`
  const features = await fetchFeatures(url)
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

  const codes = options.parameterCodes ?? [
    USGS_PARAMETERS.discharge,
    USGS_PARAMETERS.gageHeight,
  ]

  const params = new URLSearchParams({
    monitoring_location_id: gageIds.join(','),
    parameter_code: codes.join(','),
    limit: String(options.limit ?? 200),
    f: 'json',
  })

  const url = `${baseUrl()}/collections/latest-continuous/items?${params.toString()}`
  const features = await fetchFeatures(url)
  return features.map(normalizeReading)
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
