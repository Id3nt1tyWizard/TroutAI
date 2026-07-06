/**
 * Nearby Fly Shops (Stage 6b) — a plain physical-shop directory near the
 * searched location, via the Mapbox Search Box forward (text) search. Reuses
 * the existing Mapbox integration: same `NEXT_PUBLIC_MAPBOX_TOKEN` the Spot
 * Finder map already requires — no new provider or key.
 *
 * Structured POI metadata from a maps API, not scraped web content — so unlike
 * the report links (6a) there is no prompt-injection surface and no staleness
 * disclosure to make. Same best-effort convention though: missing token,
 * failure, or timeout ⇒ `null`, silently; this wrapper never throws.
 *
 * No persistence — ephemeral display data like everything else in Stage 6.
 */

import { fetchJson } from '../http'

const DEFAULT_BASE_URL = 'https://api.mapbox.com/search/searchbox/v1'

/** A directory, not a phone book — the nearest handful is what's useful. */
const POI_LIMIT = 10

export interface FlyShop {
  name: string
  address: string | null
  latitude: number
  longitude: number
  /** Straight-line miles from the search center, rounded to 0.1. */
  distanceMiles: number
  phone: string | null
  website: string | null
}

interface RawSearchBoxFeature {
  geometry?: { coordinates?: [number, number] }
  properties?: {
    name?: string
    full_address?: string
    place_formatted?: string
    coordinates?: { longitude?: number; latitude?: number }
    metadata?: { phone?: string; website?: string }
  }
}

interface RawSearchBoxResponse {
  features?: RawSearchBoxFeature[]
}

function baseUrl() {
  return process.env.MAPBOX_SEARCH_BASE_URL ?? DEFAULT_BASE_URL
}

/** Great-circle distance in miles. Pure — exported for tests. */
export function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Normalize raw POI features into FlyShops within `radiusMiles` of the center,
 * nearest first. Pure — exported for tests. Features without a name or usable
 * coordinates are dropped; GeoJSON geometry is the [lon, lat] fallback when the
 * properties-level coordinates are absent.
 */
export function normalizeShops(
  features: RawSearchBoxFeature[],
  centerLat: number,
  centerLon: number,
  radiusMiles: number
): FlyShop[] {
  const shops: FlyShop[] = []
  for (const f of features) {
    const p = f.properties
    if (!p?.name) continue
    const latitude = p.coordinates?.latitude ?? f.geometry?.coordinates?.[1]
    const longitude = p.coordinates?.longitude ?? f.geometry?.coordinates?.[0]
    if (typeof latitude !== 'number' || typeof longitude !== 'number') continue

    const distance = haversineMiles(centerLat, centerLon, latitude, longitude)
    if (distance > radiusMiles) continue

    // POI metadata is external data headed for an <a href> — http(s) only.
    const website = p.metadata?.website
    shops.push({
      name: p.name,
      address: p.full_address ?? p.place_formatted ?? null,
      latitude,
      longitude,
      distanceMiles: Math.round(distance * 10) / 10,
      phone: p.metadata?.phone ?? null,
      website: website && /^https?:\/\//i.test(website) ? website : null,
    })
  }
  shops.sort((a, b) => a.distanceMiles - b.distanceMiles)
  // Mapbox can return the same shop as two POI records (seen live: identical
  // name, different mapbox_ids, coordinates meters apart) — keep the nearest.
  const seenNames = new Set<string>()
  return shops.filter((s) => {
    const key = s.name.trim().toLowerCase()
    if (seenNames.has(key)) return false
    seenNames.add(key)
    return true
  })
}

/**
 * Find fly shops near a point. Returns null when the feature is unavailable
 * (no Mapbox token) or the query failed — callers show nothing. Returns []
 * when the query ran and no shops sit within the radius.
 *
 * Uses the CATEGORY endpoint, not forward text search: text search ranks by
 * text relevance and returned "fly fishing shop" hits hundreds of miles away
 * (and abroad) while proximity only biased — the category browse is
 * proximity-driven and returned exactly the local shops (verified live near
 * Ennis, MT). `fishing_store` is the closest canonical Search Box category;
 * there is no fly-specific one, but in trout country the overlap is total.
 */
export async function findNearbyFlyShops(
  latitude: number,
  longitude: number,
  radiusMiles = 25
): Promise<FlyShop[] | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (!token) return null

  const params = new URLSearchParams({
    proximity: `${longitude},${latitude}`,
    limit: String(POI_LIMIT),
    access_token: token,
  })

  try {
    // One attempt, no retry — same reasoning as the report search: the spot
    // search awaits this, so the worst case must stay one bounded timeout.
    const data = await fetchJson<RawSearchBoxResponse>(
      `${baseUrl()}/category/fishing_store?${params}`,
      { timeoutMs: 8_000, retries: 0 }
    )
    return normalizeShops(data.features ?? [], latitude, longitude, radiusMiles)
  } catch {
    // Best-effort by design: a failed POI query shows nothing, blocks nothing.
    return null
  }
}
