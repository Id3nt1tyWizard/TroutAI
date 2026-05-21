# Trout AI — Claude Code Project Guide

## Overview
Agentic fly-fishing trip planner. Users input dates, region, and species; an AI agent pulls real-time USGS streamflow, weather, hatch data, and state regulations, then produces a gear-matched day-by-day itinerary.

## Stack
- **Framework:** Next.js 16 (App Router, TypeScript)
- **Styling:** Tailwind CSS v4
- **Database + Auth:** Supabase (PostgreSQL + Supabase Auth via `@supabase/ssr`)
- **AI:** Anthropic API — `claude-sonnet-4-20250514` with tool use
- **Map:** Mapbox GL JS or React Leaflet (Step 5)

## Development Commands
```bash
npm run dev      # Start dev server on localhost:3000
npm run build    # Production build
npm run lint     # ESLint
```

## Environment
Copy `.env.local.example` → `.env.local` and fill in:
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from Supabase project settings
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, never expose to client
- `ANTHROPIC_API_KEY` — for the agentic planner
- `NEXT_PUBLIC_MAPBOX_TOKEN` — for the spot finder map

## Project Structure
```
src/
  app/
    (auth)/login/       # Login page + server action
    (auth)/signup/      # Signup page + server action
    auth/callback/      # Supabase OAuth callback route
    dashboard/          # Protected home screen (Step 1 placeholder)
    gear/               # Gear profile UI (Step 2)
    planner/            # Agentic planner UI (Step 4)
    spots/              # Spot finder map (Step 5)
    reports/            # Community reports (Step 6)
    regulations/        # Regulations dashboard (Step 7)
  lib/
    supabase/
      client.ts         # Browser Supabase client (createBrowserClient)
      server.ts         # Server Supabase client (createServerClient + cookies)
    anthropic/          # Claude API client + tool definitions (Step 4)
    usgs/               # USGS streamflow API wrapper (Step 3)
    weather/            # Open-Meteo API wrapper (Step 3)
    regulations/        # State regulations helpers (Step 7)
middleware.ts           # Supabase session refresh + route protection
supabase/
  migrations/001_initial_schema.sql   # DB schema (apply in Supabase SQL editor)
```

## Auth Pattern
- Uses Supabase Auth directly (email + password; OAuth-ready via `/auth/callback`)
- Middleware (`middleware.ts`) refreshes the session on every request and guards `/dashboard/*`
- Server components use `src/lib/supabase/server.ts`; client components use `src/lib/supabase/client.ts`
- Never call `getSession()` on the server — always use `getUser()` (authoritative)

## Database
Schema is in `supabase/migrations/001_initial_schema.sql`. Apply it in the Supabase project's SQL editor.

Tables: `gear_profiles`, `rods`, `reels`, `lines`, `leaders`, `fly_boxes`, `catch_reports`

Row-level security is enabled on all tables. Users can only read/write their own gear data. Catch reports are publicly readable.

## Build Order
1. ✅ Project scaffolding (Next.js + Tailwind + Supabase + Auth)
2. Gear profile UI + database schema
3. USGS + Weather + Geolocation API integrations with typed wrappers
4. Agentic planner (Claude tool-use agent orchestrating all data sources + gear profile)
5. Spot Finder map with live condition overlays + gear match indicators
6. Community reports (submit + display)
7. Regulations dashboard

## Non-Negotiables (from spec)
- Always surface regulation warnings before confirming any itinerary
- Never recommend a spot without checking current streamflow status
- Always explain gear mismatches explicitly — never silently deprioritize
- Community reports older than 14 days weighted lower in rankings
- Trip gear overrides must never mutate the saved profile
- All API keys in `.env.local`, never hardcoded


## Session Decisions Log

### Architectural Decisions

**Supabase Auth over NextAuth/Clerk**
Spec listed NextAuth.js or Clerk — built with Supabase Auth instead. Rationale: first-class Supabase Postgres integration, shared RLS context, `auth.uid()` works in policies directly, `@supabase/ssr` handles SSR session refresh with no extra config. Trade-off: OAuth/magic link setup is more Supabase-specific vs. NextAuth's provider abstractions.

**Always use `getUser()`, never `getSession()` on the server**
`getSession()` reads the JWT from the cookie without network validation and can be spoofed. `getUser()` validates the token against Supabase. This must be maintained everywhere server-side, including middleware.

**Gear sub-tables as normalized rows, not JSONB**
`rods`, `reels`, `lines`, `leaders`, `fly_boxes` are separate tables with FK to `gear_profiles` — not JSONB arrays. This makes individual gear items queryable, updatable, and deletable without rewriting the full array.

**Permissive RLS policy layering on `catch_reports`**
Two policies coexist: `FOR SELECT USING (true)` (public reads) and three separate write policies scoped to `auth.uid() = user_id`. Supabase evaluates permissive policies with OR logic — authenticated users can read all reports, but only write their own. This is intentional.

**Server actions return `{ error?: string }`, not void**
Each action destructures `{ error }` from the Supabase call and returns it. Client components wrap actions in async handlers to capture the result and display per-section error banners. Harmlessly ignored when used directly as `<form action={fn}>`.

