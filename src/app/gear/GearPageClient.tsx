'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { FullGearProfile, Rod, Reel, Line, Leader, FlyBox } from '@/types/database'
import {
  updateGearProfile,
  addRod, updateRod, deleteRod,
  addReel, updateReel, deleteReel,
  addLine, updateLine, deleteLine,
  addLeader, updateLeader, deleteLeader,
  addFlyBox, updateFlyBox, deleteFlyBox,
  type ActionResult,
} from './actions'

const TIPPET_SIZES = ['0X', '1X', '2X', '3X', '4X', '5X', '6X', '7X']

const cx = {
  input: 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-600/50',
  select: 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-600/50',
  label: 'block text-xs font-medium text-slate-400 mb-1',
  primaryBtn: 'bg-green-700 hover:bg-green-600 text-white text-sm px-4 py-2 rounded-lg transition-colors',
  cancelBtn: 'border border-slate-700 text-slate-400 hover:text-slate-200 text-sm px-4 py-2 rounded-lg transition-colors',
  removeBtn: 'text-slate-600 hover:text-red-400 transition-colors text-xs px-2 py-1',
  editBtn: 'text-slate-600 hover:text-sky-400 transition-colors text-xs px-2 py-1',
  addBtn: 'text-sky-400 hover:text-sky-300 text-sm transition-colors',
}

// ─── Shared shell ────────────────────────────────────────────────────────────

function SectionHeader({ title, onAdd, adding }: { title: string; onAdd: () => void; adding: boolean }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
      <h2 className="text-sm font-semibold text-slate-300">{title}</h2>
      <button type="button" onClick={onAdd} className={cx.addBtn}>
        {adding ? 'Cancel' : '+ Add'}
      </button>
    </div>
  )
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="mx-6 mt-3 px-3 py-2 rounded-lg bg-red-950/40 border border-red-900/50 text-red-300 text-xs flex items-start justify-between gap-3">
      <span>{message}</span>
      <button type="button" onClick={onDismiss} className="text-red-400/70 hover:text-red-300 shrink-0">✕</button>
    </div>
  )
}

function FormRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-6 py-4 border-t border-slate-800 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {children}
    </div>
  )
}

function FormButtons({ submitLabel, onCancel, span = 3 }: { submitLabel: string; onCancel: () => void; span?: number }) {
  const cls = span === 3 ? 'col-span-2 sm:col-span-3 flex gap-2' : 'col-span-2 sm:col-span-1 flex items-end gap-2'
  return (
    <div className={cls}>
      <button type="submit" className={cx.primaryBtn}>{submitLabel}</button>
      <button type="button" onClick={onCancel} className={cx.cancelBtn}>Cancel</button>
    </div>
  )
}

// Shared add/edit/delete state + error wiring used by every gear section.
function useSectionHandlers(actions: {
  add: (fd: FormData) => Promise<ActionResult>
  update: (id: string, fd: FormData) => Promise<ActionResult>
  remove: (id: string) => Promise<ActionResult>
}) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleAdd = async (fd: FormData) => {
    setError(null)
    const res = await actions.add(fd)
    if (res?.error) setError(res.error)
    else setShowForm(false)
  }
  const handleUpdate = async (id: string, fd: FormData) => {
    setError(null)
    const res = await actions.update(id, fd)
    if (res?.error) setError(res.error)
    else setEditingId(null)
  }
  const handleDelete = async (id: string) => {
    setError(null)
    const res = await actions.remove(id)
    if (res?.error) setError(res.error)
  }

  const toggleForm = () => {
    setError(null)
    setEditingId(null)
    setShowForm((v) => !v)
  }
  const startEdit = (id: string) => {
    setError(null)
    setShowForm(false)
    setEditingId(id)
  }

  return {
    showForm, editingId, error,
    setError,
    toggleForm, startEdit, cancelEdit: () => setEditingId(null), cancelAdd: () => setShowForm(false),
    handleAdd, handleUpdate, handleDelete,
  }
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-end gap-1">
      <button type="button" onClick={onEdit} className={cx.editBtn}>Edit</button>
      <form action={onDelete}>
        <button type="submit" className={cx.removeBtn}>Remove</button>
      </form>
    </div>
  )
}

