/**
 * Anthropic API client for the agentic planner (Step 4).
 *
 * Model is pinned to Claude Opus 4.8 (`claude-opus-4-8`) — the most capable
 * model for multi-step tool orchestration, which is what the planner does:
 * geocode → streamflow → weather → gear → regulations, then synthesize a
 * day-by-day itinerary.
 *
 * Note: the original spec named `claude-sonnet-4-20250514`; that model retired
 * 2026-06-15 and now 404s, so it was replaced here. The key is read from the
 * environment (`ANTHROPIC_API_KEY`) — never hardcoded.
 */

import Anthropic from '@anthropic-ai/sdk'

/** Pinned model for the planner agent. */
export const PLANNER_MODEL = 'claude-opus-4-8'

let cached: Anthropic | null = null

/**
 * Lazily construct the shared Anthropic client. Throws a clear error if the API
 * key is missing rather than letting the SDK fail deep in a request — the agent
 * route surfaces this to the user.
 */
export function getAnthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Add it to .env.local to use the planner.'
    )
  }
  if (!cached) cached = new Anthropic()
  return cached
}
