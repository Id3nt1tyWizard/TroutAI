/**
 * Deterministic gear-vs-conditions matching for the Spot Finder.
 *
 * Pure logic, no I/O — takes a FullGearProfile plus a spot's live conditions
 * and returns explicit match/mismatch findings. Every mismatch is stated in
 * plain language (the non-negotiable: never silently deprioritize).
 *
 * Match axes (the ones the granular gear schema was built for):
 *   - outfit balance:  rod weight_class vs. line weight vs. reel line_weight (±1)
 *   - line type:       floating vs. sinking against the gage's flow status
 *   - fly coverage:    the user's flies vs. the month's active hatches
 *                      (via `imitates` taxa, suggested-pattern names, hook size)
 *   - tippet:          hook-size ÷ 4 ≈ tippet-X against hatch size ranges (±1X)
 *   - water temp:      trout thermal bands (≥67°F = don't fish it)
 *
 * Custom (non-preset) text values simply don't participate — a fly whose
 * `imitates` isn't a known taxon can still match by pattern name; a line whose
 * type isn't a preset is ignored by the line-type rule.
 */

import type { FlowCategory } from '../usgs'
import { getHatches, type Hatch } from '../hatches'
import type { Fly, FullGearProfile } from '@/types/database'

/** The slice of a spot's conditions the matcher needs. */
export interface SpotConditionsInput {
  /** Flow classification from `getStreamConditions`, or null if no baseline. */
  flowCategory: FlowCategory | null
  /** Water temperature °F, or null if the gage doesn't report it. */
  waterTempF: number | null
  /** Month 1–12 (drives the hatch calendar). */
  month: number
  /** Gage longitude (drives the West/East hatch split). */
  longitude: number
}

export type MatchStatus = 'good' | 'partial' | 'mismatch' | 'info'
export type MatchKind = 'outfit' | 'line-type' | 'flies' | 'tippet' | 'water-temp'

export interface MatchFinding {
  kind: MatchKind
  status: MatchStatus
  summary: string
}

export interface GearMatchReport {
  /** Worst finding wins: any mismatch → 'mismatch', else any partial → 'partial'. */
  overall: 'good' | 'partial' | 'mismatch'
  findings: MatchFinding[]
}

/** Line types that get flies down in heavy water. */
const SINKING_LINE_TYPES = new Set(['sink-tip', 'intermediate', 'full-sink'])

/**
 * Which preset taxa (`flies.imitates`) each hatch answers to. Hatches with no
 * clean taxon (e.g. Hendrickson) rely on the pattern-name fallback instead.
 */
const HATCH_TAXA_BY_NAME: Record<string, string[]> = {
  Midges: ['midge'],
  'Blue-Winged Olive': ['baetis'],
  'Skwala Stonefly': ['stonefly'],
  'March Brown': ['march brown'],
  "Mother's Day Caddis": ['caddis'],
  Caddis: ['caddis'],
  Salmonfly: ['salmonfly', 'stonefly'],
  'Golden Stonefly': ['stonefly'],
  'Yellow Sally': ['stonefly'],
  'Pale Morning Dun': ['pmd'],
  'Green Drake': ['green drake'],
  Trico: ['trico'],
  Terrestrials: ['hopper', 'ant', 'beetle'],
  'October Caddis': ['caddis'],
}

/** Parse "5X" → 5. Null for anything that isn't an X designation. */
export function parseTippetX(xSize: string): number | null {
  const m = /^(\d+)\s*[xX]$/.exec(xSize.trim())
  return m ? Number(m[1]) : null
}

/** The classic rule of thumb: tippet X ≈ hook size ÷ 4 (clamped to 0X–8X). */
export function tippetXForHookSize(hookSize: number): number {
  return Math.min(8, Math.max(0, Math.round(hookSize / 4)))
}

/** Parse a hatch size string like "#18–24" or "#12" into a numeric range. */
export function parseHookSizeRange(
  sizes: string
): { min: number; max: number } | null {
  const nums = sizes.match(/\d+/g)?.map(Number) ?? []
  if (nums.length === 0) return null
  return { min: Math.min(...nums), max: Math.max(...nums) }
}

/**
 * Does one fly plausibly fish one hatch? Matches by `imitates` taxon or by
 * pattern name against the hatch's suggested patterns; either way the hook
 * size (when the fly has one) must fall inside the hatch's size range.
 */
export function flyMatchesHatch(fly: Fly, hatch: Hatch): boolean {
  const range = parseHookSizeRange(hatch.sizes)
  const sizeOk =
    fly.hook_size == null ||
    range == null ||
    (fly.hook_size >= range.min && fly.hook_size <= range.max)
  if (!sizeOk) return false

  const imitates = fly.imitates?.trim().toLowerCase()
  if (imitates && (HATCH_TAXA_BY_NAME[hatch.name] ?? []).includes(imitates)) {
    return true
  }

  const pattern = fly.pattern.trim().toLowerCase()
  if (!pattern) return false
  return hatch.flies.some((suggested) => {
    const s = suggested.toLowerCase()
    return pattern.includes(s) || s.includes(pattern)
  })
}