// ─── Profile basics ──────────────────────────────────────────────────────────

function ProfileSection({ profile }: { profile: FullGearProfile }) {
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const handleSave = async (fd: FormData) => {
    setError(null)
    setSaved(false)
    const res = await updateGearProfile(fd)
    if (res?.error) setError(res.error)
    else setSaved(true)
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
      <h2 className="text-sm font-semibold text-slate-300 mb-5">Profile basics</h2>
      <form action={handleSave} className="space-y-5">
        <div>
          <span className={cx.label}>Wading setup</span>
          <div className="flex gap-5">
            {(['waders', 'wet'] as const).map((opt) => (
              <label key={opt} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="wading_setup"
                  value={opt}
                  defaultChecked={profile.wading_setup === opt}
                  className="accent-green-600"
                />
                <span className="text-sm text-slate-300">
                  {opt === 'wet' ? 'Wet wading' : 'Waders'}
                </span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <span className={cx.label}>Tippet sizes</span>
          <div className="flex flex-wrap gap-4">
            {TIPPET_SIZES.map((size) => (
              <label key={size} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  name="tippet_sizes"
                  value={size}
                  defaultChecked={profile.tippet_sizes.includes(size)}
                  className="accent-green-600"
                />
                <span className="text-sm text-slate-300">{size}</span>
              </label>
            ))}
          </div>
        </div>
        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-950/40 border border-red-900/50 text-red-300 text-xs">
            {error}
          </div>
        )}
        <div className="flex items-center gap-3">
          <button type="submit" className={cx.primaryBtn}>Save profile</button>
          {saved && !error && <span className="text-xs text-green-500">Saved.</span>}
        </div>
      </form>
    </div>
  )
}

// ─── Rods ────────────────────────────────────────────────────────────────────

function RodFields({ initial }: { initial?: Rod }) {
  return (
    <>
      <div>
        <label className={cx.label}>Make</label>
        <input name="make" required defaultValue={initial?.make} placeholder="Sage, Orvis…" className={cx.input} />
      </div>
      <div>
        <label className={cx.label}>Length (ft)</label>
        <input name="length_ft" type="number" step="0.5" min="6" max="14" required defaultValue={initial?.length_ft} placeholder="9.0" className={cx.input} />
      </div>
      <div>
        <label className={cx.label}>Weight class</label>
        <input name="weight_class" type="number" min="1" max="16" required defaultValue={initial?.weight_class} placeholder="5" className={cx.input} />
      </div>
    </>
  )
}

function RodsSection({ rods }: { rods: Rod[] }) {
  const s = useSectionHandlers({ add: addRod, update: updateRod, remove: deleteRod })

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      <SectionHeader title="Rods" onAdd={s.toggleForm} adding={s.showForm} />
      {s.error && <ErrorBanner message={s.error} onDismiss={() => s.setError(null)} />}
      {rods.length === 0 && !s.showForm && (
        <p className="px-6 py-4 text-slate-500 text-sm">No rods added yet.</p>
      )}
      {rods.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 border-b border-slate-800">
              <th className="px-6 py-2 text-left font-medium">Make</th>
              <th className="px-6 py-2 text-left font-medium">Length</th>
              <th className="px-6 py-2 text-left font-medium">Weight</th>
              <th className="px-6 py-2" />
            </tr>
          </thead>
          <tbody>
            {rods.map((rod) =>
              s.editingId === rod.id ? (
                <tr key={rod.id} className="bg-slate-800/30">
                  <td colSpan={4} className="p-0">
                    <form action={(fd) => s.handleUpdate(rod.id, fd)}>
                      <FormRow>
                        <RodFields initial={rod} />
                        <FormButtons submitLabel="Save changes" onCancel={s.cancelEdit} />
                      </FormRow>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={rod.id} className="border-b border-slate-800/40 last:border-0">
                  <td className="px-6 py-3 text-white">{rod.make}</td>
                  <td className="px-6 py-3 text-slate-300">{rod.length_ft}′</td>
                  <td className="px-6 py-3 text-slate-300">{rod.weight_class}wt</td>
                  <td className="px-6 py-3">
                    <RowActions onEdit={() => s.startEdit(rod.id)} onDelete={() => s.handleDelete(rod.id)} />
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      )}
      {s.showForm && (
        <form action={s.handleAdd}>
          <FormRow>
            <RodFields />
            <FormButtons submitLabel="Add rod" onCancel={s.cancelAdd} />
          </FormRow>
        </form>
      )}
    </div>
  )
}

// ─── Reels ───────────────────────────────────────────────────────────────────

function ReelFields({ initial }: { initial?: Reel }) {
  return (
    <>
      <div>
        <label className={cx.label}>Make</label>
        <input name="make" required defaultValue={initial?.make} placeholder="Abel, Hatch…" className={cx.input} />
      </div>
      <div>
        <label className={cx.label}>Line weight</label>
        <input name="line_weight" type="number" min="1" max="16" required defaultValue={initial?.line_weight} placeholder="5" className={cx.input} />
      </div>
    </>
  )
}

function ReelsSection({ reels }: { reels: Reel[] }) {
  const s = useSectionHandlers({ add: addReel, update: updateReel, remove: deleteReel })

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      <SectionHeader title="Reels" onAdd={s.toggleForm} adding={s.showForm} />
      {s.error && <ErrorBanner message={s.error} onDismiss={() => s.setError(null)} />}
      {reels.length === 0 && !s.showForm && (
        <p className="px-6 py-4 text-slate-500 text-sm">No reels added yet.</p>
      )}
      {reels.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 border-b border-slate-800">
              <th className="px-6 py-2 text-left font-medium">Make</th>
              <th className="px-6 py-2 text-left font-medium">Line weight</th>
              <th className="px-6 py-2" />
            </tr>
          </thead>
          <tbody>
            {reels.map((reel) =>
              s.editingId === reel.id ? (
                <tr key={reel.id} className="bg-slate-800/30">
                  <td colSpan={3} className="p-0">
                    <form action={(fd) => s.handleUpdate(reel.id, fd)}>
                      <FormRow>
                        <ReelFields initial={reel} />
                        <FormButtons submitLabel="Save changes" onCancel={s.cancelEdit} />
                      </FormRow>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={reel.id} className="border-b border-slate-800/40 last:border-0">
                  <td className="px-6 py-3 text-white">{reel.make}</td>
                  <td className="px-6 py-3 text-slate-300">{reel.line_weight}wt</td>
                  <td className="px-6 py-3">
                    <RowActions onEdit={() => s.startEdit(reel.id)} onDelete={() => s.handleDelete(reel.id)} />
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      )}
      {s.showForm && (
        <form action={s.handleAdd}>
          <FormRow>
            <ReelFields />
            <FormButtons submitLabel="Add reel" onCancel={s.cancelAdd} />
          </FormRow>
        </form>
      )}
    </div>
  )
}

// ─── Lines ───────────────────────────────────────────────────────────────────

function LineFields({ initial }: { initial?: Line }) {
  return (
    <>
      <div>
        <label className={cx.label}>Type</label>
        <select name="type" required defaultValue={initial?.type ?? 'floating'} className={cx.select}>
          <option value="floating">Floating</option>
          <option value="sink-tip">Sink-tip</option>
          <option value="full-sink">Full-sink</option>
        </select>
      </div>
      <div>
        <label className={cx.label}>Weight</label>
        <input name="weight" type="number" min="1" max="16" required defaultValue={initial?.weight} placeholder="5" className={cx.input} />
      </div>
    </>
  )
}

function LinesSection({ lines }: { lines: Line[] }) {
  const s = useSectionHandlers({ add: addLine, update: updateLine, remove: deleteLine })

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      <SectionHeader title="Lines" onAdd={s.toggleForm} adding={s.showForm} />
      {s.error && <ErrorBanner message={s.error} onDismiss={() => s.setError(null)} />}
      {lines.length === 0 && !s.showForm && (
        <p className="px-6 py-4 text-slate-500 text-sm">No lines added yet.</p>
      )}
      {lines.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 border-b border-slate-800">
              <th className="px-6 py-2 text-left font-medium">Type</th>
              <th className="px-6 py-2 text-left font-medium">Weight</th>
              <th className="px-6 py-2" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line) =>
              s.editingId === line.id ? (
                <tr key={line.id} className="bg-slate-800/30">
                  <td colSpan={3} className="p-0">
                    <form action={(fd) => s.handleUpdate(line.id, fd)}>
                      <FormRow>
                        <LineFields initial={line} />
                        <FormButtons submitLabel="Save changes" onCancel={s.cancelEdit} />
                      </FormRow>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={line.id} className="border-b border-slate-800/40 last:border-0">
                  <td className="px-6 py-3 text-white capitalize">{line.type.replace('-', ' ')}</td>
                  <td className="px-6 py-3 text-slate-300">{line.weight}wt</td>
                  <td className="px-6 py-3">
                    <RowActions onEdit={() => s.startEdit(line.id)} onDelete={() => s.handleDelete(line.id)} />
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      )}
      {s.showForm && (
        <form action={s.handleAdd}>
          <FormRow>
            <LineFields />
            <FormButtons submitLabel="Add line" onCancel={s.cancelAdd} />
          </FormRow>
        </form>
      )}
    </div>
  )
}

// ─── Leaders ─────────────────────────────────────────────────────────────────

function LeaderFields({ initial }: { initial?: Leader }) {
  return (
    <>
      <div>
        <label className={cx.label}>Material</label>
        <select name="material" required defaultValue={initial?.material ?? 'mono'} className={cx.select}>
          <option value="mono">Mono</option>
          <option value="fluoro">Fluorocarbon</option>
          <option value="furled">Furled</option>
        </select>
      </div>
      <div>
        <label className={cx.label}>Length (ft)</label>
        <input name="length_ft" type="number" step="0.5" min="3" max="20" required defaultValue={initial?.length_ft} placeholder="9.0" className={cx.input} />
      </div>
    </>
  )
}

function LeadersSection({ leaders }: { leaders: Leader[] }) {
  const s = useSectionHandlers({ add: addLeader, update: updateLeader, remove: deleteLeader })

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      <SectionHeader title="Leaders" onAdd={s.toggleForm} adding={s.showForm} />
      {s.error && <ErrorBanner message={s.error} onDismiss={() => s.setError(null)} />}
      {leaders.length === 0 && !s.showForm && (
        <p className="px-6 py-4 text-slate-500 text-sm">No leaders added yet.</p>
      )}
      {leaders.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 border-b border-slate-800">
              <th className="px-6 py-2 text-left font-medium">Material</th>
              <th className="px-6 py-2 text-left font-medium">Length</th>
              <th className="px-6 py-2" />
            </tr>
          </thead>
          <tbody>
            {leaders.map((leader) =>
              s.editingId === leader.id ? (
                <tr key={leader.id} className="bg-slate-800/30">
                  <td colSpan={3} className="p-0">
                    <form action={(fd) => s.handleUpdate(leader.id, fd)}>
                      <FormRow>
                        <LeaderFields initial={leader} />
                        <FormButtons submitLabel="Save changes" onCancel={s.cancelEdit} />
                      </FormRow>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={leader.id} className="border-b border-slate-800/40 last:border-0">
                  <td className="px-6 py-3 text-white capitalize">{leader.material}</td>
                  <td className="px-6 py-3 text-slate-300">{leader.length_ft}′</td>
                  <td className="px-6 py-3">
                    <RowActions onEdit={() => s.startEdit(leader.id)} onDelete={() => s.handleDelete(leader.id)} />
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      )}
      {s.showForm && (
        <form action={s.handleAdd}>
          <FormRow>
            <LeaderFields />
            <FormButtons submitLabel="Add leader" onCancel={s.cancelAdd} />
          </FormRow>
        </form>
      )}
    </div>
  )
}

// ─── Fly boxes ───────────────────────────────────────────────────────────────

function FlyBoxFields({ initial }: { initial?: FlyBox }) {
  return (
    <>
      <div>
        <label className={cx.label}>Category</label>
        <select name="category" required defaultValue={initial?.category ?? 'dry'} className={cx.select}>
          <option value="dry">Dry</option>
          <option value="nymph">Nymph</option>
          <option value="streamer">Streamer</option>
          <option value="emerger">Emerger</option>
        </select>
      </div>
      <div className="col-span-1 sm:col-span-2">
        <label className={cx.label}>Patterns (comma-separated)</label>
        <input
          name="patterns"
          defaultValue={initial?.patterns.join(', ')}
          placeholder="Elk Hair Caddis, PMD, Adams…"
          className={cx.input}
        />
      </div>
    </>
  )
}

function FlyBoxesSection({ flyBoxes }: { flyBoxes: FlyBox[] }) {
  const s = useSectionHandlers({ add: addFlyBox, update: updateFlyBox, remove: deleteFlyBox })

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      <SectionHeader title="Fly boxes" onAdd={s.toggleForm} adding={s.showForm} />
      {s.error && <ErrorBanner message={s.error} onDismiss={() => s.setError(null)} />}
      {flyBoxes.length === 0 && !s.showForm && (
        <p className="px-6 py-4 text-slate-500 text-sm">No fly boxes added yet.</p>
      )}
      {flyBoxes.length > 0 && (
        <div className="divide-y divide-slate-800/40">
          {flyBoxes.map((box) =>
            s.editingId === box.id ? (
              <form key={box.id} action={(fd) => s.handleUpdate(box.id, fd)} className="bg-slate-800/30">
                <FormRow>
                  <FlyBoxFields initial={box} />
                  <FormButtons submitLabel="Save changes" onCancel={s.cancelEdit} />
                </FormRow>
              </form>
            ) : (
              <div key={box.id} className="px-6 py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <span className="text-sm text-white capitalize">{box.category}</span>
                  {box.patterns.length > 0 && (
                    <p className="text-xs text-slate-500 mt-0.5 break-words">{box.patterns.join(', ')}</p>
                  )}
                </div>
                <div className="shrink-0">
                  <RowActions onEdit={() => s.startEdit(box.id)} onDelete={() => s.handleDelete(box.id)} />
                </div>
              </div>
            )
          )}
        </div>
      )}
      {s.showForm && (
        <form action={s.handleAdd}>
          <FormRow>
            <FlyBoxFields />
            <FormButtons submitLabel="Add fly box" onCancel={s.cancelAdd} />
          </FormRow>
        </form>
      )}
    </div>
  )
}

// ─── Page root ───────────────────────────────────────────────────────────────

export default function GearPageClient({ profile }: { profile: FullGearProfile }) {
  return (
    <main className="flex-1 px-6 py-10 max-w-3xl mx-auto w-full">
      <header className="mb-8">
        <Link href="/dashboard" className="text-slate-500 hover:text-slate-300 text-sm transition-colors inline-block mb-3">
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-white">Gear Locker</h1>
        <p className="text-slate-400 text-sm mt-0.5">Manage your rods, reels, lines, leaders, and fly boxes.</p>
      </header>

      <div className="space-y-5">
        <ProfileSection profile={profile} />
        <RodsSection rods={profile.rods} />
        <ReelsSection reels={profile.reels} />
        <LinesSection lines={profile.lines} />
        <LeadersSection leaders={profile.leaders} />
        <FlyBoxesSection flyBoxes={profile.fly_boxes} />
      </div>
    </main>
  )
}
