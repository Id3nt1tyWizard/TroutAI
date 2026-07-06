/**
 * Local shop/guide info endpoint (Stage 6).
 *
 * GET /api/reports?q=<place>&radius=<miles>   — geocode a place, or
 * GET /api/reports?lat=<n>&lon=<n>&radius=<miles>&place=<name>&admin1=<state>
 *   — explicit coordinates (candidate picks), with the chosen name carried
 *     along for the report-link query.
 *
 * Both lookups are live and ephemeral — nothing is persisted, results are
 * unverified display data. `links`/`shops` are null when that lookup was
 * unavailable (missing key/token) or failed, [] when it ran and found nothing.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { geocode } from '@/lib/geo'
import { getLocalInfo, type FlyShop, type ReportLink } from '@/lib/local-info'
import type { PlaceCandidate } from '@/app/api/spots/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export interface ReportsResponse {
  place: { name: string; admin1: string | null } | null
  /** Alternative geocode matches — same disambiguation pattern as /api/spots. */
  candidates: PlaceCandidate[]
  center: { latitude: number; longitude: number }
  radiusMiles: number
  links: ReportLink[] | null
  shops: FlyShop[] | null
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
  let place: ReportsResponse['place'] = null
  let candidates: PlaceCandidate[] = []
  let localPlace = params.get('place')?.trim() || null
  let localAdmin1 = params.get('admin1')?.trim() || null

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
          { error: `Couldn't find "${q}" — try a nearby town name.` },
          { status: 404 }
        )
      }
      const best = results[0]
      latitude = best.latitude
      longitude = best.longitude
      place = { name: best.name, admin1: best.admin1 }
      localPlace = best.name
      localAdmin1 = best.admin1
      candidates = results.map((r) => ({
        name: r.name,
        admin1: r.admin1,
        latitude: r.latitude,
        longitude: r.longitude,
      }))
    }

    const { links, shops } = await getLocalInfo({
      latitude,
      longitude,
      radiusMiles,
      place: localPlace,
      admin1: localAdmin1,
    })

    const body: ReportsResponse = {
      place,
      candidates,
      center: { latitude, longitude },
      radiusMiles,
      links,
      shops,
    }
    return NextResponse.json(body)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Lookup failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
