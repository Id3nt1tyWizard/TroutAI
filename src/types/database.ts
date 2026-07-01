/**
 * Hand-written types matching supabase/migrations/*.sql (001 + 002).
 *
 * Replace this file with generated types once a Supabase project is linked:
 *   npx supabase gen types typescript --local > src/types/database.ts
 *
 * NOTE: the enum-like columns below (category, type, material, action, arbor,
 * taper, x_size…) are plain TEXT in the DB — a user may enter a custom value, so
 * these columns are typed `string`. The unions in `src/lib/gear/presets.ts` are
 * the *suggested* preset vocabulary, not a DB-enforced constraint.
 */

export type WadingSetup = 'wet' | 'waders'
export type FlySort = 'category' | 'name' | 'size' | 'box'

export interface GearProfile {
  id: string
  user_id: string
  wading_setup: WadingSetup
  fly_sort: FlySort
  updated_at: string
}

export interface Rod {
  id: string
  gear_profile_id: string
  make: string
  model: string | null
  length_ft: number
  weight_class: number
  action: string | null
  pieces: number | null
}

export interface Reel {
  id: string
  gear_profile_id: string
  make: string
  model: string | null
  line_weight: number
  arbor: string | null
}

export interface Line {
  id: string
  gear_profile_id: string
  type: string
  weight: number
  taper: string | null
  sink_ips: number | null
}

export interface Leader {
  id: string
  gear_profile_id: string
  material: string
  length_ft: number
  tippet_x: string | null
}

/** Optional physical container. Flies reference it by nullable FK. */
export interface FlyBox {
  id: string
  gear_profile_id: string
  label: string | null
}

/** A single fly. Flat by default; `box_id` groups it into an optional box. */
export interface Fly {
  id: string
  gear_profile_id: string
  box_id: string | null
  pattern: string
  category: string
  hook_size: number | null
  color: string | null
  weighted: boolean
  quantity: number | null
  imitates: string | null
  created_at: string
}

export interface TippetSpool {
  id: string
  gear_profile_id: string
  x_size: string
  material: string
  breaking_lb: number | null
  low_stock: boolean
}

export interface CatchReport {
  id: string
  user_id: string
  spot_name: string
  latitude: number | null
  longitude: number | null
  species: string
  method: string | null
  fly_pattern: string | null
  water_conditions: string | null
  gear_notes: string | null
  report_date: string
  created_at: string
}

/** Full gear profile with all related tables joined */
export interface FullGearProfile extends GearProfile {
  rods: Rod[]
  reels: Reel[]
  lines: Line[]
  leaders: Leader[]
  fly_boxes: FlyBox[]
  flies: Fly[]
  tippet_spools: TippetSpool[]
}
