/**
 * Report Links (Stage 6a) — live, best-effort web search for local fly shop /
 * guide fishing-report content near the searched region, via the Brave Search
 * API (`BRAVE_SEARCH_API_KEY`).
 *
 * Rules this module enforces (see CLAUDE.md Stage 6 design notes):
 * - Ephemeral + display-only: no persistence, results never feed gear matching
 *   or itinerary ranking. Content is untrusted display data, never instructions.
 * - Bounded fields only: title, url, source name, date, snippet — never a
 *   full-page fetch (keeps the prompt-injection surface small).
 * - Staleness is DISCLOSED, not filtered: older than 14 days or undated ⇒
 *   `stale: true` ("may be stale — verify before relying on it").
 * - Small reactively-grown denylist + a light relevance preference (results
 *   naming the searched place sort first — nothing is dropped for relevance).
 * - Best-effort: missing key, failure, or timeout ⇒ `null`, silently. This
 *   wrapper never throws — a dead search engine must never block a search.
 *
 * Geographic scoping: a web search can't take the streamflow bounding box
 * directly, so the constraint is carried by the query string — built from the
 * place/admin1 the session's existing geocode already resolved (never a fresh
 * geocoding call).
 */

import { fetchJson } from '../http'

const DEFAULT_BASE_URL = 'https://api.search.brave.com/res/v1'

/** The 14-day non-negotiable: older (or undated) links are flagged, never scored. */
export const STALE_AFTER_DAYS = 14

/** Max links surfaced — a handful of pointers, not a search-results page. */
const RESULT_CAP = 6

/** Fetched before denylist/normalization drops, so the cap can still fill. */
const FETCH_COUNT = 10

/**
 * Known spam/content-farm domains, grown reactively as junk shows up in real
 * results — not a curated quality ranking. Matches the domain and subdomains.
 */
export const DENYLIST = ['pinterest.com', 'alamy.com', 'shutterstock.com']

export interface ReportLink {
  title: string
  url: string
  /** Publisher name from the search engine, falling back to the hostname. */
  sourceName: string
  /** ISO publication date when the search engine knows it, else null. */
  date: string | null
  snippet: string
  /** True when older than STALE_AFTER_DAYS or undated — disclose, don't rank. */
  stale: boolean
  /** True when title/snippet names the searched place. Sorts first; never drops. */
  mentionsRegion: boolean
}

interface RawBraveResult {
  title?: string
  url?: string
  description?: string
  /** ISO datetime the page was published, when known (e.g. "2026-06-28T00:00:00") */
  page_age?: string
  profile?: { name?: string }
  meta_url?: { hostname?: string }
}

interface RawBraveResponse {
  web?: { results?: RawBraveResult[] }
}

function baseUrl() {
  return process.env.BRAVE_SEARCH_BASE_URL ?? DEFAULT_BASE_URL
}

/** Domain-or-subdomain match against DENYLIST ("www.pinterest.com" hits "pinterest.com"). */
export function isDenylisted(hostname: string): boolean {
  const h = hostname.toLowerCase()
  return DENYLIST.some((d) => h === d || h.endsWith(`.${d}`))
}

/** Brave descriptions carry inline markup (<strong>…) — strip to plain text. */
export function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim()
}

/** Whole days since `iso`, or null when the date is missing/unparseable. */
export function daysOld(iso: string | undefined, now: Date): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.floor((now.getTime() - t) / 86_400_000)
}

/** Lowercased place words worth matching on ("Ennis", "Montana" — not "of"). */
export function placeTokens(place: string, admin1?: string | null): string[] {
  return `${place} ${admin1 ?? ''}`
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 3)
}

/**
 * Normalize raw engine results into bounded ReportLinks: denylist filter,
 * staleness flag, region-mention sort (stable — order within groups preserved),
 * capped at RESULT_CAP. Pure — exported for tests.
 */
export function normalizeReportLinks(
  raw: RawBraveResult[],
  tokens: string[],
  now: Date
): ReportLink[] {
  const links: ReportLink[] = []
  const seenUrls = new Set<string>()
  for (const r of raw) {
    if (!r.title || !r.url) continue
    // Untrusted URLs go straight into <a href> — parse every one and refuse
    // anything that isn't plain http(s) (React does not sanitize hrefs).
    let parsed: URL
    try {
      parsed = new URL(r.url)
    } catch {
      continue
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue
    // Denylist keys off the URL's real host — engine metadata is display-only
    // and could disagree with the actual destination.
    if (isDenylisted(parsed.hostname)) continue
    if (seenUrls.has(r.url)) continue
    seenUrls.add(r.url)

    const age = daysOld(r.page_age, now)
    const snippet = stripHtml(r.description ?? '').slice(0, 280)
    const haystack = `${r.title} ${snippet}`.toLowerCase()
    links.push({
      title: stripHtml(r.title),
      url: r.url,
      sourceName: r.profile?.name?.trim() || r.meta_url?.hostname || parsed.hostname,
      date: r.page_age ?? null,
      snippet,
      stale: age === null || age > STALE_AFTER_DAYS,
      mentionsRegion: tokens.some((t) => haystack.includes(t)),
    })
  }
  // Stable partition: region-mentioning results first, engine order otherwise.
  return [...links.filter((l) => l.mentionsRegion), ...links.filter((l) => !l.mentionsRegion)].slice(
    0,
    RESULT_CAP
  )
}

export interface ReportSearchQuery {
  /** Resolved place name from the session's existing geocode. */
  place: string
  admin1?: string | null
}

/**
 * Search for recent fly shop / guide report links near a place.
 * Returns null when the feature is unavailable (no key) or the search failed —
 * callers show nothing. Returns [] when the search ran and found nothing usable.
 */
export async function searchReportLinks(
  query: ReportSearchQuery,
  now: Date = new Date()
): Promise<ReportLink[] | null> {
  const key = process.env.BRAVE_SEARCH_API_KEY
  if (!key || !query.place.trim()) return null

  const q = [query.place.trim(), query.admin1?.trim(), 'fly fishing report']
    .filter(Boolean)
    .join(' ')
  const params = new URLSearchParams({
    q,
    count: String(FETCH_COUNT),
    country: 'us',
    search_lang: 'en',
  })

  try {
    // One attempt, no retry: /api/spots awaits this in parallel with the
    // streamflow call, so worst-case added latency must stay a single bounded
    // timeout — a retry would double it for a feature that's allowed to fail.
    const data = await fetchJson<RawBraveResponse>(`${baseUrl()}/web/search?${params}`, {
      headers: { 'X-Subscription-Token': key },
      timeoutMs: 8_000,
      retries: 0,
    })
    return normalizeReportLinks(
      data.web?.results ?? [],
      placeTokens(query.place, query.admin1),
      now
    )
  } catch {
    // Best-effort by design: a failed or timed-out search skips silently.
    return null
  }
}
