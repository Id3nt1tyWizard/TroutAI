'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ReportsResponse } from '@/app/api/reports/route'
import type { PlaceCandidate } from '@/app/api/spots/route'
import LocalInfoPanel from '@/components/LocalInfoPanel'

const cx = {
  input:
    'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-600/50',
  label: 'block text-xs font-medium text-slate-400 mb-1',
  primaryBtn:
    'bg-green-700 hover:bg-green-600 disabled:bg-slate-700 disabled:text-slate-400 text-white text-sm px-5 py-2.5 rounded-lg transition-colors',
}

export default function ReportsClient() {
  const [query, setQuery] = useState('')
  const [radius, setRadius] = useState(25)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ReportsResponse | null>(null)

  async function runSearch(
    params: URLSearchParams,
    placeOverride?: { name: string; admin1: string | null }
  ) {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/reports?${params.toString()}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`)
      const response = body as ReportsResponse
      // Candidate picks search by coordinates — keep the previous candidate
      // list so the user can keep switching (same pattern as the Spot Finder).
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

  function searchAt(c: PlaceCandidate) {
    const params = new URLSearchParams({
      lat: String(c.latitude),
      lon: String(c.longitude),
      radius: String(radius),
      place: c.name,
    })
    if (c.admin1) params.set('admin1', c.admin1)
    runSearch(params, { name: c.name, admin1: c.admin1 })
  }

  const nothingFound =
    data != null &&
    (data.links == null || data.links.length === 0) &&
    (data.shops == null || data.shops.length === 0)

  return (
    <main className="flex-1 px-6 py-10 max-w-3xl mx-auto w-full">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Shops &amp; Reports</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Nearby fly shops, plus a live search for local shop and guide reports.
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
          <label className={cx.label}>Where are you fishing?</label>
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
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
      </form>

      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-950/40 border border-red-900/50 text-red-300 text-sm">
          {error}
        </div>
      )}

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

      {data && <LocalInfoPanel links={data.links} shops={data.shops} />}

      {nothingFound && (
        <div className="px-4 py-6 rounded-xl border border-slate-800 bg-slate-900/60 text-slate-400 text-sm space-y-1">
          {data.links == null ? (
            <p>Report search is unavailable right now (not configured or the search failed).</p>
          ) : (
            <p>No recent shop or guide reports turned up for this area.</p>
          )}
          {data.shops == null ? (
            <p>Fly shop lookup is unavailable right now.</p>
          ) : (
            data.shops.length === 0 && (
              <p>No fly shops found within {data.radiusMiles} miles. Try a larger radius.</p>
            )
          )}
        </div>
      )}
    </main>
  )
}
