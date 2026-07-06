/**
 * The planner agent loop.
 *
 * A manual (not SDK tool-runner) streaming tool-use loop so we control each
 * step: emit honest start/end events per tool, cap turns, stream itinerary text,
 * and — critically — ENFORCE two non-negotiables in code rather than trusting the
 * model:
 *   1. Streamflow-before-spot: if the model locates water (geocode) but tries to
 *      finish without a streamflow check that actually returned data, we inject
 *      one correction turn forcing the check. This applies to any turn that
 *      recommends a spot, not just the first — a follow-up like "plan the
 *      Gallatin instead" is enforced too.
 *   2. Regulations warning: emitted as a `notice` event in code the moment the
 *      model starts trip research, so it is always surfaced (and, in the UI,
 *      persists) before any itinerary — regardless of what the model writes.
 *
 * `streamPlanner` takes the full conversation history (text turns) so the planner
 * is multi-turn — the angler can refine or ask follow-ups.
 */

import type Anthropic from '@anthropic-ai/sdk'
import { getAnthropicClient, PLANNER_MODEL } from './client'
import { SYSTEM_PROMPT, REGULATIONS_WARNING } from './prompt'
import { plannerTools, executeTool, type ToolContext } from './tools'
import type { ApiMessage } from './request'
import type { FlyShop, LocalInfo, ReportLink } from '@/lib/local-info'

export type { ApiMessage, PlannerRequest } from './request'
export type { ToolContext } from './tools'

export type PlannerEvent =
  | { type: 'tool_start'; id: string; name: string; label: string }
  | { type: 'tool_end'; id: string; name: string; ok: boolean }
  | { type: 'text'; text: string }
  | { type: 'notice'; message: string }
  /** Stage 6 local info — untrusted display data for the UI, never model input. */
  | { type: 'local_info'; links: ReportLink[] | null; shops: FlyShop[] | null }
  | { type: 'error'; message: string }
  | { type: 'done' }

/** Hard cap on agent turns — defends against a tool loop that never converges. */
const MAX_TURNS = 12

/** Tools that indicate the agent is actively planning a spot (vs. a plain Q&A). */
const TRIP_RESEARCH_TOOLS = new Set([
  'geocode_place',
  'get_stream_conditions',
  'get_weather_forecast',
  'get_hatch_data',
])

/** Injected when the model recommends water without a data-bearing flow check. */
const STREAMFLOW_CORRECTION =
  'Before you finalize: every water you recommend needs current streamflow from get_stream_conditions. Call it now for the recommended water(s) and reflect the flow status. If no gage reports near a spot, widen the search radius or pick gaged water, and tell the angler its flows are unverified.'

const TOOL_LABELS: Record<string, string> = {
  geocode_place: 'Locating the region',
  get_stream_conditions: 'Checking streamflow',
  get_weather_forecast: 'Pulling the weather forecast',
  get_gear_profile: 'Reading your gear locker',
  check_regulations: 'Checking regulations',
  get_hatch_data: 'Looking up hatches',
}

const toolLabel = (name: string) => TOOL_LABELS[name] ?? `Running ${name}`

/** True if a get_stream_conditions result actually carries gage data (not empty). */
function streamflowHasData(content: string): boolean {
  try {
    const d = JSON.parse(content) as { gageCount?: unknown; gages?: unknown }
    if (typeof d.gageCount === 'number') return d.gageCount > 0
    return Array.isArray(d.gages) && d.gages.length > 0
  } catch {
    return false
  }
}

/** Same radius get_stream_conditions defaults to — local info shares the region. */
const LOCAL_INFO_RADIUS_MILES = 25

/**
 * Residual wait for the local-info lookup at finish time. It was kicked off
 * back when the region geocoded (and its HTTP calls are bounded anyway), so
 * this only bites when the model finished unusually fast — and even then the
 * itinerary is already fully streamed. Best-effort: not done in time ⇒ skip.
 */
const LOCAL_INFO_GRACE_MS = 4_000

/** Top geocode hit out of a geocode_place tool result, or null. */
function firstGeocodeHit(
  content: string
): { place: string | null; admin1: string | null; latitude: number; longitude: number } | null {
  try {
    const d = JSON.parse(content) as { results?: Array<Record<string, unknown>> }
    const r = d.results?.[0]
    if (!r || typeof r.latitude !== 'number' || typeof r.longitude !== 'number') return null
    return {
      place: typeof r.name === 'string' ? r.name : null,
      admin1: typeof r.admin1 === 'string' ? r.admin1 : null,
      latitude: r.latitude,
      longitude: r.longitude,
    }
  } catch {
    return null
  }
}

