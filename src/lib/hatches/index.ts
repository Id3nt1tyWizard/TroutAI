/**
 * Curated trout-stream hatch calendar.
 *
 * There is no free real-time hatch API, so this is a typed, month-keyed dataset
 * of the major North American trout hatches with a coarse West/East split. Month
 * windows and patterns were assembled from published regional hatch charts
 * (Montana/Colorado/Idaho/Oregon and Pennsylvania/New York/Catskills guides,
 * 2026). Timing shifts with elevation, latitude, flows, and weather — this is
 * planning guidance, not a live report. Replace `getHatches` internals with a
 * live feed later without changing the tool surface.
 *
 * Region split uses the ~100th meridian (longitude ≤ -100 → "west"), the
 * conventional divide between Western and Eastern hatch regimes.
 */

export type HatchRegion = 'west' | 'east' | 'both'

export interface Hatch {
  name: string
  scientific?: string
  /** Months (1–12) the hatch is typically active. */
  months: number[]
  region: HatchRegion
  /** Typical hook size range. */
  sizes: string
  /** Suggested patterns. */
  flies: string[]
  /** Best time of day / conditions. */
  timing: string
}

/** The hatch table. Ordered roughly by first appearance through the year. */
export const HATCHES: Hatch[] = [
  {
    name: 'Midges',
    scientific: 'Chironomidae',
    months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    region: 'both',
    sizes: '#18–24',
    flies: ["Griffith's Gnat", 'Zebra Midge', 'Disco Midge', 'Midge Cluster'],
    timing: 'Year-round; often the only game in winter. Best midday on cold, calm days.',
  },
  {
    name: 'Blue-Winged Olive',
    scientific: 'Baetis',
    months: [3, 4, 5, 9, 10, 11],
    region: 'both',
    sizes: '#16–22',
    flies: ['BWO Parachute', 'RS2', 'Pheasant Tail', 'Sparkle Dun'],
    timing: 'Cool, overcast afternoons in spring and fall — the worse the weather, the better.',
  },
  {
    name: 'Skwala Stonefly',
    scientific: 'Skwala',
    months: [2, 3, 4],
    region: 'west',
    sizes: '#8–12',
    flies: ['Skwala Dry', "Pat's Rubber Legs", 'Stimulator (olive)'],
    timing: 'Early-season stonefly on warm late-winter/spring afternoons (e.g. Bitterroot).',
  },
  {
    name: 'Quill Gordon',
    scientific: 'Epeorus pleuralis',
    months: [4],
    region: 'east',
    sizes: '#12–14',
    flies: ['Quill Gordon', 'Pheasant Tail'],
    timing: 'Often the first Eastern dry-fly hatch; early-April midday.',
  },
  {
    name: 'Hendrickson',
    scientific: 'Ephemerella subvaria',
    months: [4, 5],
    region: 'east',
    sizes: '#12–14',
    flies: ['Hendrickson', 'Red Quill', 'Pheasant Tail'],
    timing: 'First major Eastern mayfly; warm spring afternoons.',
  },
  {
    name: 'March Brown',
    scientific: 'Rhithrogena / Maccaffertium',
    months: [3, 4, 5],
    region: 'both',
    sizes: '#12–14',
    flies: ['March Brown', "Hare's Ear", 'Parachute Adams'],
    timing: 'Sporadic midday spring hatch, West and East.',
  },
  {
    name: "Mother's Day Caddis",
    scientific: 'Brachycentrus (Grannom)',
    months: [4, 5],
    region: 'west',
    sizes: '#14–16',
    flies: ['Elk Hair Caddis', 'X-Caddis', 'Sparkle Pupa'],
    timing: 'Blizzard caddis in late April–May; can coincide with (and get blown out by) runoff.',
  },
  {
    name: 'Caddis',
    scientific: 'Trichoptera (various)',
    months: [4, 5, 6, 7, 8, 9, 10],
    region: 'both',
    sizes: '#14–18',
    flies: ['Elk Hair Caddis', 'X-Caddis', 'LaFontaine Sparkle Pupa', 'Soft Hackle'],
    timing: 'Prolific through the warm months; evenings are prime.',
  },
  {
    name: 'Salmonfly',
    scientific: 'Pteronarcys californica',
    months: [5, 6],
    region: 'west',
    sizes: '#2–6',
    flies: ['Salmonfly Dry (Chubby/Rogue)', "Pat's Rubber Legs"],
    timing: 'The big one. Late May–June, moving upriver as flows drop and water temps reach the low 50s°F.',
  },
  {
    name: 'Golden Stonefly',
    scientific: 'Hesperoperla / Calineuria',
    months: [6, 7],
    region: 'west',
    sizes: '#6–10',
    flies: ['Golden Stone Dry', "Pat's Rubber Legs (gold)", 'Stimulator'],
    timing: 'Follows the salmonflies into July.',
  },
  {
    name: 'Yellow Sally',
    scientific: 'Little Yellow Stonefly',
    months: [6, 7, 8],
    region: 'west',
    sizes: '#12–16',
    flies: ['Yellow Sally', 'Yellow Stimulator'],
    timing: 'Summer-long small yellow stonefly.',
  },
  {
    name: 'Pale Morning Dun',
    scientific: 'Ephemerella (PMD)',
    months: [6, 7, 8],
    region: 'both',
    sizes: '#14–18',
    flies: ['PMD Sparkle Dun', 'PMD Parachute', 'Pheasant Tail'],
    timing: 'Late-morning emergence on tailwaters and spring creeks; can be technical.',
  },
  {
    name: 'Sulphur',
    scientific: 'Ephemerella invaria/dorothea',
    months: [5, 6, 7],
    region: 'east',
    sizes: '#14–18',
    flies: ['Sulphur Comparadun', 'Sulphur Sparkle Dun', 'Pheasant Tail'],
    timing: 'Evening hatch on Eastern limestone creeks, often running for weeks.',
  },
  {
    name: 'Green Drake',
    scientific: 'Ephemera guttulata / Drunella',
    months: [5, 6],
    region: 'both',
    sizes: '#8–12',
    flies: ['Green Drake', 'Coffin Fly (spinner)', 'Drake Parachute'],
    timing: 'Famous, brief late-May/June windows (Penn’s Creek East; Western drakes on freestones).',
  },
  {
    name: 'Trico',
    scientific: 'Tricorythodes',
    months: [7, 8, 9],
    region: 'both',
    sizes: '#20–24',
    flies: ['Trico Spinner', 'Trico Dun'],
    timing: 'Morning spinner falls, peaking in August; tiny and technical.',
  },
  {
    name: 'Callibaetis',
    scientific: 'Callibaetis',
    months: [6, 7, 8, 9],
    region: 'both',
    sizes: '#14–16',
    flies: ['Callibaetis Spinner', 'Callibaetis Sparkle Dun'],
    timing: 'Stillwaters and slow flats; late-morning emergence.',
  },
  {
    name: 'Terrestrials',
    scientific: 'Hoppers, ants, beetles',
    months: [7, 8, 9],
    region: 'both',
    sizes: '#8–16',
    flies: ['Chubby Chernobyl', 'Morrish Hopper', 'Foam Ant', 'Foam Beetle'],
    timing: 'Warm, windy afternoons along grassy banks — peak hopper season.',
  },
  {
    name: 'Mahogany Dun',
    scientific: 'Paraleptophlebia',
    months: [9, 10],
    region: 'west',
    sizes: '#14–16',
    flies: ['Mahogany Dun', 'Pheasant Tail'],
    timing: 'Cool fall afternoons.',
  },
  {
    name: 'October Caddis',
    scientific: 'Dicosmoecus',
    months: [9, 10],
    region: 'west',
    sizes: '#8–10',
    flies: ['October Caddis', 'Orange Stimulator'],
    timing: 'Large orange caddis, mid-September into October; afternoons and evenings.',
  },
]

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? `Month ${month}`
}

/** West/East regime from longitude, using the ~100th meridian as the divide. */
export function regionForLongitude(longitude: number): HatchRegion {
  return longitude <= -100 ? 'west' : 'east'
}

export interface HatchQuery {
  /** Month 1–12. */
  month: number
  /** Optional longitude to narrow West vs. East; omit to include both. */
  longitude?: number
}

export interface HatchResult {
  month: number
  monthName: string
  region: HatchRegion
  hatches: Hatch[]
}

/**
 * Hatches likely active for a month, optionally narrowed to a region by
 * longitude. Region-agnostic hatches ('both') always pass the region filter.
 */
export function getHatches(query: HatchQuery): HatchResult {
  const month = query.month
  const region: HatchRegion =
    query.longitude != null ? regionForLongitude(query.longitude) : 'both'

  const hatches = HATCHES.filter(
    (h) =>
      h.months.includes(month) &&
      (region === 'both' || h.region === 'both' || h.region === region)
  )

  return { month, monthName: monthName(month), region, hatches }
}
