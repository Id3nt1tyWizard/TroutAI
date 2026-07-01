'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { buildUserPrompt, type ApiMessage } from '@/lib/anthropic/request'

const cx = {
  input:
    'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-600/50',
  label: 'block text-xs font-medium text-slate-400 mb-1',
  primaryBtn:
    'bg-green-700 hover:bg-green-600 disabled:bg-slate-700 disabled:text-slate-400 text-white text-sm px-5 py-2.5 rounded-lg transition-colors',
}

/** One event off the NDJSON stream — mirrors PlannerEvent in agent.ts. */
type PlannerEvent =
  | { type: 'tool_start'; id: string; name: string; label: string }
  | { type: 'tool_end'; id: string; name: string; ok: boolean }
  | { type: 'text'; text: string }
  | { type: 'notice'; message: string }
  | { type: 'error'; message: string }
  | { type: 'done' }

type ActivityStatus = 'running' | 'done' | 'error'
interface ActivityItem {
  id: string
  label: string
  status: ActivityStatus
}

function todayPlus(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export default function PlannerClient() {
  const [startDate, setStartDate] = useState(todayPlus(0))
  const [endDate, setEndDate] = useState(todayPlus(2))
  const [region, setRegion] = useState('')
  const [species, setSpecies] = useState('')
  const [notes, setNotes] = useState('')
  const [followup, setFollowup] = useState('')

  const [turns, setTurns] = useState<ApiMessage[]>([])
  const [streamingText, setStreamingText] = useState('')
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [notices, setNotices] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const started = turns.length > 0

  /** Run one agent turn over the full conversation, streaming events into state. */
  async function run(messages: ApiMessage[]) {
    setRunning(true)
    setError(null)
    setActivity([])
    setStreamingText('')

    const controller = new AbortController()
    abortRef.current = controller
    let assistantText = ''

    const apply = (event: PlannerEvent) => {
      switch (event.type) {
        case 'text':
          assistantText += event.text
          setStreamingText(assistantText)
          break
        case 'tool_start':
          setActivity((a) => [...a, { id: event.id, label: event.label, status: 'running' }])
          break
        case 'tool_end':
          setActivity((a) =>
            a.map((it) => (it.id === event.id ? { ...it, status: event.ok ? 'done' : 'error' } : it))
          )
          break
        case 'notice':
          setNotices((n) => (n.includes(event.message) ? n : [...n, event.message]))
          break
        case 'error':
          setError(event.message)
          break
        case 'done':
          break
      }
    }

    try {
      const res = await fetch('/api/planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? `Request failed (${res.status})`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let nl: number
        while ((nl = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, nl).trim()
          buffer = buffer.slice(nl + 1)
          if (line) apply(JSON.parse(line) as PlannerEvent)
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    } finally {
      if (assistantText.trim()) {
        setTurns((t) => [...t, { role: 'assistant', content: assistantText }])
      }
      setStreamingText('')
      setRunning(false)
      abortRef.current = null
    }
  }

  function handlePlan(e: React.FormEvent) {
    e.preventDefault()
    if (running) return
    const userMsg: ApiMessage = {
      role: 'user',
      content: buildUserPrompt({ startDate, endDate, region, species, notes }),
    }
    const next = [...turns, userMsg]
    setTurns(next)
    run(next)
  }

  function handleFollowup(e: React.FormEvent) {
    e.preventDefault()
    if (running || !followup.trim()) return
    const userMsg: ApiMessage = { role: 'user', content: followup.trim() }
    const next = [...turns, userMsg]
    setTurns(next)
    setFollowup('')
    run(next)
  }

  return (
    <main className="flex-1 px-6 py-10 max-w-3xl mx-auto w-full">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Trip Planner</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Live conditions, your gear, a day-by-day plan.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 text-sm transition-colors"
        >
          Back
        </Link>
      </header>

      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-950/40 border border-red-900/50 text-red-300 text-sm">
          {error}
        </div>
      )}

      {notices.map((message, i) => (
        <div
          key={i}
          className="mb-6 px-4 py-3 rounded-lg bg-amber-950/40 border border-amber-800/50 text-amber-200 text-sm flex gap-2"
        >
          <span aria-hidden>⚠</span>
          <span>{message}</span>
        </div>
      ))}

      {!started && (
        <form onSubmit={handlePlan} className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={cx.label}>Start date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={cx.input} required />
            </div>
            <div>
              <label className={cx.label}>End date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={cx.input} required />
            </div>
            <div>
              <label className={cx.label}>Region or water</label>
              <input type="text" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Ennis, Montana" className={cx.input} required />
            </div>
            <div>
              <label className={cx.label}>Target species</label>
              <input type="text" value={species} onChange={(e) => setSpecies(e.target.value)} placeholder="Brown and rainbow trout" className={cx.input} required />
            </div>
            <div className="sm:col-span-2">
              <label className={cx.label}>Notes (optional)</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Wading only, prefer dry-fly, two anglers" className={cx.input} />
            </div>
          </div>
          <div className="mt-5">
            <button type="submit" disabled={running} className={cx.primaryBtn}>
              {running ? 'Planning…' : 'Build itinerary'}
            </button>
          </div>
        </form>
      )}

      {/* Conversation transcript */}
      <div className="space-y-5">
        {turns.map((turn, i) =>
          turn.role === 'user' ? (
            <UserBubble key={i} text={turn.content} />
          ) : (
            <AssistantBlock key={i} text={turn.content} />
          )
        )}
        {running && streamingText && <AssistantBlock text={streamingText} streaming />}
      </div>

      {(running || activity.length > 0) && (
        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
            Agent activity
          </h2>
          <ul className="space-y-1.5">
            {activity.map((item) => (
              <li key={item.id} className="text-sm flex items-center gap-2">
                <StatusIcon status={item.status} />
                <span className={item.status === 'error' ? 'text-amber-300' : 'text-slate-300'}>
                  {item.label}
                  {item.status === 'error' && ' — failed, retrying'}
                </span>
              </li>
            ))}
            {running && (
              <li className="text-sm text-slate-500 flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Working…
              </li>
            )}
          </ul>
        </div>
      )}

      {started && (
        <form onSubmit={handleFollowup} className="mt-6 flex gap-2">
          <input
            type="text"
            value={followup}
            onChange={(e) => setFollowup(e.target.value)}
            placeholder="Ask a follow-up or refine the plan…"
            disabled={running}
            className={cx.input}
          />
          <button type="submit" disabled={running || !followup.trim()} className={cx.primaryBtn}>
            Send
          </button>
        </form>
      )}
    </main>
  )
}

function StatusIcon({ status }: { status: ActivityStatus }) {
  if (status === 'running')
    return <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" aria-label="running" />
  if (status === 'done') return <span className="text-green-500" aria-label="done">✓</span>
  return <span className="text-amber-400" aria-label="failed">⚠</span>
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3">
      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">You</div>
      <div className="text-slate-200 text-sm whitespace-pre-wrap">{text}</div>
    </div>
  )
}

function AssistantBlock({ text, streaming }: { text: string; streaming?: boolean }) {
  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4">
      <div className="text-[11px] font-semibold text-green-600 uppercase tracking-wide mb-2">
        Planner {streaming && <span className="text-slate-500">· writing…</span>}
      </div>
      <div className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">{text}</div>
    </article>
  )
}
