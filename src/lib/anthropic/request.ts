/**
 * Client-safe planner request types + the opening-message builder.
 *
 * Kept separate from `prompt.ts` (which holds the server-only system prompt) so
 * the browser can format the first user turn without pulling the system prompt
 * into the client bundle.
 */

export interface PlannerRequest {
  /** ISO date (YYYY-MM-DD) the trip starts */
  startDate: string
  /** ISO date (YYYY-MM-DD) the trip ends */
  endDate: string
  /** Free-text region or water, e.g. "Ennis, Montana" */
  region: string
  /** Target species, e.g. "brown and rainbow trout" */
  species: string
  /** Optional extra context from the angler */
  notes?: string
}

/** A single conversation turn exchanged with the planner. */
export interface ApiMessage {
  role: 'user' | 'assistant'
  content: string
}

/** Build the opening user message from the trip form. */
export function buildUserPrompt(req: PlannerRequest): string {
  const today = new Date().toISOString().slice(0, 10)
  const lines = [
    `Today's date is ${today}.`,
    '',
    'Plan a fly-fishing trip with these details:',
    `- Dates: ${req.startDate} to ${req.endDate}`,
    `- Region / water: ${req.region}`,
    `- Target species: ${req.species}`,
  ]
  if (req.notes?.trim()) lines.push(`- Angler notes: ${req.notes.trim()}`)
  return lines.join('\n')
}
