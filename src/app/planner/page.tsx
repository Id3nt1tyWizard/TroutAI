import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PlannerClient from './PlannerClient'

export const metadata = { title: 'Trip Planner' }

export default async function PlannerPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <PlannerClient />
}
