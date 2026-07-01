/**
 * Tests for the agent loop's in-code enforcement — the highest-risk logic in the
 * planner. The Anthropic client and tool dispatch are mocked, so scripted model
 * turns drive the loop with no network.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { REGULATIONS_WARNING } from './prompt'
import type { ApiMessage } from './request'

type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input?: Record<string, unknown> }
interface Turn { content: Block[]; stop_reason: string }
interface ToolResult { content: string; isError: boolean }

// Shared, mutable script state the mocks read from (reset per test).
const h = vi.hoisted(() => ({
  turns: [] as Turn[],
  index: 0,
  toolResults: {} as Record<string, ToolResult | ToolResult[]>,
}))

vi.mock('./client', () => ({
  PLANNER_MODEL: 'test-model',
  getAnthropicClient: () => ({
    messages: {
      stream: () => {
        const turn = h.turns[h.index++]
        if (!turn) throw new Error('ran out of scripted turns')
        return {
          async *[Symbol.asyncIterator]() {
            for (const block of turn.content) {
              if (block.type === 'text') {
                yield { type: 'content_block_delta', delta: { type: 'text_delta', text: block.text } }
              }
            }
          },
          async finalMessage() {
            return { content: turn.content, stop_reason: turn.stop_reason }
          },
        }
      },
    },
  }),
}))

vi.mock('./tools', () => ({
  plannerTools: [],
  executeTool: async (name: string): Promise<ToolResult> => {
    const r = h.toolResults[name]
    if (Array.isArray(r)) return r.shift() ?? { content: '{}', isError: false }
    return r ?? { content: '{}', isError: false }
  },
}))

// Import under test AFTER mocks are registered.
import { streamPlanner, type PlannerEvent } from './agent'

const ctx = { getGearProfile: async () => null }

async function collect(history: ApiMessage[]): Promise<PlannerEvent[]> {
  const events: PlannerEvent[] = []
  for await (const e of streamPlanner(history, ctx)) events.push(e)
  return events
}

const startedTools = (evs: PlannerEvent[]) =>
  evs
    .filter((e): e is Extract<PlannerEvent, { type: 'tool_start' }> => e.type === 'tool_start')
    .map((e) => e.name)

const hasNotice = (evs: PlannerEvent[]) =>
  evs.some((e) => e.type === 'notice' && e.message === REGULATIONS_WARNING)

const streamflowOk: ToolResult = { content: JSON.stringify({ gageCount: 2 }), isError: false }
const streamflowEmpty: ToolResult = { content: JSON.stringify({ gageCount: 0, gages: [] }), isError: false }

beforeEach(() => {
  h.turns = []
  h.index = 0
  h.toolResults = {}
})

describe('streamflow-before-spot enforcement', () => {
  it('forces a streamflow check when a plan is produced without one', async () => {
    h.turns = [
      { content: [{ type: 'tool_use', id: 't1', name: 'geocode_place' }], stop_reason: 'tool_use' },
      { content: [{ type: 'text', text: 'here is your plan' }], stop_reason: 'end_turn' },
      { content: [{ type: 'tool_use', id: 't2', name: 'get_stream_conditions' }], stop_reason: 'tool_use' },
      { content: [{ type: 'text', text: 'revised plan' }], stop_reason: 'end_turn' },
    ]
    h.toolResults = { get_stream_conditions: streamflowOk }

    const evs = await collect([{ role: 'user', content: 'plan a trip' }])
    expect(startedTools(evs)).toContain('get_stream_conditions') // correction fired
    expect(hasNotice(evs)).toBe(true)
    expect(evs.at(-1)?.type).toBe('done')
  })

  it('does not re-correct when streamflow already returned data', async () => {
    h.turns = [
      {
        content: [
          { type: 'tool_use', id: 't1', name: 'geocode_place' },
          { type: 'tool_use', id: 't2', name: 'get_stream_conditions' },
        ],
        stop_reason: 'tool_use',
      },
      { content: [{ type: 'text', text: 'plan' }], stop_reason: 'end_turn' },
    ]
    h.toolResults = { get_stream_conditions: streamflowOk }

    const evs = await collect([{ role: 'user', content: 'plan a trip' }])
    expect(startedTools(evs).filter((n) => n === 'get_stream_conditions')).toHaveLength(1)
    expect(hasNotice(evs)).toBe(true)
    expect(evs.at(-1)?.type).toBe('done')
  })

  it('treats an empty streamflow result as unchecked and corrects once', async () => {
    h.turns = [
      { content: [{ type: 'tool_use', id: 't1', name: 'geocode_place' }], stop_reason: 'tool_use' },
      { content: [{ type: 'tool_use', id: 't2', name: 'get_stream_conditions' }], stop_reason: 'tool_use' },
      { content: [{ type: 'text', text: 'plan' }], stop_reason: 'end_turn' },
      { content: [{ type: 'tool_use', id: 't3', name: 'get_stream_conditions' }], stop_reason: 'tool_use' },
      { content: [{ type: 'text', text: 'revised' }], stop_reason: 'end_turn' },
    ]
    // First check comes back empty, second carries data.
    h.toolResults = { get_stream_conditions: [streamflowEmpty, streamflowOk] }

    const evs = await collect([{ role: 'user', content: 'plan a trip' }])
    expect(startedTools(evs).filter((n) => n === 'get_stream_conditions')).toHaveLength(2)
    expect(evs.at(-1)?.type).toBe('done')
  })

  it('gives up after one correction rather than looping forever', async () => {
    h.turns = [
      { content: [{ type: 'tool_use', id: 't1', name: 'geocode_place' }], stop_reason: 'tool_use' },
      { content: [{ type: 'text', text: 'plan' }], stop_reason: 'end_turn' },
      // Model ignores the correction and finishes again with no flow check.
      { content: [{ type: 'text', text: 'still no flows' }], stop_reason: 'end_turn' },
    ]

    const evs = await collect([{ role: 'user', content: 'plan a trip' }])
    expect(evs.at(-1)?.type).toBe('done') // proceeds instead of hanging
  })
})

describe('follow-up turns', () => {
  it('does not enforce or warn on a non-planning follow-up', async () => {
    h.turns = [{ content: [{ type: 'text', text: 'A #16 Parachute Adams.' }], stop_reason: 'end_turn' }]

    const evs = await collect([
      { role: 'user', content: 'plan' },
      { role: 'assistant', content: 'plan text' },
      { role: 'user', content: 'what dry fly did you suggest?' },
    ])
    expect(startedTools(evs)).toHaveLength(0)
    expect(hasNotice(evs)).toBe(false)
    expect(evs.some((e) => e.type === 'text')).toBe(true)
    expect(evs.at(-1)?.type).toBe('done')
  })

  it('enforces streamflow on a follow-up that recommends a new spot', async () => {
    h.turns = [
      { content: [{ type: 'tool_use', id: 't1', name: 'geocode_place' }], stop_reason: 'tool_use' },
      { content: [{ type: 'text', text: 'try the Gallatin' }], stop_reason: 'end_turn' },
      { content: [{ type: 'tool_use', id: 't2', name: 'get_stream_conditions' }], stop_reason: 'tool_use' },
      { content: [{ type: 'text', text: 'Gallatin plan' }], stop_reason: 'end_turn' },
    ]
    h.toolResults = { get_stream_conditions: streamflowOk }

    const evs = await collect([
      { role: 'user', content: 'plan the Madison' },
      { role: 'assistant', content: 'Madison plan' },
      { role: 'user', content: 'plan the Gallatin instead' },
    ])
    expect(startedTools(evs)).toContain('get_stream_conditions')
    expect(hasNotice(evs)).toBe(true)
  })
})

describe('stop reasons', () => {
  it('surfaces a refusal as an error and does not complete', async () => {
    h.turns = [{ content: [{ type: 'text', text: '' }], stop_reason: 'refusal' }]
    const evs = await collect([{ role: 'user', content: '...' }])
    expect(evs.some((e) => e.type === 'error')).toBe(true)
    expect(evs.some((e) => e.type === 'done')).toBe(false)
  })
})
