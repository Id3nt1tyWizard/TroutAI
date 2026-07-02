/**
 * Streaming endpoint for the agentic planner.
 *
 * POST a conversation (`{ messages: ApiMessage[] }`); receive NDJSON
 * PlannerEvents as the agent works. The conversation is multi-turn — the client
 * resends the full text history each request and the agent continues from it.
 *
 * Auth uses getUser() (never getSession()) server-side. The gear tool reads the
 * authed user's gear here, resolved from auth.uid(), so the agent can't be
 * steered into another user's locker.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchFullGearProfile } from '@/lib/supabase/gear'
import { streamPlanner, type ToolContext } from '@/lib/anthropic/agent'
import type { ApiMessage } from '@/lib/anthropic/request'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function parseMessages(value: unknown): ApiMessage[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const messages: ApiMessage[] = []
  for (const m of value) {
    if (typeof m !== 'object' || m === null) return null
    const role = (m as Record<string, unknown>).role
    const content = (m as Record<string, unknown>).content
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return null
    messages.push({ role, content })
  }
  // A turn can only be handed to the model when it ends on the angler.
  if (messages[messages.length - 1].role !== 'user') return null
  return messages
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const messages = parseMessages((body as Record<string, unknown>)?.messages)
  if (!messages) {
    return NextResponse.json(
      { error: 'messages must be a non-empty array ending in a user turn' },
      { status: 400 }
    )
  }

  // Gear lookup is scoped to the authed user — the agent never receives an id.
  const ctx: ToolContext = {
    getGearProfile: () => fetchFullGearProfile(supabase, user.id),
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of streamPlanner(messages, ctx)) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Planner stream failed'
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', message }) + '\n'))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
