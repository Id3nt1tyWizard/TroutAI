import Link from 'next/link'
import { signup } from './actions'

export const metadata = { title: 'Create Account' }

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-white">Create your account</h1>
          <p className="text-slate-400 mt-1 text-sm">
            Start planning smarter fishing trips today
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-8">
          {error && (
            <div className="mb-5 rounded-lg bg-red-900/30 border border-red-800/60 px-4 py-3 text-sm text-red-400">
              {decodeURIComponent(error)}
            </div>
          )}

          <form action={signup} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1.5">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent text-sm"
                placeholder="angler@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-300 mb-1.5"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="new-password"
                minLength={8}
                className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent text-sm"
                placeholder="Min. 8 characters"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-green-700 hover:bg-green-600 text-white font-semibold text-sm transition-colors mt-2"
            >
              Create account
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-slate-400">
          Already have an account?{' '}
          <Link href="/login" className="text-sky-400 hover:text-sky-300 font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  )
}
