import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { FullGearProfile } from '@/types/database'
import GearPageClient from './GearPageClient'

export const metadata = { title: 'Gear Locker' }

export default async function GearPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('gear_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!profile) redirect('/login')

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

  const fullProfile: FullGearProfile = {
    ...profile,
    rods: rods ?? [],
    reels: reels ?? [],
    lines: lines ?? [],
    leaders: leaders ?? [],
    fly_boxes: fly_boxes ?? [],
    flies: flies ?? [],
    tippet_spools: tippet_spools ?? [],
  }

  return <GearPageClient profile={fullProfile} />
}
