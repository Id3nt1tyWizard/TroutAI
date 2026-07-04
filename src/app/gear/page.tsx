import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fetchFullGearProfile } from '@/lib/supabase/gear'
import GearPageClient from './GearPageClient'

export const metadata = { title: 'Gear Locker' }

export default async function GearPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const fullProfile = await fetchFullGearProfile(supabase, user.id)
  if (!fullProfile) redirect('/login')

  return <GearPageClient profile={fullProfile} />
}