**`useSectionHandlers` hook + `*Fields` subcomponents for gear sections**
All five gear sub-table sections share identical state shape: `showForm`, `editingId`, `error`, plus three handler wrappers — extracted to one hook. Each gear type has a `*Fields` subcomponent (e.g. `RodFields`) powering both add and edit forms via an `initial?` prop.

**Inline row editing via `<td colSpan>`**
Click Edit → entire `<tr>` is replaced with `<tr><td colSpan={N}>{form}</td></tr>`. Avoids modal complexity. Required because browsers strip bare `<form>` elements between `<tr>` rows.

**Profile ID resolved server-side from auth user, never from form input**
Every add action calls `getProfileId()` which looks up the gear_profile row via `auth.uid()`. No hidden `gear_profile_id` form field. Defense in depth — removes one thing a client can lie about.

**Opening add closes active edit, and vice versa**
Section state enforces mutual exclusivity — only one in-progress form per section at a time.

---

### Deviations from Spec

- **Auth:** Built with Supabase Auth, not NextAuth.js or Clerk
- **Tailwind config:** Tailwind v4 dropped `tailwind.config.ts` — all theme customization lives in `globals.css` via `@theme` directives. Any reference to `tailwind.config.ts` is wrong.
- **`/gear` not in middleware matcher:** Middleware only guards `/dashboard`. The gear page does its own `getUser()` + redirect. Revisit if more protected routes accumulate.
- **Tippet sizes are hardcoded:** UI checkbox set (0X–7X). Schema accepts arbitrary `text[]` but users can't enter custom designations via the UI.
- **Fly box patterns use comma-separated input:** Splits on `,`, trims, filters empty. Pattern names containing literal commas are not representable.

---

### Known Gotchas — Do Not Repeat These Mistakes

**Directory naming**
`create-next-app` rejects capital letters in directory names. Scaffold into a lowercase subdirectory (e.g. `trout-ai/`), move files up, delete the subdir.

**RLS policy syntax**
`FOR INSERT UPDATE DELETE` is invalid PostgreSQL — `FOR` only accepts one command: `ALL | SELECT | INSERT | UPDATE | DELETE`. Use three separate policies or `FOR ALL`.

**No `gear_profiles` row after signup**
Supabase creates `auth.users` rows on signup but nothing creates a corresponding `gear_profiles` row. All gear queries return null until one exists. Fix: `handle_new_user()` trigger firing `AFTER INSERT ON auth.users`, declared `SECURITY DEFINER SET search_path = public`.

**`updated_at` doesn't self-update**
`DEFAULT NOW()` only fires on INSERT. Without a `BEFORE UPDATE` trigger calling `set_updated_at()`, `gear_profiles.updated_at` stays frozen at creation time forever.

**`turbopack.root` config location**
`turbopack.root` is a top-level `NextConfig` key — not under `experimental`. Placing it under `experimental` causes a TypeScript error and failed build.

**Multiple `package-lock.json` files**
If any ancestor directory has its own `package-lock.json`, Next.js 16 warns about workspace root detection on every build. Suppress with `turbopack.root: path.resolve(__dirname)` in `next.config.ts`.

**`next-env.d.ts` is gitignored**
Auto-generated, should not be committed. `git add next-env.d.ts` requires `-f`.

**GitHub branch case sensitivity**
The GitHub API is case-sensitive for branch names. `"base": "Main"` returns a 422 if the remote branch is `main`. Always verify the exact remote branch name before creating PRs programmatically.

**`gh` CLI may not be installed**
GitHub CLI may not be in `$PATH`. Fall back to Python `urllib` using credentials from `git credential fill` if needed.

**OneDrive file lock on `.next/static/` during `next build`**
`EPERM: operation not permitted` on a build artifact means OneDrive is holding the file from a previous build. Fix: `rm -rf .next` and rerun. Recurring on Windows + OneDrive setups.

**`revalidatePath` does NOT reset client component state**
When a server action calls `revalidatePath('/gear')`, the server re-renders with fresh data but `useState` values (`showForm`, `editingId`) persist. To auto-close a form after a successful submit, the client wrapper must explicitly call `setShowForm(false)` / `setEditingId(null)` — only after confirming no error, so failed submissions keep the form open.

**Server actions used as `form.action` can't capture return values**
`<form action={deleteRod.bind(null, id)}>` works but discards `{ error }`. To surface errors, wrap in a client handler: `<form action={() => handleDelete(id)}>` where `handleDelete` awaits the action and reads `res.error`.

**RLS-blocked operations return success, not an error**
If a crafted request tries to update/delete another user's row, Postgres updates 0 rows and Supabase returns `{ error: null }`. Error-surfacing won't catch this — only DB-level failures trigger error returns. Don't rely on error returns to confirm a privileged write actually happened.

**Unused generics trigger `@typescript-eslint/no-unused-vars`**
`function useSectionHandlers<T extends { id: string }>()` fails lint if `T` isn't referenced in the body. Drop unused generics — TypeScript doesn't need them for inference if parameter types are self-contained.