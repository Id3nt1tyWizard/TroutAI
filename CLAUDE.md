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
