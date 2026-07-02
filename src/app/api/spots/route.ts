/**
 * Spot Finder data endpoint.
 *
 * GET /api/spots?q=<place>&radius=<miles>   — geocode a place, or
 * GET /api/spots?lat=<n>&lon=<n>&radius=<miles> — use explicit coordinates.
 *
 * Every returned spot is a live USGS gage with current readings, so the
 * "never recommend a spot without checking current streamflow status"
 * non-negotiable holds by construction — a spot with no live data never
 * appears. Gear matching runs server-side against the authed user's profile
 * (resolved from auth.uid(), never from client input); mismatches come back
 * as explicit findings, never silently dropped.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchFullGearProfile } from '@/lib/supabase/gear'
import { boundingBox, geocode } from '@/lib/geo'
import { getStreamConditions } from '@/lib/usgs'
import { matchGearToSpot, type GearMatchReport } from '@/lib/gear/matching'
import { REGULATIONS_WARNING } from '@/lib/anthropic/prompt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export interface SpotResult {
  id: string
  siteNumber: string
  name: string
  latitude: number
  longitude: number
  state: string | null
  county: string | null
  dischargeCfs: number | null
  dischargeTime: string | null
  gageHeightFt: number | null
  waterTempF: number | null
  flowCategory: string | null
  flowLabel: string | null
  percentOfMedian: number | null
  match: GearMatchReport | null
}

export interface PlaceCandidate {
  name: string
  admin1: string | null
  latitude: number
  longitude: number
}

export interface SpotsResponse {
  place: { name: string; admin1: string | null } | null
  /**
   * Other geocode matches for the query. Open-Meteo ranks by population, so
   * the small fishing town the angler meant often is NOT the top result
   * ("Ennis" → Surprise, AZ) — the client offers these as one-click
   * corrections that re-search by coordinates.
   */
  candidates: PlaceCandidate[]
  center: { latitude: number; longitude: number }
  radiusMiles: number
  hasGearProfile: boolean
  regulationsWarning: string
  spots: SpotResult[]
}

function num(v: string | null): number | null {
  if (v == null || v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const params = new URL(request.url).searchParams
  const q = params.get('q')?.trim() ?? ''
  const radiusMiles = Math.min(100, Math.max(5, num(params.get('radius')) ?? 25))
  let latitude = num(params.get('lat'))
  let longitude = num(params.get('lon'))
  let place: SpotsResponse['place'] = null
  let candidates: PlaceCandidate[] = []

  try {
    if (latitude == null || longitude == null) {
      if (!q) {
        return NextResponse.json(
          { error: 'Provide a place (?q=) or coordinates (?lat=&lon=)' },
          { status: 400 }
        )
      }
      const results = await geocode(q, { count: 5, countryCode: 'US' })
      if (results.length === 0) {
        return NextResponse.json(
          { error: `Couldn't find "${q}" — try a nearby town name (e.g. "Ennis" rather than "Madison River, Montana").` },
          { status: 404 }
        )
      }
      const best = results[0]
      latitude = best.latitude
      longitude = best.longitude
      place = { name: best.name, admin1: best.admin1 }
      candidates = results.map((r) => ({
        name: r.name,
        admin1: r.admin1,
        latitude: r.latitude,
        longitude: r.longitude,
      }))
    }

    const bbox = boundingBox(latitude, longitude, radiusMiles)
    const [conditions, profile] = await Promise.all([
      getStreamConditions(bbox),
      fetchFullGearProfile(supabase, user.id),
    ])

    const month = new Date().getMonth() + 1
    const spots: SpotResult[] = conditions.map((c) => ({
      id: c.gage.id,
      siteNumber: c.gage.siteNumber,
      name: c.gage.name,
      latitude: c.gage.latitude,
      longitude: c.gage.longitude,
      state: c.gage.state,
      county: c.gage.county,
      dischargeCfs: c.discharge?.value ?? null,
      dischargeTime: c.discharge?.time ?? null,
      gageHeightFt: c.gageHeight?.value ?? null,
      waterTempF: c.waterTempF,
      flowCategory: c.status?.category ?? null,
      flowLabel: c.status?.label ?? null,
      percentOfMedian: c.status?.percentOfMedian ?? null,
      match: profile
        ? matchGearToSpot(profile, {
            flowCategory: c.status?.category ?? null,
            waterTempF: c.waterTempF,
            month,
            longitude: c.gage.longitude,
          })
        : null,
    }))

    const body: SpotsResponse = {
      place,
      candidates,
      center: { latitude, longitude },
      radiusMiles,
      hasGearProfile: profile != null,
      regulationsWarning: REGULATIONS_WARNING,
      spots,
    }
    return NextResponse.json(body)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Upstream data source failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
