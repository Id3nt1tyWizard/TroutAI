import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <main className="flex-1 px-6 py-10 max-w-5xl mx-auto w-full">
      <header className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5">{user.email}</p>
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 text-sm transition-colors"
          >
            Sign out
          </button>
        </form>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
        {[
          { label: 'Plan a trip', href: '/planner', desc: 'Build a day-by-day itinerary', color: 'green' },
          { label: 'Gear locker', href: '/gear', desc: 'Manage your rod, reel, and fly box', color: 'sky' },
          { label: 'Spot finder', href: '/spots', desc: 'Browse live conditions on the map', color: 'slate' },
          { label: 'Shops & reports', href: '/reports', desc: 'Nearby fly shops + local shop/guide reports', color: 'slate' },
        ].map((card) => (
          <a
            key={card.href}
            href={card.href}
            className="group p-6 rounded-xl border border-slate-800 bg-slate-900/60 hover:border-slate-700 transition-colors"
          >
            <div
              className={`text-sm font-semibold mb-1 ${
                card.color === 'green'
                  ? 'text-green-500'
                  : card.color === 'sky'
                  ? 'text-sky-400'
                  : 'text-slate-400'
              }`}
            >
              {card.label}
            </div>
            <p className="text-slate-400 text-sm">{card.desc}</p>
          </a>
        ))}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">Recent trips</h2>
        <p className="text-slate-500 text-sm">No trips planned yet. Start by setting up your gear profile.</p>
      </div>
    </main>
  )
}
