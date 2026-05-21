/**
 * Hand-written types matching supabase/migrations/001_initial_schema.sql.
 *
 * Replace this file with generated types once a Supabase project is linked:
 *   npx supabase gen types typescript --local > src/types/database.ts
 */

export type WadingSetup = 'wet' | 'waders'
export type LineType = 'floating' | 'sink-tip' | 'full-sink'
export type LeaderMaterial = 'mono' | 'fluoro' | 'furled'
export type FlyCategory = 'dry' | 'nymph' | 'streamer' | 'emerger'

export interface GearProfile {
  id: string
  user_id: string
  wading_setup: WadingSetup
  tippet_sizes: string[]
  updated_at: string
}

export interface Rod {
  id: string
  gear_profile_id: string
  make: string
  length_ft: number
  weight_class: number
}

export interface Reel {
  id: string
  gear_profile_id: string
  make: string
  line_weight: number
}

export interface Line {
  id: string
  gear_profile_id: string
  type: LineType
  weight: number
}

export interface Leader {
  id: string
  gear_profile_id: string
  material: LeaderMaterial
  length_ft: number
}

export interface FlyBox {
  id: string
  gear_profile_id: string
  category: FlyCategory
  patterns: string[]
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
}