export async function* streamPlanner(
  history: ApiMessage[],
  ctx: ToolContext
): AsyncGenerator<PlannerEvent> {
  let client: Anthropic
  try {
    client = getAnthropicClient()
  } catch (e) {
    yield { type: 'error', message: e instanceof Error ? e.message : 'Planner unavailable' }
    return
  }

  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  // Accumulated across this whole call (which may loop several model turns while
  // tools run). These drive the two in-code guarantees.
  const calledTools = new Set<string>()
  let streamflowReturnedData = false
  let regsNoticeSent = false
  let correctionUsed = false
  // Stage 6 one-shot (the correctionUsed pattern): fired on the first
  // successful geocode of this run, never again — follow-up turns that don't
  // re-locate water don't re-search.
  let localInfoPromise: Promise<LocalInfo | null> | null = null

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const stream = client.messages.stream({
        model: PLANNER_MODEL,
        max_tokens: 32000,
        thinking: { type: 'adaptive' },
        system: SYSTEM_PROMPT,
        tools: plannerTools,
        messages,
      })

      for await (const ev of stream) {
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
          yield { type: 'text', text: ev.delta.text }
        }
      }

      const final = await stream.finalMessage()
      // Preserve the full assistant turn (thinking + tool_use blocks) for the
      // next request — required when continuing a tool-use conversation.
      messages.push({ role: 'assistant', content: final.content })

      if (final.stop_reason === 'refusal') {
        yield {
          type: 'error',
          message: 'The planner declined this request. Try rephrasing your trip details.',
        }
        return
      }

      if (final.stop_reason !== 'tool_use') {
        // Enforce streamflow-before-spot: if the model located water but never
        // got flow data, force one correction before letting it finish.
        const locatedWater = calledTools.has('geocode_place')
        if (locatedWater && !streamflowReturnedData && !correctionUsed) {
          correctionUsed = true
          messages.push({ role: 'user', content: STREAMFLOW_CORRECTION })
          continue
        }
        // Stage 6: surface any local info that came back while the model
        // worked. Bounded residual wait, skipped silently when empty or slow —
        // this must never delay-fail or block the itinerary.
        if (localInfoPromise) {
          let graceTimer: ReturnType<typeof setTimeout> | undefined
          const info = await Promise.race([
            localInfoPromise,
            new Promise<null>((resolve) => {
              graceTimer = setTimeout(() => resolve(null), LOCAL_INFO_GRACE_MS)
            }),
          ])
          clearTimeout(graceTimer)
          if (info && ((info.links?.length ?? 0) > 0 || (info.shops?.length ?? 0) > 0)) {
            yield { type: 'local_info', links: info.links, shops: info.shops }
          }
        }
        yield { type: 'done' }
        return
      }

      const toolUses = final.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      )

      const results: Anthropic.ToolResultBlockParam[] = []
      for (const tu of toolUses) {
        yield { type: 'tool_start', id: tu.id, name: tu.name, label: toolLabel(tu.name) }

        // Surface the regulations warning as soon as trip research begins, so it
        // precedes any itinerary. Once per call; the UI keeps it visible.
        if (TRIP_RESEARCH_TOOLS.has(tu.name) && !regsNoticeSent) {
          regsNoticeSent = true
          yield { type: 'notice', message: REGULATIONS_WARNING }
        }

        const { content, isError } = await executeTool(tu.name, tu.input, ctx)
        calledTools.add(tu.name)
        if (tu.name === 'get_stream_conditions' && !isError && streamflowHasData(content)) {
          streamflowReturnedData = true
        }

        // Stage 6 side-channel: the region is now resolved, so kick off the
        // local shop/guide lookup in the background. Results go straight to
        // the UI at finish time — never into the model's context.
        if (tu.name === 'geocode_place' && !isError && !localInfoPromise && ctx.getLocalInfo) {
          const hit = firstGeocodeHit(content)
          if (hit) {
            localInfoPromise = ctx
              .getLocalInfo({
                latitude: hit.latitude,
                longitude: hit.longitude,
                radiusMiles: LOCAL_INFO_RADIUS_MILES,
                place: hit.place,
                admin1: hit.admin1,
              })
              .catch(() => null)
          }
        }

        yield { type: 'tool_end', id: tu.id, name: tu.name, ok: !isError }
        results.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content,
          is_error: isError,
        })
      }

      messages.push({ role: 'user', content: results })
    }

    yield { type: 'error', message: 'The planner hit its step limit before finishing.' }
  } catch (e) {
    yield { type: 'error', message: e instanceof Error ? e.message : 'Unknown planner error' }
  }
}