/** Run every match rule and aggregate. */
export function matchGearToSpot(
  profile: FullGearProfile,
  conditions: SpotConditionsInput
): GearMatchReport {
  const findings: MatchFinding[] = []

  findings.push(outfitFinding(profile))
  const lineType = lineTypeFinding(profile, conditions.flowCategory)
  if (lineType) findings.push(lineType)
  findings.push(...hatchFindings(profile, conditions))
  const temp = waterTempFinding(conditions.waterTempF)
  if (temp) findings.push(temp)

  const overall = findings.some((f) => f.status === 'mismatch')
    ? 'mismatch'
    : findings.some((f) => f.status === 'partial')
      ? 'partial'
      : 'good'

  return { overall, findings }
}

/** Rod ↔ line ↔ reel weight balance (±1 weight class). */
function outfitFinding(p: FullGearProfile): MatchFinding {
  if (p.rods.length === 0) {
    return {
      kind: 'outfit',
      status: 'mismatch',
      summary: 'No rods in your gear profile — add one to get outfit matching.',
    }
  }
  if (p.lines.length === 0) {
    return {
      kind: 'outfit',
      status: 'mismatch',
      summary: 'You have rods but no fly lines — no balanced outfit can be assembled.',
    }
  }

  let partial: string | null = null
  for (const rod of p.rods) {
    const line = [...p.lines].sort(
      (a, b) =>
        Math.abs(a.weight - rod.weight_class) - Math.abs(b.weight - rod.weight_class)
    )[0]
    if (Math.abs(line.weight - rod.weight_class) > 1) continue

    const rodName = `${rod.length_ft}' ${rod.weight_class}-wt ${rod.make}`
    const reel = p.reels.find((r) => Math.abs(r.line_weight - rod.weight_class) <= 1)
    if (reel) {
      return {
        kind: 'outfit',
        status: 'good',
        summary: `Balanced outfit: ${rodName} with your ${line.weight}-wt ${line.type} line and ${reel.make} reel (${reel.line_weight}-wt).`,
      }
    }
    partial ??= `${rodName} pairs with your ${line.weight}-wt ${line.type} line, but no reel is within one weight class of ${rod.weight_class}-wt — check your reel pairing.`
  }

  if (partial) return { kind: 'outfit', status: 'partial', summary: partial }
  return {
    kind: 'outfit',
    status: 'mismatch',
    summary:
      'No line is within one weight class of any of your rods — the rod/line weights are unbalanced (a 5-wt rod wants a 4–6-wt line).',
  }
}

/** Floating vs. sinking lines against the gage's flow status. */
function lineTypeFinding(
  p: FullGearProfile,
  flow: FlowCategory | null
): MatchFinding | null {
  if (p.lines.length === 0) return null // outfit finding already flags this

  const hasFloating = p.lines.some((l) => l.type === 'floating')
  const sinking = p.lines.filter((l) => SINKING_LINE_TYPES.has(l.type))
  const hasWeightedFlies = p.flies.some((f) => f.weighted)

  if (flow === 'above-normal' || flow === 'much-above-normal') {
    const level = flow === 'much-above-normal' ? 'much above' : 'above'
    if (sinking.length > 0) {
      return {
        kind: 'line-type',
        status: 'good',
        summary: `Flow is ${level} normal — your ${sinking[0].type} line gets flies down in the heavy water.`,
      }
    }
    if (hasWeightedFlies) {
      return {
        kind: 'line-type',
        status: 'partial',
        summary: `Flow is ${level} normal and you only carry floating lines. Your weighted flies can compensate, but a sink-tip would fish this water better.`,
      }
    }
    return {
      kind: 'line-type',
      status: 'mismatch',
      summary: `Flow is ${level} normal but you have no sinking line and no weighted flies — getting down to fish in this water will be difficult.`,
    }
  }

  if (flow === 'normal' || flow === 'below-normal' || flow === 'much-below-normal') {
    if (hasFloating) {
      return {
        kind: 'line-type',
        status: 'good',
        summary: `Your floating line is the right tool at ${flow.replace(/-/g, ' ')} flow.`,
      }
    }
    return {
      kind: 'line-type',
      status: 'partial',
      summary: `You carry only sinking lines; at ${flow.replace(/-/g, ' ')} flow a floating line is the better tool for most water.`,
    }
  }

  return {
    kind: 'line-type',
    status: 'info',
    summary:
      'No historical flow baseline for this gage — line-type match not assessed against flow.',
  }
}

