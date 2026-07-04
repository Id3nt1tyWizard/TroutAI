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
  - Best-effort, non-blocking live search for nearby fly shop/guide reports, surfaced as unverified informational links (never parsed into ranking)
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
- Each pin shows: current streamflow status, water temp, regulation summary, gear match indicator (green/yellow/red based on user's profile), and (where found) live-searched nearby shop/guide report links + a nearby fly shop directory entry
- Filter by species, access type (walk-in, wade, boat), and difficulty

### 5. Local Shop/Guide Info (Live Lookup + Nearby Shops)
Two independent, ephemeral (non-persisted) pieces — no user-submitted catch reports, no curated/parsed source list:

**5a. Report Links (live web search)**
- A live, best-effort search for fly shop/guide content near the location the user is already searching (reusing the same geocoded region + drive-radius the planner and Spot Finder already compute for streamflow), returning a small set of links
- Purely informational — a link, source name, date (if available), and snippet. Never parsed into structured fields, never fed into gear-matching or itinerary ranking
- Always labeled as unverified: dated results older than 14 days (or undated results) get an explicit "may be stale — verify before relying on it" flag rather than being scored or weighted
- Non-blocking by design: bounded timeout, one attempt per planning/search session, degrades silently (no result shown) if the search fails or times out — never blocks or fails the itinerary or spot search
- Guardrails: query is geographically constrained (same bounding box as streamflow lookups) to avoid out-of-range results; only bounded fields (title/url/date/snippet) are passed through, never a full page fetch, to limit prompt-injection surface; returned content is treated as untrusted display data only, never as instructions; a small denylist filters known spam/content-farm domains
- Always attributed clearly ("According to *[Shop/Guide Name]*, posted *[date]* → link") — never presented as the app's own claim

**5b. Nearby Fly Shops (map/POI query)**
- A simple map-based point-of-interest query (reusing the existing Mapbox integration/token from the Spot Finder) for physical fly shops near the searched location — for buying gear or booking a guide in person, not fishing conditions/intel
- Returns a plain list: shop name, address, distance, and phone/website if available from the POI data
- Structured location data from a maps API, not scraped content — no staleness disclaimer needed (an address doesn't go stale the way a blog post does), no prompt-injection concerns
- Non-blocking/best-effort like everything else in this section; shown wherever it fits alongside the report links — no dedicated UI required

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
| Gear profiles (Postgres) | User gear locker data |
| Live web search (fly shop/guide content near searched region) | Unverified informational links only — not parsed, not ranked |
| Mapbox POI/category search (reusing existing Mapbox token) | Nearby fly shop directory (name, address, distance) for gear/guide access |
| State regulation data | Season dates, rules (scrape or static JSON per state) |
| Browser Geolocation API | User's current position for proximity sorting |

---

## Architecture Guidelines

- Use **Next.js App Router** with server components for data fetching where possible
- Use **server actions** for form submissions (trip requests, gear profile saves)
- Store user data and gear profiles in **PostgreSQL** (Supabase recommended). Local shop/guide report links and the nearby fly shop directory are both live and ephemeral — not persisted, same display-only convention as planner itineraries and Spot Finder results
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
6. Local shop/guide info: live report-link search + nearby fly shop directory (map/POI query) — no user submissions, no curated source list
7. Regulations dashboard

---

## Constraints & Non-Negotiables

- Always surface regulation warnings before confirming any itinerary
- Never recommend a spot without checking current streamflow status
- Always explain gear mismatches explicitly — do not silently deprioritize spots
- Local shop/guide links older than 14 days (or undated) must be flagged as unverified/stale, never scored or weighted into rankings
- Gear profile overrides per trip must never mutate the saved profile
- Keep all API keys in `.env.local`, never hardcoded
