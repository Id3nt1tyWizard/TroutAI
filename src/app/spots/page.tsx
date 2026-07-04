import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SpotsClient from './SpotsClient'

export const metadata = { title: 'Spot Finder' }

export default async function SpotsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <SpotsClient />
}