/** Fly coverage + tippet coverage against the month's active hatches. */
function hatchFindings(
  p: FullGearProfile,
  c: SpotConditionsInput
): MatchFinding[] {
  const { hatches, monthName } = getHatches({ month: c.month, longitude: c.longitude })
  const out: MatchFinding[] = []

  if (hatches.length === 0) {
    out.push({
      kind: 'flies',
      status: 'info',
      summary: `No major hatches on the calendar for ${monthName} — attractors and streamers are the default.`,
    })
    return out
  }

  const hatchList = (hs: Hatch[]) => hs.map((h) => `${h.name} (${h.sizes})`).join(', ')

  if (p.flies.length === 0) {
    out.push({
      kind: 'flies',
      status: 'mismatch',
      summary: `No flies in your profile to cover ${monthName}'s active hatches: ${hatchList(hatches)}.`,
    })
  } else {
    const covered = hatches.filter((h) => p.flies.some((f) => flyMatchesHatch(f, h)))
    const uncovered = hatches.filter((h) => !covered.includes(h))
    if (uncovered.length === 0) {
      out.push({
        kind: 'flies',
        status: 'good',
        summary: `Your flies cover all ${hatches.length} hatches active in ${monthName}: ${covered.map((h) => h.name).join(', ')}.`,
      })
    } else if (covered.length > 0) {
      out.push({
        kind: 'flies',
        status: 'partial',
        summary: `Your flies cover ${covered.length} of ${hatches.length} active hatches (${covered.map((h) => h.name).join(', ')}) but nothing matches: ${hatchList(uncovered)}.`,
      })
    } else {
      out.push({
        kind: 'flies',
        status: 'mismatch',
        summary: `None of your flies match ${monthName}'s active hatches: ${hatchList(hatches)}.`,
      })
    }
  }

  // Tippet: the X sizes the hatch hook sizes call for (hook ÷ 4, ±1X tolerance).
  const neededX = new Set<number>()
  for (const h of hatches) {
    const r = parseHookSizeRange(h.sizes)
    if (r) {
      neededX.add(tippetXForHookSize(r.min))
      neededX.add(tippetXForHookSize(r.max))
    }
  }
  if (neededX.size === 0) return out

  const needed = [...neededX].sort((a, b) => a - b)
  if (p.tippet_spools.length === 0) {
    out.push({
      kind: 'tippet',
      status: 'mismatch',
      summary: `No tippet spools in your profile — this month's fly sizes call for ${needed.map((x) => `${x}X`).join(', ')}.`,
    })
    return out
  }

  const have = p.tippet_spools
    .map((s) => parseTippetX(s.x_size))
    .filter((x): x is number => x != null)
  const missing = needed.filter((x) => !have.some((h) => Math.abs(h - x) <= 1))
  const lowStock = p.tippet_spools.filter((s) => {
    const x = parseTippetX(s.x_size)
    return s.low_stock && x != null && needed.some((n) => Math.abs(n - x) <= 1)
  })

  if (missing.length > 0) {
    out.push({
      kind: 'tippet',
      status: missing.length === needed.length ? 'mismatch' : 'partial',
      summary: `Missing tippet for this month's fly sizes: no spool within 1X of ${missing.map((x) => `${x}X`).join(', ')}.`,
    })
  } else if (lowStock.length > 0) {
    out.push({
      kind: 'tippet',
      status: 'partial',
      summary: `Tippet sizes are covered, but ${lowStock.map((s) => s.x_size).join(', ')} ${lowStock.length === 1 ? 'is' : 'are'} flagged low stock — restock before the trip.`,
    })
  } else {
    out.push({
      kind: 'tippet',
      status: 'good',
      summary: `Tippet covered: your spools span the ${needed.map((x) => `${x}X`).join(', ')} range this month's flies call for.`,
    })
  }

  return out
}

/** Trout thermal bands. ≥67°F is a don't-fish-it condition, not a gear issue. */
function waterTempFinding(tempF: number | null): MatchFinding | null {
  if (tempF == null) return null
  if (tempF >= 67) {
    return {
      kind: 'water-temp',
      status: 'mismatch',
      summary: `Water is ${tempF}°F — at 67°F+ trout are thermally stressed and release mortality is high. Fish elsewhere, or only in the early morning.`,
    }
  }
  if (tempF >= 65) {
    return {
      kind: 'water-temp',
      status: 'partial',
      summary: `Water is ${tempF}°F — approaching stressful territory for trout. Fish early, land fish fast, and keep them wet.`,
    }
  }
  if (tempF < 40) {
    return {
      kind: 'water-temp',
      status: 'partial',
      summary: `Water is ${tempF}°F — very cold. Expect slow fishing; dead-drifted midges and slow, deep nymphing.`,
    }
  }
  return {
    kind: 'water-temp',
    status: 'good',
    summary: `Water is ${tempF}°F — in the productive range for trout.`,
  }
}
