'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Map, { Marker, NavigationControl, Popup, type MapRef } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { PlaceCandidate, SpotResult, SpotsResponse } from '@/app/api/spots/route'
import type { MatchFinding, MatchStatus } from '@/lib/gear/matching'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

const cx = {
  input:
    'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-600/50',
  label: 'block text-xs font-medium text-slate-400 mb-1',
  primaryBtn:
    'bg-green-700 hover:bg-green-600 disabled:bg-slate-700 disabled:text-slate-400 text-white text-sm px-5 py-2.5 rounded-lg transition-colors',
}

/** USGS WaterWatch color convention, low flow (red) → high flow (blue). */
const FLOW_COLORS: Record<string, string> = {
  'much-below-normal': '#ef4444',
  'below-normal': '#f97316',
  normal: '#22c55e',
  'above-normal': '#38bdf8',
  'much-above-normal': '#1d4ed8',
}
const NO_STATUS_COLOR = '#94a3b8'

const MATCH_BADGE: Record<'good' | 'partial' | 'mismatch', { label: string; cls: string }> = {
  good: { label: 'Gear match', cls: 'bg-green-950/60 border-green-800/60 text-green-300' },
  partial: { label: 'Partial match', cls: 'bg-amber-950/60 border-amber-800/60 text-amber-300' },
  mismatch: { label: 'Gear mismatch', cls: 'bg-red-950/60 border-red-900/60 text-red-300' },
}

const FINDING_ICON: Record<MatchStatus, string> = {
  good: '✓',
  partial: '△',
  mismatch: '✕',
  info: 'ℹ',
}
const FINDING_COLOR: Record<MatchStatus, string> = {
  good: 'text-green-400',
  partial: 'text-amber-300',
  mismatch: 'text-red-400',
  info: 'text-slate-400',
}

function flowColor(spot: SpotResult): string {
  return (spot.flowCategory && FLOW_COLORS[spot.flowCategory]) || NO_STATUS_COLOR
}

/** Marker ring = gear match verdict (fill stays the flow status). */
const MATCH_RING_COLORS: Record<'good' | 'partial' | 'mismatch', string> = {
  good: '#4ade80',
  partial: '#fbbf24',
  mismatch: '#f87171',
}
const NO_MATCH_RING = 'rgba(255,255,255,0.8)'

function matchRingColor(spot: SpotResult): string {
  return spot.match ? MATCH_RING_COLORS[spot.match.overall] : NO_MATCH_RING
}

function zoomForRadius(radiusMiles: number): number {
  return Math.max(6, Math.min(11, Math.round(13 - Math.log2(radiusMiles))))
}

