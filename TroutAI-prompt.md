# Trout AI — Claude Code Meta Prompt

**Project Name:** Trout AI  
**Stack:** Next.js (App Router), TypeScript, Tailwind CSS

---

## Role & Goal

You are building **Trout AI**, a web application designed for serious and competitive fly fishers. The app's core function is **agentic trip planning** — it autonomously gathers real-time conditions, cross-references regulations, and builds complete, personalized fishing itineraries based on the user's location, target species, and specific gear setup.

---

## Core Features to Build

### 1. Agentic Trip Planner
- User inputs: target dates, region/state, target species (brown, rainbow, brook, cutthroat, etc.), and trip duration
- The AI agent autonomously:
  - Queries USGS streamflow data to evaluate river/stream conditions
  - Fetches weather and water temperature forecasts for candidate spots
  - Checks public fishing regulations by state (seasons, bag limits, catch-and-release rules, licensing)
  - Synthesizes user-submitted community reports for recent catch activity
  - Factors in the user's current GPS position (or manually entered location) to prioritize nearby spots and calculate drive times
  - Factors in the user's gear profile to tailor all recommendations
  - Produces a ranked, day-by-day itinerary with best spots, recommended times, hatch conditions, and gear guidance

### 2. Gear-Aware Recommendations
Every spot recommendation includes gear-specific guidance tailored to the user's setup:
- **Rod:** recommended weight (e.g. 4wt for small technical streams, 6wt for big water) and whether the user's rod is appropriate
- **Line:** floating, sink-tip, or full-sink recommendation based on water depth and season
- **Leader:** length and tippet size matched to fly size and water clarity
- **Flies:** specific pattern recommendations (dry, nymph, streamer, emerger) based on current hatch data, water temp, and season — with fallback patterns if hatch data is unavailable

If the user's gear is suboptimal for a spot, the AI flags it clearly (e.g. "Your 3wt may struggle in high flows — consider X") rather than silently downranking.

### 3. Angler Profile & Gear Locker
Users set up a persistent gear profile on their account:
- Rod(s): manufacturer, length, weight
- Reel(s) and line type/weight
- Leader preferences (furled, mono, fluorocarbon) and typical tippet sizes carried
- Fly box contents (user tags flies they own by category: dries, nymphs, streamers, emergers)
- Wading setup (wet wading, waders + boots) — affects spot accessibility recommendations

**Profile behavior:**
- Profile defaults are used in all trip planning sessions
- Users can override any gear field per trip without changing their saved profile
- Current position: auto-detected via browser geolocation or manually entered; stored as session preference, not persisted

### 4. Spot Finder Map
- Interactive map view of candidate fishing locations
- Each pin shows: current streamflow status, water temp, regulation summary, community report score, and gear match indicator (green/yellow/red based on user's profile)
- Filter by species, access type (walk-in, wade, boat), and difficulty

### 5. Community Reports
- Authenticated users can submit catch reports: species, method, fly pattern used, water conditions, and optional gear notes
- Reports feed back into the AI ranking model for future recommendations

### 6. Regulations Dashboard
- Per-state regulation summaries pulled from public sources
- Warnings surfaced proactively in the planner if a selected spot has restrictions on target dates

---

## Data Integrations to Scaffold

| Source | Purpose |
|---|---|
| USGS Water Services API | Real-time streamflow & gauge height |
| Open-Meteo or Weather.gov | Weather + water temp forecasts |
| Hatch data (Hatch Matcher API or static seasonal tables) | Fly pattern recommendations |
| User submissions (Postgres) | Community catch reports + gear profiles |
| State regulation data | Season dates, rules (scrape or static JSON per state) |
| Browser Geolocation API | User's current position for proximity sorting |

---

## Architecture Guidelines

- Use **Next.js App Router** with server components for data fetching where possible
- Use **server actions** for form submissions (catch reports, trip requests, gear profile saves)
- Store user data, gear profiles, and community reports in **PostgreSQL** (Supabase recommended)
- Use the **Anthropic API** (`claude-sonnet-4-20250514`) for the agentic planner — give it tool use access to each data source, including a `get_gear_profile` tool and a `get_user_location` tool so it can personalize autonomously
- Map: use **Mapbox GL JS** or **React Leaflet**
- Auth: **NextAuth.js** or **Clerk**

---

## Gear Profile Data Model

```ts
GearProfile {
  userId: string
  rods: { make: string, lengthFt: number, weightClass: number }[]
  reels: { make: string, lineWeight: number }[]
  lines: { type: 'floating' | 'sink-tip' | 'full-sink', weight: number }[]
  leaders: { material: 'mono' | 'fluoro' | 'furled', lengthFt: number }[]
  tippetSizes: string[]          // e.g. ["4X", "5X", "6X"]
  flyBox: { category: 'dry' | 'nymph' | 'streamer' | 'emerger', patterns: string[] }[]
  wadingSetup: 'wet' | 'waders'
  updatedAt: Date
}
```

---

## AI Agent Personalization Logic

The planner agent must follow this reasoning chain on every trip request:

1. Get user's location (GPS or manual) → find candidate spots within reasonable drive time
2. Pull conditions for each candidate (streamflow, weather, water temp)
3. Cross-check regulations for target dates
4. Load user's gear profile
5. Score each spot against gear profile — flag mismatches, surface strengths
6. Pull hatch data → map to flies the user owns; if no match, suggest what to acquire
7. Rank spots and build day-by-day itinerary with per-spot gear notes
8. Allow user to override any gear assumption per trip before finalizing

---

## Design Tone

- Dark, outdoorsy aesthetic — slate, forest green, river blue
- Data-dense but clean — serious anglers want information density, not fluff
- Mobile-responsive (many users will reference on the river)

---

## Build Order

1. Project scaffolding (Next.js + Tailwind + Supabase + Auth)
2. Gear profile UI + database schema
3. USGS + Weather + Geolocation API integrations with typed wrappers
4. Agentic planner (Claude tool-use agent orchestrating all data sources + gear profile)
5. Spot Finder map with live condition overlays + gear match indicators
6. Community reports (submit + display)
7. Regulations dashboard

---

## Constraints & Non-Negotiables

- Always surface regulation warnings before confirming any itinerary
- Never recommend a spot without checking current streamflow status
- Always explain gear mismatches explicitly — do not silently deprioritize spots
- Community reports older than 14 days should be weighted lower in rankings
- Gear profile overrides per trip must never mutate the saved profile
- Keep all API keys in `.env.local`, never hardcoded
