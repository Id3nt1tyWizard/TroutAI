/**
 * The planner agent loop.
 *
 * A manual (not SDK tool-runner) streaming tool-use loop so we control each
 * step: emit honest start/end events per tool, cap turns, stream itinerary text,
 * and — critically — ENFORCE two non-negotiables in code rather than trusting the
 * model:
 *   1. Streamflow-before-spot: on the initial plan, if the model tries to finish
 *      without ever calling get_stream_conditions, we inject one correction turn
 *      forcing it to check before finalizing.
 *   2. Regulations warning: emitted as a `notice` event in code on the initial
 *      plan, so it is always surfaced regardless of what the model writes.
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

const TOOL_LABELS: Record<string, string> = {
  geocode_place: 'Locating the region',
  get_stream_conditions: 'Checking streamflow',
  get_weather_forecast: 'Pulling the weather forecast',
  get_gear_profile: 'Reading your gear locker',
  check_regulations: 'Checking regulations',
  get_hatch_data: 'Looking up hatches',
}

const toolLabel = (name: string) => TOOL_LABELS[name] ?? `Running ${name}`

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

  // The initial plan is the only turn we enforce streamflow + regs on; later
  // turns are follow-ups that may legitimately not need a fresh check.
  const isInitialPlan = history.filter((m) => m.role === 'user').length === 1
  let streamflowChecked = false
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
        // Enforce streamflow-before-spot: force one correction if the model
        // produced a plan without ever checking flows.
        if (isInitialPlan && !streamflowChecked && !correctionUsed) {
          correctionUsed = true
          messages.push({
            role: 'user',
            content:
              'Before finalizing: you have not called get_stream_conditions for the water(s) you are recommending. Check current streamflow now and revise the plan to reflect the flow status.',
          })
          continue
        }

        // Deterministic regulations warning on the initial plan.
        if (isInitialPlan) {
          yield { type: 'notice', message: REGULATIONS_WARNING }
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
        const { content, isError } = await executeTool(tu.name, tu.input, ctx)
        if (tu.name === 'get_stream_conditions' && !isError) streamflowChecked = true
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