export default function SpotsClient() {
  const [query, setQuery] = useState('')
  const [radius, setRadius] = useState(25)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<SpotsResponse | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const mapRef = useRef<MapRef>(null)

  const selected = data?.spots.find((s) => s.id === selectedId) ?? null

  useEffect(() => {
    if (!data) return
    mapRef.current?.flyTo({
      center: [data.center.longitude, data.center.latitude],
      zoom: zoomForRadius(data.radiusMiles),
      duration: 1200,
    })
  }, [data])

  /** Run a search; `placeOverride` labels coordinate searches (candidate picks). */
  async function runSearch(
    params: URLSearchParams,
    placeOverride?: { name: string; admin1: string | null }
  ) {
    if (loading) return
    setLoading(true)
    setError(null)
    setSelectedId(null)
    try {
      const res = await fetch(`/api/spots?${params.toString()}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`)
      const response = body as SpotsResponse
      // Candidate picks search by coordinates, so the response carries no
      // geocode info — keep the previous candidate list so the user can still
      // switch between the alternatives.
      setData((prev) =>
        placeOverride
          ? { ...response, place: placeOverride, candidates: prev?.candidates ?? [] }
          : response
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function search(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    runSearch(new URLSearchParams({ q: query.trim(), radius: String(radius) }))
  }

  /** Re-search at a specific geocode candidate ("no, I meant Ennis, Montana"). */
  function searchAt(c: PlaceCandidate) {
    runSearch(
      new URLSearchParams({
        lat: String(c.latitude),
        lon: String(c.longitude),
        radius: String(radius),
      }),
      { name: c.name, admin1: c.admin1 }
    )
  }

  return (
    <main className="flex-1 px-6 py-10 max-w-5xl mx-auto w-full">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Spot Finder</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Live USGS gages near you — flow status, water temp, and how your gear stacks up.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 text-sm transition-colors"
        >
          Back
        </Link>
      </header>

      <form onSubmit={search} className="mb-6 flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <label className={cx.label}>Where do you want to fish?</label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ennis   ·   Bozeman   ·   Roscoe"
            className={cx.input}
            required
          />
        </div>
        <div>
          <label className={cx.label}>Radius</label>
          <select value={radius} onChange={(e) => setRadius(Number(e.target.value))} className={cx.input}>
            <option value={10}>10 miles</option>
            <option value={25}>25 miles</option>
            <option value={50}>50 miles</option>
          </select>
        </div>
        <div className="flex items-end">
          <button type="submit" disabled={loading || !query.trim()} className={cx.primaryBtn}>
            {loading ? 'Searching…' : 'Find spots'}
          </button>
        </div>
      </form>

      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-950/40 border border-red-900/50 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Geocode disambiguation: Open-Meteo ranks by population, so the small
          fishing town the angler meant is often not the top match. */}
      {data && data.candidates.length > 1 && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-700 text-sm">
          <span className="text-slate-400 mr-2">
            Showing{' '}
            <span className="text-slate-200">
              {data.place ? `${data.place.name}${data.place.admin1 ? `, ${data.place.admin1}` : ''}` : 'results'}
            </span>
            . Not the right place?
          </span>
          <span className="inline-flex flex-wrap gap-2 align-middle">
            {data.candidates
              .filter((c) => !(c.name === data.place?.name && c.admin1 === data.place?.admin1))
              .map((c) => (
                <button
                  key={`${c.name}|${c.admin1}|${c.latitude}`}
                  type="button"
                  disabled={loading}
                  onClick={() => searchAt(c)}
                  className="px-2.5 py-0.5 rounded-full border border-slate-600 text-slate-300 hover:text-white hover:border-green-600 text-xs transition-colors disabled:opacity-50"
                >
                  {c.name}
                  {c.admin1 ? `, ${c.admin1}` : ''}
                </button>
              ))}
          </span>
        </div>
      )}

      {data && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-amber-950/40 border border-amber-800/50 text-amber-200 text-sm flex gap-2">
          <span aria-hidden>⚠</span>
          <span>{data.regulationsWarning}</span>
        </div>
      )}

      {data && !data.hasGearProfile && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-700 text-slate-300 text-sm">
          No gear profile found — set up your{' '}
          <Link href="/gear" className="text-green-400 hover:underline">
            Gear Locker
          </Link>{' '}
          to see gear-match indicators on each spot.
        </div>
      )}

      {/* Map */}
      <div className="rounded-xl border border-slate-800 overflow-hidden mb-6" style={{ height: 480 }}>
        {MAPBOX_TOKEN ? (
          <Map
            ref={mapRef}
            mapboxAccessToken={MAPBOX_TOKEN}
            initialViewState={{ longitude: -110, latitude: 44.5, zoom: 5 }}
            style={{ width: '100%', height: '100%' }}
            mapStyle="mapbox://styles/mapbox/outdoors-v12"
          >
            <NavigationControl position="top-right" />
            {data?.spots.map((spot) => (
              <Marker
                key={spot.id}
                longitude={spot.longitude}
                latitude={spot.latitude}
                anchor="center"
                onClick={(e) => {
                  e.originalEvent.stopPropagation()
                  setSelectedId(spot.id)
                }}
              >
                <button
                  type="button"
                  title={spot.name}
                  aria-label={spot.name}
                  className="block w-4 h-4 rounded-full border-2 shadow cursor-pointer"
                  style={{
                    backgroundColor: flowColor(spot),
                    borderColor: matchRingColor(spot),
                  }}
                />
              </Marker>
            ))}
            {selected && (
              <Popup
                longitude={selected.longitude}
                latitude={selected.latitude}
                anchor="bottom"
                offset={12}
                onClose={() => setSelectedId(null)}
                closeOnClick={false}
                maxWidth="340px"
              >
                <SpotDetails spot={selected} compact />
              </Popup>
            )}
          </Map>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-slate-900/60 text-slate-400 text-sm px-8 text-center">
            Add NEXT_PUBLIC_MAPBOX_TOKEN to .env.local to enable the map. Spot results still
            appear in the list below.
          </div>
        )}
      </div>

      {/* Legend */}
      {data && data.spots.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
          {Object.entries(FLOW_COLORS).map(([cat, color]) => (
            <span key={cat} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: color }} />
              {cat.replace(/-/g, ' ')}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full inline-block"
              style={{ backgroundColor: NO_STATUS_COLOR }}
            />
            no baseline
          </span>
          <span className="basis-full sm:basis-auto sm:border-l sm:border-slate-700 sm:pl-4 flex items-center gap-3">
            <span className="text-slate-500">marker ring = gear match:</span>
            {(Object.entries(MATCH_RING_COLORS) as ['good' | 'partial' | 'mismatch', string][]).map(
              ([verdict, color]) => (
                <span key={verdict} className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block bg-transparent border-2"
                    style={{ borderColor: color }}
                  />
                  {verdict}
                </span>
              )
            )}
          </span>
        </div>
      )}

      {/* Results list */}
      {data && data.spots.length === 0 && (
        <div className="px-4 py-6 rounded-xl border border-slate-800 bg-slate-900/60 text-slate-400 text-sm">
          No gages with live readings within {data.radiusMiles} miles
          {data.place ? ` of ${data.place.name}` : ''}. Try a larger radius or a different area.
        </div>
      )}

      {data && data.spots.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
            {data.spots.length} spot{data.spots.length === 1 ? '' : 's'} with live data
            {data.place ? ` near ${data.place.name}${data.place.admin1 ? `, ${data.place.admin1}` : ''}` : ''}
          </h2>
          <ul className="space-y-3">
            {data.spots.map((spot) => (
              <li
                key={spot.id}
                className={`rounded-xl border bg-slate-900/60 px-5 py-4 transition-colors ${
                  selectedId === spot.id ? 'border-green-700' : 'border-slate-800'
                }`}
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => {
                    setSelectedId(spot.id)
                    mapRef.current?.flyTo({
                      center: [spot.longitude, spot.latitude],
                      zoom: 11,
                      duration: 900,
                    })
                  }}
                >
                  <SpotDetails spot={spot} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}

function SpotDetails({ spot, compact }: { spot: SpotResult; compact?: boolean }) {
  // Popup renders on the map's white background; the list on the dark page.
  const heading = compact ? 'text-slate-900' : 'text-white'
  const body = compact ? 'text-slate-600' : 'text-slate-400'

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={`text-sm font-semibold ${heading}`}>{spot.name}</div>
          <div className={`text-xs ${body}`}>
            {[spot.county, spot.state].filter(Boolean).join(', ')} · USGS {spot.siteNumber}
          </div>
        </div>
        {spot.match && <MatchBadge overall={spot.match.overall} />}
      </div>

      <div className={`mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs ${body}`}>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: flowColor(spot) }} />
          {spot.flowLabel ?? 'No flow baseline'}
        </span>
        {spot.dischargeCfs != null && (
          <span>
            {spot.dischargeCfs.toLocaleString()} cfs
            {spot.percentOfMedian != null && ` (${spot.percentOfMedian}% of median)`}
          </span>
        )}
        {spot.waterTempF != null && <span>{spot.waterTempF}°F water</span>}
        {spot.gageHeightFt != null && <span>{spot.gageHeightFt} ft stage</span>}
      </div>

      {spot.match && !compact && <FindingsList findings={spot.match.findings} />}
      {spot.match && compact && (
        <FindingsList
          findings={spot.match.findings.filter((f) => f.status !== 'good')}
          compact
        />
      )}
    </div>
  )
}

function MatchBadge({ overall }: { overall: 'good' | 'partial' | 'mismatch' }) {
  const b = MATCH_BADGE[overall]
  return (
    <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full border ${b.cls}`}>
      {b.label}
    </span>
  )
}

function FindingsList({ findings, compact }: { findings: MatchFinding[]; compact?: boolean }) {
  if (findings.length === 0) return null
  return (
    <ul className={`mt-2.5 space-y-1 ${compact ? '' : 'border-t border-slate-800 pt-2.5'}`}>
      {findings.map((f, i) => (
        <li key={i} className={`text-xs flex gap-1.5 ${compact ? 'text-slate-600' : 'text-slate-300'}`}>
          <span className={`shrink-0 ${FINDING_COLOR[f.status]}`} aria-hidden>
            {FINDING_ICON[f.status]}
          </span>
          <span>{f.summary}</span>
        </li>
      ))}
    </ul>
  )
}
