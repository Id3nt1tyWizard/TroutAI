/**
 * Stage 6 aggregator: one call that fans out to the report-link search (6a)
 * and the nearby-fly-shop POI query (6b) in parallel. Both wrappers are
 * best-effort and never throw, so neither can this — a `null` field means that
 * lookup was unavailable or failed (show nothing), `[]` means it ran and found
 * nothing. Callers (Spot Finder route, planner agent, /reports route) reuse
 * the coordinates + place name their session already resolved — never a fresh
 * geocoding call.
 */

import { searchReportLinks, type ReportLink } from './reports'
import { findNearbyFlyShops, type FlyShop } from './shops'

export type { ReportLink } from './reports'
export type { FlyShop } from './shops'

export interface LocalInfoQuery {
  latitude: number
  longitude: number
  radiusMiles: number
  /** Resolved place name — required for the report search, which scopes by name. */
  place: string | null
  admin1: string | null
}

export interface LocalInfo {
  links: ReportLink[] | null
  shops: FlyShop[] | null
}

export async function getLocalInfo(q: LocalInfoQuery): Promise<LocalInfo> {
  const [links, shops] = await Promise.all([
    q.place
      ? searchReportLinks({ place: q.place, admin1: q.admin1 })
      : Promise.resolve<ReportLink[] | null>(null),
    findNearbyFlyShops(q.latitude, q.longitude, q.radiusMiles),
  ])
  return { links, shops }
}
