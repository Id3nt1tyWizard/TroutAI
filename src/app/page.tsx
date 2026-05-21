import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="flex flex-col items-center justify-center flex-1 px-6 py-24 text-center">
      <div className="max-w-2xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-900/40 border border-green-800/60 text-green-400 text-sm font-medium mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Agentic trip planning for serious fly fishers
        </div>

        <h1 className="text-5xl font-bold tracking-tight text-white mb-6">
          Know the water
          <span className="block text-green-500">before you leave the truck.</span>
        </h1>

        <p className="text-lg text-slate-400 mb-10 leading-relaxed">
          Trout AI cross-references real-time streamflow, weather, hatch conditions, and state
          regulations — then builds a personalized day-by-day itinerary matched to your gear.
        </p>

        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link
            href="/signup"
            className="px-6 py-3 rounded-lg bg-green-700 hover:bg-green-600 text-white font-semibold transition-colors"
          >
            Get started free
          </Link>
          <Link
            href="/login"
            className="px-6 py-3 rounded-lg border border-slate-700 hover:border-slate-600 text-slate-300 hover:text-white font-semibold transition-colors"
          >
            Sign in
          </Link>
        </div>

        <div className="mt-20 grid grid-cols-3 gap-6 text-left">
          {[
            {
              label: 'Real-time conditions',
              desc: 'USGS streamflow, water temp, and weather — pulled the moment you plan.',
            },
            {
              label: 'Gear-matched spots',
              desc: 'Your rod weight and fly box shape every recommendation. Mismatches are flagged, not hidden.',
            },
            {
              label: 'Regulation-aware',
              desc: 'Season dates, bag limits, and C&R rules checked for every spot before it surfaces.',
            },
          ].map((f) => (
            <div key={f.label} className="p-5 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="text-green-500 font-semibold text-sm mb-2">{f.label}</div>
              <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
