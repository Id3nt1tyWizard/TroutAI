# Trout AI — Claude Code Project Guide

## Overview
Agentic fly-fishing trip planner. Users input dates, region, and species; an AI agent pulls real-time USGS streamflow, weather, hatch data, and state regulations, then produces a gear-matched day-by-day itinerary.

## Stack
- **Framework:** Next.js 16 (App Router, TypeScript)
- **Styling:** Tailwind CSS v4
- **Database + Auth:** Supabase (PostgreSQL + Supabase Auth via `@supabase/ssr`)
- **AI:** Anthropic API (`@anthropic-ai/sdk`) — `claude-opus-4-8` with tool use (the spec's `claude-sonnet-4-20250514` retired 2026-06-15 and now 404s)
- **Map:** Mapbox GL JS via `react-map-gl` (chosen in Step 5; token in `NEXT_PUBLIC_MAPBOX_TOKEN`)

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
    reports/            # Local shop/guide link lookup (live search, Step 6)
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
- Middleware (`middleware.ts`) refreshes the session on every request and guards the `PROTECTED_PREFIXES` routes (`/dashboard`, `/spots`)
- Server components use `src/lib/supabase/server.ts`; client components use `src/lib/supabase/client.ts`
- Never call `getSession()` on the server — always use `getUser()` (authoritative)

## Database
Schema is in `supabase/migrations/`. Apply migrations in order in the Supabase project's SQL editor: `001_initial_schema.sql`, then `002_richer_gear.sql`.

Tables: `gear_profiles`, `rods`, `reels`, `lines`, `leaders`, `fly_boxes`, `flies`, `tippet_spools`, `catch_reports`

Row-level security is enabled on all tables. Users can only read/write their own gear data. Catch reports are publicly readable.

`catch_reports` is dormant as of the Stage 6 scope change below — Stage 6 is now a live shop/guide link lookup, not user submissions, and needs no new table at all (results are ephemeral, like planner itineraries and Spot Finder results). The table stays in the schema unused for now; plan to drop it in a future migration once it's confirmed nothing depends on it.

Migration `002` moved to a granular gear model: `flies` are first-class rows (flat by default, optional `box_id` grouping), `tippet_spools` replaces the old `gear_profiles.tippet_sizes` array, and `fly_boxes` became optional labeled containers. Preset vocabularies live in `src/lib/gear/presets.ts` (globally fixed) — the affected columns are plain TEXT (enum CHECKs relaxed) so users can also type custom values.

## Build Order
1. ✅ Project scaffolding (Next.js + Tailwind + Supabase + Auth)
2. ✅ Gear profile UI + database schema
3. ✅ USGS + Weather + Geolocation API integrations with typed wrappers
4. ✅ Agentic planner (Claude tool-use agent orchestrating all data sources + gear profile)
5. ✅ Spot Finder map with live condition overlays + gear match indicators
6. Local shop/guide info: live report-link search + nearby fly shop directory (map/POI query) — no user submissions, no curated source list, no new table
7. Regulations dashboard

## Non-Negotiables (from spec)
- Always surface regulation warnings before confirming any itinerary
- Never recommend a spot without checking current streamflow status
- Always explain gear mismatches explicitly — never silently deprioritize
- Local shop/guide links older than 14 days (or undated) flagged as unverified/stale, never scored or weighted into rankings
- Trip gear overrides must never mutate the saved profile
- All API keys in `.env.local`, never hardcoded

## Stage 6 Design Notes (planned 2026-07-04, not yet built)

Stage 6 was rescoped from "user-submitted community reports" to two independent, ephemeral pieces. Design decided this session, to apply when Stage 6 is actually implemented:

### 6a. Report Links (live web search)
- **No new table, no persistence.** Results are ephemeral like planner itineraries and Spot Finder results. `catch_reports` stays dormant (see Database section) — do not repurpose it.
- **Reuse the existing geocode/bounding-box**, not a new geocoding call — the planner and Spot Finder already resolve the region and drive-radius for streamflow; the shop/guide search should be scoped to that same bounding box to avoid out-of-range results.
- **Non-blocking, best-effort, one-shot per session** — bounded timeout via the shared `src/lib/http.ts` pattern (AbortController + retry), skip silently on failure/timeout, never block or fail the itinerary/spot search. Fire once per planning/search session, not on every follow-up turn (mirror the `correctionUsed` one-shot pattern in `agent.ts`).
- **Only bounded fields pass through**: title, URL, source name, date (if available), snippet. Never a full-page fetch — keeps the prompt-injection surface small. Returned content is untrusted display data only, never instructions to follow (same discipline as any other tool result).
- **Staleness is disclosed, not filtered**: results older than 14 days, or with no date at all, get an explicit "may be stale — verify before relying on it" label. This is the non-negotiable's mechanism — there's no ranking to weight, so the 14-day rule manifests as a disclosure flag instead.
- **Quality guardrails**: a small, reactively-grown denylist for known spam/content-farm domains, plus a light relevance heuristic (prefer results whose title/snippet names the searched river/region).
- **Always attributed**: "According to *[Shop/Guide Name]*, posted *[date]* → link" — never rendered as the app's own claim.
- **Explicitly out of scope**: no curated per-region source list, no feed/RSS parsing, no structured fields feeding gear-matching or itinerary ranking. (Fly Fish Food's Atom feed, discovered and verified earlier this session, is not being built into a curated backbone — this decision supersedes that direction.)

### 6b. Nearby Fly Shops (map/POI query) — added 2026-07-04
- Separate feature from 6a: a physical shop directory for buying gear or booking a guide in person, not fishing-conditions content.
- Reuses the **existing Mapbox integration** (`NEXT_PUBLIC_MAPBOX_TOKEN`, already used by the Spot Finder map) — query Mapbox's POI/category search for fly shops near the resolved location. No new API key or provider.
- Returns a plain list: shop name, address, distance, phone/website if present in the POI data. No new table, no persistence — ephemeral like everything else in Stage 6.
- Simpler than 6a by nature: structured POI metadata from a maps API, not scraped web content, so there's no prompt-injection surface and no staleness disclaimer to design (an address doesn't go stale like a blog post does).
- Same non-blocking/best-effort convention — a failed or empty POI query just shows nothing, never blocks the rest of the output.

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
- **`/gear` and `/planner` not in middleware matcher:** Middleware guards `PROTECTED_PREFIXES = ['/dashboard', '/spots']` (list added in Stage 5). The gear and planner pages do their own `getUser()` + redirect instead.
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

## Session Decisions Log — Stage 3 (API Integrations)

### Architectural Decisions

**USGS OGC API for real-time, legacy Statistics service for percentiles (dual endpoint)**
Real-time readings + gage discovery use the OGC API (`api.waterdata.usgs.gov/ogcapi/v0`, GeoJSON, keyless). The historical percentile baseline used to classify flow *status* comes from the legacy USGS Statistics service (`waterservices.usgs.gov/nwis/stat`) — the OGC API exposes only raw daily values (statistic `00003` = mean), not pre-computed percentiles. Two endpoints by necessity, not accident.

**`getStreamConditions(bbox)` is the planner-facing aggregator**
Low-level building blocks (`findStreamGages`, `getLatestStreamflow`, `getFlowPercentiles`, `groupReadingsByGage`) stay exposed, but the planner should call `getStreamConditions`, which joins gages + live readings + flow status, drops gages with no current data, and surfaces water temp in °F. This is what satisfies the "never recommend a spot without checking streamflow status" non-negotiable.

**Flow status via USGS WaterWatch percentile bands**
`classifyFlow()` grades current discharge against p10/p25/p50/p75/p90 into much-below / below / normal / above / much-above normal, plus % of median. Same convention USGS WaterWatch uses.

**Supplementary data degrades gracefully, never fails the call**
If the Statistics service is slow/down, `getStreamConditions` returns live readings with `status: null` rather than throwing. The percentile baseline is supplementary; losing it must not lose the real-time data.

**bbox one-shot regional queries**
`latest-continuous` accepts a `bbox`, so current readings for every gage in a region come back in a single request — no per-gage looping. `boundingBox(lat, lon, miles)` from the geo wrapper is the hand-off contract (`{west, south, east, north}`, structurally identical to what USGS expects).

**Shared `src/lib/http.ts` for all external fetches**
One helper with AbortController timeout + bounded retry on transient failures (network error, timeout, 429, 5xx), used by geo, weather, and usgs. The Step 4 agent fans out many calls per trip; a hung upstream must not stall it.

**Wrapper conventions (all three)**
Typed `Raw*` interfaces normalized into clean public interfaces; base URL overridable via env var with a sensible default; throw on non-2xx (so the agent surfaces it); return empty array / null on no-data. Weather additionally pivots Open-Meteo's column-oriented arrays into row-oriented daily records, forces imperial units at the query layer, and decodes WMO codes to plain English.

**Water temperature in the default fetch**
Param `00010` (water temp) is fetched by default alongside discharge/gage-height — it's a top-tier trout variable. Raw readings stay faithful (°C); `getStreamConditions` surfaces a converted °F value.

**Pagination via OGC `next` links**
`fetchFeatures` follows `next` links (capped) so dense regions aren't silently truncated at the page limit.

**Vitest for unit tests**
Added `vitest` + `npm test`. Tests cover pure logic only (no network): flow classification, percentile RDB parsing, °C→°F, bounding-box math, WMO decoding.

---

### Deviations from Spec

- **Geocoding lives in `src/lib/geo/`** — the documented project structure lists only `lib/usgs/` and `lib/weather/` for Step 3. Geocoding got its own directory.
- **USGS env vars renamed** — replaced `USGS_BASE_URL` (legacy waterservices) and `OPEN_METEO_BASE_URL` with the names the code actually reads: `USGS_OGC_BASE_URL`, `USGS_STATS_BASE_URL`, `OPEN_METEO_GEOCODING_BASE_URL`, `OPEN_METEO_FORECAST_BASE_URL`. All optional; wrappers default to them.
- **`npm test` added** — dev commands previously listed only dev/build/lint.
- **`.env.local.example` is now tracked** — added `!.env.local.example` to `.gitignore` to exempt the (placeholder-only) template from the broad `.env*` ignore, so it's shareable. The real `.env.local` stays ignored.

---

### Known Gotchas — Do Not Repeat These Mistakes

**OneDrive transient lock on directory deletion during `git checkout`**
Switching branches prints `Deletion of directory '...' failed` for folders that should be removed (e.g. `src/lib/geo`). Git deletes the *files* fine but can't `rmdir` the now-empty folders while OneDrive holds a handle. Harmless and not data loss — the content is in the other branch. Fix: answer `n`, then `rmdir` the empty dirs once the lock releases. (Same root cause as the documented `.next/static` EPERM gotcha — a different manifestation.)

**`Number('') === 0`, not `NaN`**
Empty cells in the USGS Statistics RDB were parsed as a flow of `0` instead of `null`, skewing status classification. Guard for empty/whitespace strings *before* calling `Number()`. (Caught by a unit test — the reason tests were worth adding.)

**Open-Meteo geocoding is weak on compound and ambiguous names**
`"Madison River, Montana"` returns 0 results (it matches a single place name and ignores the comma); single names can mis-resolve (`"Ennis"` → "Surprise, Arizona"). Disambiguation belongs in the Step 4 planner UX, not the wrapper.

**USGS OGC `value` is a string**
The `value` field comes back as `"1240"`, not a number — parse it.

**GeoJSON coordinates are `[longitude, latitude]`**
Lon first, lat second. Destructure in that order when normalizing gage geometry.

**`waterservices.usgs.gov` (stat host) is slow/flaky**
Connection can exceed undici's default 10s connect timeout — hence the retry + graceful degradation. The OGC host (`api.waterdata.usgs.gov`) is fast by contrast; don't assume both behave the same.

**Git Bash `/tmp` ≠ Windows Python `/tmp`**
A Windows-native exe (e.g. `python`) interprets `/tmp/x` as `C:\tmp\x`, not Git Bash's temp dir. Write temp files in the project cwd when a Windows program will read them back.

**TypeScript TS7022 circular-inference with reassigned loop vars**
`const data = await fetchJson<T>(next, ...)` where `next` is later reassigned from `data.links` triggers "implicitly any / referenced in its own initializer." Fix: annotate the const — `const data: T = await fetchJson(next, ...)`.

**`.env.local.example` had real-looking secrets but was never committed**
The broad `.env*` rule ignored the example file too, so nothing leaked — but it also meant the template wasn't shareable. Scrub real values to placeholders *before* adding the `!.env.local.example` exemption.

**(Reconfirmed) `gh` CLI not installed**
Fell back to the GitHub REST API using the token from `git credential fill`. Works for push + PR creation.

**(Reconfirmed) GitHub branch case sensitivity**
Verified `default_branch` via the API (`main`, lowercase) before creating the PR with `"base": "main"`.

## Session Decisions Log — Stage 4 (Agentic Planner)

### Architectural Decisions

**Model: `claude-opus-4-8`, not the spec's `claude-sonnet-4-20250514`**
The spec model retired 2026-06-15 and now 404s. Opus 4.8 is also the better fit for multi-step tool orchestration (geocode → streamflow → weather → gear → regulations → synthesize). Pinned in `src/lib/anthropic/client.ts` as `PLANNER_MODEL`. Adaptive thinking (`thinking: { type: 'adaptive' }`); no `budget_tokens`/`temperature` (removed on 4.8 — they 400).

**Manual tool-use loop, not the SDK tool-runner**
`streamPlanner` in `src/lib/anthropic/agent.ts` drives the loop by hand so we can (a) emit progress events as each tool fires, (b) cap turns (`MAX_TURNS = 12`) against a non-converging loop, and (c) stream itinerary text as it's produced. The full assistant turn (incl. thinking + tool_use blocks) is pushed back into `messages` each turn — required to continue a tool-use conversation.

**Streaming end-to-end via NDJSON**
A full trip plan can run long; non-streaming risks an SDK HTTP timeout (`max_tokens: 32000`). The agent yields typed `PlannerEvent`s (`tool` | `text` | `error` | `done`); the route (`src/app/api/planner/route.ts`) serializes them as newline-delimited JSON; the client (`PlannerClient.tsx`) parses NDJSON with a buffered reader. NDJSON over SSE for parse simplicity.

**Tools wrap existing Step 3 wrappers; payloads trimmed**
`src/lib/anthropic/tools.ts` exposes `geocode_place`, `get_stream_conditions`, `get_weather_forecast`, `get_gear_profile`, plus two stubs. Each returns a compact camelCase summary (not the raw wrapper payload) to keep token cost down — e.g. `get_stream_conditions` drops raw readings and surfaces name/discharge/flow-status/water-temp per gage.

**`check_regulations` + `get_hatch_data` are stubs (decision: stub now)**
No regulations wrapper exists yet (Step 7) and no hatch source is built. Both return `{ integrated: false, note: ... }`. The system prompt makes the agent surface a prominent manual-verification regulations warning before every itinerary (satisfies the non-negotiable without live data). Replace the stub bodies in Step 7 — the tool names/shapes can stay.

**Gear tool resolves the profile server-side from `auth.uid()`**
The agent never receives a profile id. The route builds a `ToolContext.getGearProfile` closure over the authed Supabase client; `tools.ts` stays Supabase-free (and unit-testable) by depending only on that closure. Same defense-in-depth as the gear actions.

**Itineraries are display-only (decision: no persistence)**
Streamed to the page, no DB write — no schema change. A `trips`/`itineraries` table can be added later if persistence is wanted.

**`vitest.config.ts` added for the `@/` alias**
The planner code imports via `@/lib/...` (idiomatic for the repo). Vitest doesn't read tsconfig `paths`, so a config maps `@` → `./src`. Step 3 tests used only relative imports, so this gap surfaced now.

### Deviations from Spec

- **Model swap** — see above (forced; the spec model is retired).
- **Regulations/hatch stubbed in Step 4** — real regulations data deferred to Step 7 per build order; hatch has no dedicated step. Planner ships with placeholder tools + a hard-coded verification warning.

### Known Gotchas — Stage 4

**Adaptive thinking blocks must be replayed on tool-use turns**
Push the entire `final.content` (thinking + tool_use) back into `messages` before sending tool_results. Stripping thinking blocks breaks the next request. `stream.finalMessage()` gives the complete content to append.

**`max_tokens: 0`/non-stream timeout** — streaming is mandatory at `max_tokens: 32000`; a non-streaming call that large risks the SDK's HTTP timeout. Use `client.messages.stream(...)` + `finalMessage()`.

**Tool inputs arrive as parsed objects** — read `tu.input` as a typed object and coerce defensively (`num`/`str` helpers); never raw-string-match the serialized input (4.x models vary JSON escaping).

**`ANTHROPIC_API_KEY` fails late by default** — `getAnthropicClient()` throws a clear, user-facing error if the key is missing rather than letting the SDK fail deep in a request; the agent surfaces it as an `error` event.

**Spec model was already retired** — `claude-sonnet-4-20250514` retired 2026-06-15 and 404s. Verify model IDs against a current source before coding; don't trust a spec's pinned model string.

**A prompt instruction is not a guarantee for a "never/always" rule** — the model can skip it. Enforce non-negotiables in code (a deterministic `notice` event + a corrective user turn), not just in the system prompt. See the enforcement notes below.

**"Called a tool without error" ≠ "got useful data"** — `get_stream_conditions` returns `isError: false` even with zero gages, so a naive success check silently accepts an empty result. Guard on the payload, not just the error flag.

**Vitest doesn't read tsconfig `paths`** — `@/` imports fail in tests until `vitest.config.ts` maps `@` → `./src` (added this stage). Mocking the agent's collaborators uses `vi.hoisted` + `vi.mock('./client')` / `vi.mock('./tools')` so scripted model turns drive the loop without network or a real SDK.

**Committing alongside concurrent edits** — when work happens in parallel, keep your change set in files the other work isn't touching and stage explicitly (`git add <files>`, never `git add -A`); partial staging of an entangled file is impractical non-interactively. This stage, the enforcement commit was scoped to `agent.ts` + `agent.test.ts` only, because `route.ts`, `tools.ts`, and `CLAUDE.md` were mid-edit for the granular-gear work.

### Stage 4 Revisions (post-review hardening)

**Non-negotiables now enforced in code, not just prompted** — enforcement keys off what the model did *in the turn*, not "is this the first message" (an earlier initial-plan-only gate was itself a bug: conversational follow-ups like "plan the Gallatin instead" bypassed both guarantees).
- *Regulations warning:* emitted deterministically as a `notice` event from `agent.ts` (constant `REGULATIONS_WARNING` in `prompt.ts`) the moment the model starts trip research (any of `geocode_place`/`get_stream_conditions`/`get_weather_forecast`/`get_hatch_data`), so it precedes any itinerary and re-fires on new-spot follow-ups. Rendered as an amber banner the UI keeps visible. The system prompt tells the model NOT to write its own long regs section.
- *Streamflow-before-spot:* if the model located water (`geocode_place`) but tries to finish (`stop_reason !== 'tool_use'`) without a **data-bearing** flow check, the agent injects one corrective user turn forcing the check before allowing `done`. Applies to any spot-recommending turn, not just the initial plan. One-shot (`correctionUsed`) to avoid loops.
- *Empty ≠ checked:* a `get_stream_conditions` call that returns zero gages comes back `isError: false`, so a naive "called && !error" test would falsely count it. `streamflowHasData()` requires `gageCount > 0` / non-empty `gages`; an empty result forces the one correction instead of proceeding blind.

**Agent-loop tests (`agent.test.ts`)**
The enforcement/correction logic is the highest-risk code, so it's unit-tested with `./client` and `./tools` mocked — scripted model turns drive the loop with no network. Covers: correction fires when streamflow is skipped, no double-correction when data was returned, empty-result triggers exactly one correction, one-shot give-up instead of looping, non-planning follow-ups aren't enforced/warned, new-spot follow-ups are, and refusal surfaces as an `error`.

**Hatch data is now real (curated dataset, not a stub)**
`src/lib/hatches/` — a typed month-keyed hatch calendar (19 hatches) assembled from published regional charts, with a West/East split at the ~100th meridian (`regionForLongitude`). `getHatches({month, longitude})` filters by month + region. `get_hatch_data` derives the month from the trip date and longitude from geocode, returns `integrated: true`. Swap the dataset for a live feed later without changing the tool. (Only `check_regulations` remains a stub — real regs are Step 7.)

**Planner is multi-turn / conversational**
`streamPlanner(history, ctx)` takes the full text conversation (`ApiMessage[]`) instead of a one-shot request; the route accepts `{ messages }` and the client resends the whole transcript each turn. Tool blocks are NOT persisted across HTTP requests — only assistant text turns — which keeps the client simple and the history valid (no dangling tool_use). Follow-ups re-call tools as needed. `buildUserPrompt` + `PlannerRequest`/`ApiMessage` moved to `request.ts` (client-safe) so the browser builds the first turn without bundling the system prompt.

**Honest agent-activity log**
Events are now `tool_start` + `tool_end` (with `ok`), not a single fire-on-invoke `tool`. The UI shows each tool call as running → ✓ (success) / ⚠ (failed, retrying), so it never check-marks a step that actually errored and got redone. (The earlier UI marked ✓ the moment a tool was *called*.)

**Smaller itineraries + grounding**
System prompt rewritten for brevity (1–2 sentence conditions summary, tight per-day blocks, no prose/repetition) and honesty ("only state what you actually retrieved from a tool this session") — the latter also curbs the model claiming it did steps it didn't.

**Catch reports: intentionally not a tool**
No `catch_reports` tool (site has no users yet). The 14-day-weighting rule stays as a conditional prompt instruction — applied only if such reports appear in-conversation, never fetched.

### Deviations from Spec (Stage 4 revisions)

- **`src/lib/hatches/`** — hatch data got its own lib directory (like `geo/` in Step 3); the documented structure didn't list one. Curated dataset, not a live API (none exists free).
- **"Real-time hatch data" (Overview) is unachievable** — there is no free live hatch feed, so the planner uses curated-seasonal data with a "confirm with a local fly shop" caveat rather than a real-time source.
- **`vitest.config.ts`** added so tests resolve the `@/` alias.

## Session Decisions Log — Granular Gear Model (migration 002)

### Architectural Decisions

**Flies are first-class rows, flat by default; boxes are optional containers**
Replaced `fly_boxes.patterns TEXT[]` with a `flies` table (one row per fly: pattern, category, hook_size, color, weighted, quantity, imitates, nullable `box_id`). Flat list is the default; sort/group by category/name/size/box is a UI concern over the flat rows (persisted in `gear_profiles.fly_sort`). `fly_boxes` shrank to `{ id, gear_profile_id, label }` and `flies.box_id` is `ON DELETE SET NULL`, so deleting a box never destroys flies — they just go loose.

**Tippet promoted from array to `tippet_spools` table**
`gear_profiles.tippet_sizes TEXT[]` → `tippet_spools` (x_size, material, breaking_lb, low_stock). Tippet is the leader↔fly link; it needed material + stock to be matchable.

**Expanded rod/reel/line/leader columns for matching**
rods +model/action/pieces, reels +model/arbor, lines +taper/sink_ips, leaders +tippet_x. These are the attributes the planner needs to speak concrete gear-match sentences (weight balance, hook-size÷4≈tippet-X, line type vs. depth).

**Globally-fixed presets + custom free text → no DB enums**
Preset vocabularies live in `src/lib/gear/presets.ts` (code-curated, not user-extensible). Because the "custom typed option" requirement means any value is legal, the enum `CHECK` constraints on category/type/material were dropped and those columns are plain TEXT. The UI offers presets via `<input list>` + `<datalist>` (a combobox that still accepts free text). Matching keys off preset values; custom values simply don't participate in automated matching.

**Migration backfills before dropping source columns**
`002` explodes `fly_boxes.patterns` → `flies` rows (keeping the box as container, seeding a label from the old category) and `tippet_sizes` → mono `tippet_spools`, *then* drops the old array columns. Wrapped in a transaction; `DROP POLICY IF EXISTS` before `CREATE POLICY` for re-runnability.

**Planner tool payload updated, gear tool shape changed**
`get_gear_profile` now returns `flies` (with hookSize/imitates/box label) and `tippet` spools instead of `flyBoxes`/`tippetSizes`; description spells out the match axes. `route.ts` and `gear/page.tsx` both fetch the two new tables into `FullGearProfile`.

**Scope: full working cutover, not a backend-only add**
Chosen over an additive/backward-compatible migration. Backend-only would have left an inert `flies` table (the Gear Locker UI is the only write path) or a broken gear page, so the schema, types, actions, planner tool, and frontend were cut over together to keep the app working end-to-end.

**Combobox = native `<input list>` + `<datalist>`**
One control yields preset suggestions + free-text entry — the "basic now, styled-combobox polish later" take on the preset+custom requirement. No custom component or client library.

**Numeric match keys stay strongly typed**
`hook_size` and `weight_class` are INTEGER columns, never baked into a text field, so weight-balance and hook÷4≈tippet-X matching still work even when adjacent text fields (category, type) hold custom values.

**`fly_sort` persisted fire-and-forget**
The flies list holds sort state client-side; `updateFlySort(next).catch(() => {})` persists it via a server action + `revalidatePath`. Sort persistence is non-critical, so a failed write is swallowed and never blocks the UI.

**Matching-rules engine deferred**
The schema supports concrete match sentences and `get_gear_profile` advertises the axes to the model, but no deterministic match logic (balance / hook÷4≈tippet-X / line-type-vs-depth) was built this session — the model reasons over the richer payload for now.

### Deviations from Spec

- **`src/lib/gear/`** — presets got their own lib directory (like `geo/`, `hatches/`); not in the documented structure.
- **Enum CHECK constraints relaxed** — 001 enforced `fly category`, `line type`, `leader material` as DB enums; 002 drops them to allow custom values. The preset list is now app-side only.
- **`LineType` widened** — added `intermediate` to floating/sink-tip/full-sink (001 omitted it). Now a preset in `presets.ts`, not a DB enum.

### Known Gotchas — Granular Gear Model

**`<datalist>` is a suggestion list, not a constraint** — the input accepts any typed value (that's the point). Don't rely on it to validate; the column is free TEXT by design.

**Unchecked checkbox omits its FormData key** — `weighted`/`low_stock` are absent (not `"false"`) when unticked, so the `bool()` helper treats missing as `false`. Correct for add *and* edit (edit re-submits the whole form).

**Blank optional inputs must collapse to `null`** — `str()`/`int()`/`dec()` in `actions.ts` turn `""`/`NaN` into `null` so nullable columns never get empty strings or `NaN`. Required numerics (rod length, weights) still use bare `parseFloat`/`parseInt`.

**Backfill runs once** — re-running `002` re-inserts flies/spools from any still-present arrays; the array columns are dropped at the end of the same transaction, so a second run is a no-op on that front. Safe, but don't re-add the arrays.

**Migrations apply by hand — code fails until then** — `002_richer_gear.sql` must be run in the Supabase SQL editor; the gear page and `get_gear_profile` error against the old tables until it is. Easy to forget right after a clean `npm run build` (the build never touches the DB).

**LF→CRLF line-ending noise inflates `git status`** — on this Windows/OneDrive checkout, files show as modified (`M`) vs HEAD from line endings alone, even ones you never edited. Verify a file's hunks with `git diff` before staging — don't trust the `M` flag. Git prints "LF will be replaced by CRLF" on every touch.

**The repo may be committed to concurrently mid-session** — unrelated work (`agent.ts` + `agent.test.ts`) was committed by an external actor as its own commit *during* this session and appeared pre-staged in the index. Stage by explicit path and verify the staged set before committing — never `git add -A` / `git commit -a` blindly here, or you'll sweep in someone else's changes.

## Session Decisions Log — Stage 5 (Spot Finder Map)

### Architectural Decisions

**Mapbox GL JS via `react-map-gl` v8, not React Leaflet**
The env var was already scaffolded for Mapbox and it handles marker interaction natively. v8 imports from the **subpath** `react-map-gl/mapbox` (not the package root), plus `mapbox-gl/dist/mapbox-gl.css`. Token read from `NEXT_PUBLIC_MAPBOX_TOKEN`; when it's missing the map pane degrades to an instructional placeholder and the spot list below still works — no token required to use the feature.

**A "spot" is a live USGS gage — no new spots table**
`/api/spots` runs geocode → `boundingBox(radius)` → `getStreamConditions(bbox)`; each gage that currently reports data becomes a map marker. `getStreamConditions` already drops gages with no live readings, so "never recommend a spot without checking streamflow" holds *by construction* — an unchecked spot cannot appear. No schema change this stage.

**Deterministic gear matching in `src/lib/gear/matching.ts` (finishes what Stage 4 deferred)**
Pure, no-I/O module: `matchGearToSpot(profile, conditions) → GearMatchReport`. Five axes, each an explicit `MatchFinding` with a plain-language summary (the non-negotiable: mismatches are stated, never silently deprioritized):
- *outfit* — rod `weight_class` vs. line weight vs. reel `line_weight`, ±1 tolerance
- *line-type* — floating vs. sinking against the gage's flow category (high water + floating-only + no weighted flies = explicit mismatch)
- *flies* — user flies vs. the month's active hatches (`imitates` taxon via a hatch-name→taxa map, pattern-name fallback against the hatch's suggested patterns, hook size must fall in the hatch's size range)
- *tippet* — hook-size ÷ 4 ≈ tippet-X (±1X) against hatch size ranges; flags `low_stock` spools the month depends on
- *water-temp* — trout thermal bands; ≥67°F is a mismatch ("don't fish it"), <40°F a caution
`overall` is worst-of (mismatch > partial > good); `info` findings never drag the score. 31 unit tests, no network.

**Gear matching runs server-side in the route**
The API returns finished `GearMatchReport`s; the client only renders them. Profile resolved via `auth.uid()` (same defense-in-depth as everywhere else). Client imports only *types* from the route/matching modules.

**`fetchFullGearProfile` extracted to `src/lib/supabase/gear.ts`**
The profile+7-sub-tables join was already duplicated in `gear/page.tsx` and the planner route; the spots route would have been a third copy. All three call sites now share the helper (takes an authed client + userId, returns `FullGearProfile | null`).

**Middleware guards are now a list**
`middleware.ts` uses `PROTECTED_PREFIXES = ['/dashboard', '/spots']` per the "revisit if more protected routes accumulate" note. `/gear` and `/planner` still do their own page-level `getUser()` checks (unchanged this stage).

**Regulations warning reused, not duplicated**
The route includes `REGULATIONS_WARNING` (imported from `prompt.ts`, server-side only) in its JSON response; the client renders the same amber banner as the planner whenever results are shown. Still a manual-verification notice until Step 7.

**Flow-status marker colors follow the USGS WaterWatch convention**
Red (much below) → orange → green (normal) → sky → blue (much above); slate for gages with no percentile baseline. Same classification the planner uses (`classifyFlow`).

### Deviations from Spec

- **No persistence for spot searches** — results are display-only, like Stage 4 itineraries.
- **Match month is "now"** — the Spot Finder shows *live* conditions, so hatch/tippet matching uses the current month, not a trip date (trip-date matching stays the planner's job).
- **Geocoding restricted to `countryCode: 'US'`** — USGS gages are US-only; this also reduces the known Open-Meteo ambiguity problem. The resolved place name is echoed back in the UI so a mis-resolve is visible.

### Known Gotchas — Stage 5

**`react-map-gl` v8 import path** — `import Map from 'react-map-gl'` no longer works; v8 splits by engine: `react-map-gl/mapbox` (or `/maplibre`). Types like `MapRef` come from the same subpath.

**Importing from a route file into a client component** — `SpotsClient` needs the response types from `app/api/spots/route.ts`. `import type { ... }` is erased at compile time so nothing server-side leaks into the bundle — but a *value* import there would break (and would drag `prompt.ts` etc. into the client). Keep such imports type-only; the same rule that kept `request.ts` client-safe in Stage 4.

**Marker click must stop propagation** — `Marker.onClick` receives the mapbox event; without `e.originalEvent.stopPropagation()` the map's own click handler immediately closes the popup you just opened.

**Popup renders on a light background** — react-map-gl popups sit on Mapbox's white popup chrome inside a dark-themed app; the shared `SpotDetails` component takes a `compact` flag that swaps to dark-on-light text classes. Don't reuse dark-theme text colors inside popups.

**Vitest picks up any `*.test.ts` under `src/`** — a throwaway live smoke test (real network) was written, run once, and deleted in the same command. If a live test must stick around, name it outside the default include glob or gate it behind an env var — otherwise `npm test` becomes network-dependent.

**A smoke test that doesn't assert on *which* result passed on the wrong data** — the Stage 5 live smoke asserted only "geocode returned something + gages exist," and passed while actually searching Surprise, AZ (Open-Meteo ranks by population, so "Ennis" → Surprise AZ > Ennis TX > Ennis MT). Assert on the resolved place itself, not just non-emptiness.

### Stage 5 Revisions (post-review fixes)

- **Geocode disambiguation** — `/api/spots` now geocodes with `count: 5` and returns all `candidates` alongside the top-hit `place`. The client shows a "Not the right place?" chip row; picking a candidate re-searches by `?lat=&lon=` (the coord path already existed) and patches the place label client-side, preserving the candidate list so the user can keep switching. This closes the "Ennis → Surprise, AZ" failure — the wrong default is now a one-click fix.
- **Wet-wading finding** — new `wading` match kind in `matching.ts`: fires only for `wading_setup: 'wet'` with a known water temp (<50°F mismatch, 50–59°F partial, ≥60°F good). Waders never produce a finding — they work in any water, and the absence isn't a silent deprioritization.
- **Gear match on the markers themselves** — marker border color now encodes the match verdict (green/amber/red ring; white when no profile) while the fill stays flow status; legend extended. "Gear match indicators" are now literally on the map, not just in popups.
- Middleware deviation note corrected (was still claiming only `/dashboard` is guarded).

**Deferred past Stage 5 (reviewed, intentionally not built):** weather overlay on the map (planner's job; no spot-finder non-negotiable requires it), `leaders.tippet_x` in the matcher (marginal next to `tippet_spools`), reading-staleness timestamps, spot-list sorting, dashboard card color, route param-parsing tests.