/**
 * Geocoding wrapper around Open-Meteo's free Geocoding API.
 *
 * Converts user-entered region/place names ("Madison River, Montana") into
 * coordinates + admin metadata so downstream USGS and weather wrappers can
 * be invoked with concrete lat/lon. No API key required.
 */

const DEFAULT_BASE_URL = 'https://geocoding-api.open-meteo.com/v1'

export interface GeocodeResult {
  /** Human-readable place name as returned by the API */
  name: string
  latitude: number
  longitude: number
  /** ISO 3166-1 alpha-2 country code (e.g. "US") */
  country_code: string
  country: string
  /** State / first-level admin division (e.g. "Montana") */
  admin1: string | null
  /** County or second-level admin division (e.g. "Gallatin County") */
  admin2: string | null
  elevation_m: number | null
  /** Open-Meteo feature classification, e.g. "STM" (stream), "PPL" (populated place) */
  feature_code: string | null
  /** Geonames numeric ID — stable across queries */
  geonames_id: number
}

export interface GeocodeOptions {
  /** Max results to return (Open-Meteo caps at 100, default 5) */
  count?: number
  /** Restrict to a specific country (ISO 3166-1 alpha-2) */
  countryCode?: string
  /** Language for returned place names (default "en") */
  language?: string
}

interface RawGeocodeResult {
  id: number
  name: string
  latitude: number
  longitude: number
  elevation?: number
  feature_code?: string
  country_code?: string
  country?: string
  admin1?: string
  admin2?: string
}

interface RawGeocodeResponse {
  results?: RawGeocodeResult[]
}

function baseUrl() {
  return process.env.OPEN_METEO_GEOCODING_BASE_URL ?? DEFAULT_BASE_URL
}

/**
 * Search for places matching `query`. Returns an empty array on no matches.
 * Throws on network / 5xx failures so the agent can surface the issue.
 */
export async function geocode(
  query: string,
  options: GeocodeOptions = {}
): Promise<GeocodeResult[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const params = new URLSearchParams({
    name: trimmed,
    count: String(options.count ?? 5),
    language: options.language ?? 'en',
    format: 'json',
  })
  if (options.countryCode) params.set('countryCode', options.countryCode)

  const url = `${baseUrl()}/search?${params.toString()}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })

  if (!res.ok) {
    throw new Error(`Geocoding failed (${res.status}): ${await res.text()}`)
  }

  const data = (await res.json()) as RawGeocodeResponse
  if (!data.results) return []

  return data.results.map(normalize)
}

/**
 * Convenience: return the single best match for a query, or null if no result.
 * Useful when the agent has a confident place name and just needs coords.
 */
export async function geocodeOne(
  query: string,
  options: Omit<GeocodeOptions, 'count'> = {}
): Promise<GeocodeResult | null> {
  const results = await geocode(query, { ...options, count: 1 })
  return results[0] ?? null
}

function normalize(raw: RawGeocodeResult): GeocodeResult {
  return {
    name: raw.name,
    latitude: raw.latitude,
    longitude: raw.longitude,
    country_code: raw.country_code ?? '',
    country: raw.country ?? '',
    admin1: raw.admin1 ?? null,
    admin2: raw.admin2 ?? null,
    elevation_m: typeof raw.elevation === 'number' ? raw.elevation : null,
    feature_code: raw.feature_code ?? null,
    geonames_id: raw.id,
  }
}

/**
 * Build a USGS-compatible bounding box (west,south,east,north) centered on a
 * point. `radiusMiles` defaults to 25mi — a reasonable "find streams near
 * here" radius for trip planning.
 */
export function boundingBox(
  latitude: number,
  longitude: number,
  radiusMiles = 25
): { west: number; south: number; east: number; north: number } {
  const latDelta = radiusMiles / 69 // ~69 miles per degree latitude
  const lonDelta = radiusMiles / (69 * Math.cos((latitude * Math.PI) / 180))
  return {
    west: longitude - lonDelta,
    south: latitude - latDelta,
    east: longitude + lonDelta,
    north: latitude + latDelta,
  }
}
