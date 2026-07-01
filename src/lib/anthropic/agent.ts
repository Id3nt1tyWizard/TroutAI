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

export type { ApiMessage, PlannerRequest } from './request'
export type { ToolContext } from './tools'

export type PlannerEvent =
  | { type: 'tool_start'; id: string; name: string; label: string }
  | { type: 'tool_end'; id: string; name: string; ok: boolean }
  | { type: 'text'; text: string }
  | { type: 'notice'; message: string }
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
