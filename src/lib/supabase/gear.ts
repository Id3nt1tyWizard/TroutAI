import type { SupabaseClient } from '@supabase/supabase-js'
import type { FullGearProfile } from '@/types/database'

/**
 * Fetch a user's gear profile with all sub-tables joined, or null if no
 * profile row exists. Callers pass an already-authed client and the id from
 * `getUser()` — the profile is always resolved server-side from auth, never
 * from client input.
 */
export async function fetchFullGearProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<FullGearProfile | null> {
  const { data: profile } = await supabase
    .from('gear_profiles')
    .select('*')
    .eq('user_id', userId)
    .single()
  if (!profile) return null

  const [
    { data: rods },
    { data: reels },
    { data: lines },
    { data: leaders },
    { data: fly_boxes },
    { data: flies },
    { data: tippet_spools },
  ] = await Promise.all([
    supabase.from('rods').select('*').eq('gear_profile_id', profile.id),
    supabase.from('reels').select('*').eq('gear_profile_id', profile.id),
    supabase.from('lines').select('*').eq('gear_profile_id', profile.id),
    supabase.from('leaders').select('*').eq('gear_profile_id', profile.id),
    supabase.from('fly_boxes').select('*').eq('gear_profile_id', profile.id),
    supabase.from('flies').select('*').eq('gear_profile_id', profile.id),
    supabase.from('tippet_spools').select('*').eq('gear_profile_id', profile.id),
  ])

  return {
    ...profile,
    rods: rods ?? [],
    reels: reels ?? [],
    lines: lines ?? [],
    leaders: leaders ?? [],
    fly_boxes: fly_boxes ?? [],
    flies: flies ?? [],
    tippet_spools: tippet_spools ?? [],
  }
}
