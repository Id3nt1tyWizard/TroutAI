/**
 * Globally-fixed preset vocabularies for gear fields.
 *
 * Every gear field offers these presets in the UI (as datalist suggestions) but
 * the underlying columns are plain TEXT/INTEGER — a user can type a custom value
 * for more detail. Keep these in sync with the suggested unions in
 * `src/types/database.ts`.
 *
 * Matching logic keys off the preset values; a custom value simply doesn't
 * participate in automated matching (it stays as the user's display text).
 *
 * "Globally fixed" = curated here in code, not user-extensible. To add a preset,
 * edit this file. (A `gear_presets` table could make these user-editable later
 * without touching the schema.)
 */

export const FLY_CATEGORIES = [
  'dry',
  'nymph',
  'emerger',
  'streamer',
  'wet',
  'terrestrial',
  'midge',
] as const

export const LINE_TYPES = ['floating', 'sink-tip', 'intermediate', 'full-sink'] as const
export const LINE_TAPERS = ['WF', 'DT', 'level'] as const
export const LEADER_MATERIALS = ['mono', 'fluoro', 'furled'] as const
export const ROD_ACTIONS = ['slow', 'medium', 'fast'] as const
export const REEL_ARBORS = ['standard', 'mid', 'large'] as const
export const TIPPET_X_SIZES = ['0X', '1X', '2X', '3X', '4X', '5X', '6X', '7X', '8X'] as const
export const TIPPET_MATERIALS = ['mono', 'fluoro'] as const

/** Even hook sizes cover the vast majority of trout flies; odd/large sizes stay typeable. */
export const HOOK_SIZES = [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28] as const

/** Common taxa an angler's fly might imitate — the clean key for hatch matching. */
export const HATCH_TAXA = [
  'baetis',
  'pmd',
  'march brown',
  'green drake',
  'caddis',
  'midge',
  'stonefly',
  'salmonfly',
  'hopper',
  'ant',
  'beetle',
  'sculpin',
  'trico',
] as const

/** How the flat fly list is grouped/sorted in the UI (persisted on the profile). */
export const FLY_SORTS = ['category', 'name', 'size', 'box'] as const
