'use client'

import { useState } from 'react'
import Link from 'next/link'
import type {
  FullGearProfile, Rod, Reel, Line, Leader, FlyBox, Fly, TippetSpool, FlySort,
} from '@/types/database'
import {
  FLY_CATEGORIES, LINE_TYPES, LINE_TAPERS, LEADER_MATERIALS, ROD_ACTIONS,
  REEL_ARBORS, TIPPET_X_SIZES, TIPPET_MATERIALS, HOOK_SIZES, HATCH_TAXA, FLY_SORTS,
} from '@/lib/gear/presets'
import {
  updateGearProfile, updateFlySort,
  addRod, updateRod, deleteRod,
  addReel, updateReel, deleteReel,
  addLine, updateLine, deleteLine,
  addLeader, updateLeader, deleteLeader,
  addTippetSpool, updateTippetSpool, deleteTippetSpool,
  addFlyBox, updateFlyBox, deleteFlyBox,
  addFly, updateFly, deleteFly,
  type ActionResult,
} from './actions'

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

function FormButtons({ submitLabel, onCancel }: { submitLabel: string; onCancel: () => void }) {
  return (
    <div className="col-span-2 sm:col-span-3 flex gap-2">
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

// Preset suggestions for every combobox-style field. Inputs reference these via
// `list=`; the field still accepts a custom typed value (columns are plain TEXT).
function Datalists() {
  const lists: [string, readonly (string | number)[]][] = [
    ['dl-fly-category', FLY_CATEGORIES],
    ['dl-hook-size', HOOK_SIZES],
    ['dl-hatch-taxa', HATCH_TAXA],
    ['dl-line-type', LINE_TYPES],
    ['dl-line-taper', LINE_TAPERS],
    ['dl-leader-material', LEADER_MATERIALS],
    ['dl-rod-action', ROD_ACTIONS],
    ['dl-reel-arbor', REEL_ARBORS],
    ['dl-tippet-x', TIPPET_X_SIZES],
    ['dl-tippet-material', TIPPET_MATERIALS],
  ]
  return (
    <>
      {lists.map(([id, opts]) => (
        <datalist key={id} id={id}>
          {opts.map((o) => <option key={String(o)} value={String(o)} />)}
        </datalist>
      ))}
    </>
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
        <label className={cx.label}>Model</label>
        <input name="model" defaultValue={initial?.model ?? ''} placeholder="R8 Core" className={cx.input} />
      </div>
      <div>
        <label className={cx.label}>Length (ft)</label>
        <input name="length_ft" type="number" step="0.5" min="6" max="14" required defaultValue={initial?.length_ft} placeholder="9.0" className={cx.input} />
      </div>
      <div>
        <label className={cx.label}>Weight class</label>
        <input name="weight_class" type="number" min="1" max="16" required defaultValue={initial?.weight_class} placeholder="5" className={cx.input} />
      </div>
      <div>
        <label className={cx.label}>Action</label>
        <input name="action" list="dl-rod-action" defaultValue={initial?.action ?? ''} placeholder="fast" className={cx.input} />
      </div>
      <div>
        <label className={cx.label}>Pieces</label>
        <input name="pieces" type="number" min="1" max="8" defaultValue={initial?.pieces ?? ''} placeholder="4" className={cx.input} />
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
              <th className="px-6 py-2 text-left font-medium">Rod</th>
              <th className="px-6 py-2 text-left font-medium">Length</th>
              <th className="px-6 py-2 text-left font-medium">Weight</th>
              <th className="px-6 py-2 text-left font-medium">Action</th>
              <th className="px-6 py-2" />
            </tr>
          </thead>
          <tbody>
            {rods.map((rod) =>
              s.editingId === rod.id ? (
                <tr key={rod.id} className="bg-slate-800/30">
                  <td colSpan={5} className="p-0">
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
                  <td className="px-6 py-3 text-white">
                    {rod.make}
                    {rod.model && <span className="text-slate-500"> {rod.model}</span>}
                  </td>
                  <td className="px-6 py-3 text-slate-300">{rod.length_ft}′</td>
                  <td className="px-6 py-3 text-slate-300">{rod.weight_class}wt</td>
                  <td className="px-6 py-3 text-slate-400 capitalize">{rod.action ?? '—'}</td>
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
        <label className={cx.label}>Model</label>
        <input name="model" defaultValue={initial?.model ?? ''} placeholder="Seamless" className={cx.input} />
      </div>
      <div>
        <label className={cx.label}>Line weight</label>
        <input name="line_weight" type="number" min="1" max="16" required defaultValue={initial?.line_weight} placeholder="5" className={cx.input} />
      </div>
      <div>
        <label className={cx.label}>Arbor</label>
        <input name="arbor" list="dl-reel-arbor" defaultValue={initial?.arbor ?? ''} placeholder="large" className={cx.input} />
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
              <th className="px-6 py-2 text-left font-medium">Reel</th>
              <th className="px-6 py-2 text-left font-medium">Line weight</th>
              <th className="px-6 py-2 text-left font-medium">Arbor</th>
              <th className="px-6 py-2" />
            </tr>
          </thead>
          <tbody>
            {reels.map((reel) =>
              s.editingId === reel.id ? (
                <tr key={reel.id} className="bg-slate-800/30">
                  <td colSpan={4} className="p-0">
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
                  <td className="px-6 py-3 text-white">
                    {reel.make}
                    {reel.model && <span className="text-slate-500"> {reel.model}</span>}
                  </td>
                  <td className="px-6 py-3 text-slate-300">{reel.line_weight}wt</td>
                  <td className="px-6 py-3 text-slate-400 capitalize">{reel.arbor ?? '—'}</td>
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
        <input name="type" list="dl-line-type" required defaultValue={initial?.type ?? 'floating'} placeholder="floating" className={cx.input} />
      </div>
      <div>
        <label className={cx.label}>Weight</label>
        <input name="weight" type="number" min="1" max="16" required defaultValue={initial?.weight} placeholder="5" className={cx.input} />
      </div>
      <div>
        <label className={cx.label}>Taper</label>
        <input name="taper" list="dl-line-taper" defaultValue={initial?.taper ?? ''} placeholder="WF" className={cx.input} />
      </div>
      <div>
        <label className={cx.label}>Sink rate (ips)</label>
        <input name="sink_ips" type="number" step="0.5" min="0" defaultValue={initial?.sink_ips ?? ''} placeholder="only if sinking" className={cx.input} />
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
              <th className="px-6 py-2 text-left font-medium">Taper</th>
              <th className="px-6 py-2 text-left font-medium">Sink</th>
              <th className="px-6 py-2" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line) =>
              s.editingId === line.id ? (
                <tr key={line.id} className="bg-slate-800/30">
                  <td colSpan={5} className="p-0">
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
                  <td className="px-6 py-3 text-slate-400">{line.taper ?? '—'}</td>
                  <td className="px-6 py-3 text-slate-400">{line.sink_ips != null ? `${line.sink_ips} ips` : '—'}</td>
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
        <input name="material" list="dl-leader-material" required defaultValue={initial?.material ?? 'mono'} placeholder="mono" className={cx.input} />
      </div>
      <div>
        <label className={cx.label}>Length (ft)</label>
        <input name="length_ft" type="number" step="0.5" min="3" max="20" required defaultValue={initial?.length_ft} placeholder="9.0" className={cx.input} />
      </div>
      <div>
        <label className={cx.label}>Tippet end (X)</label>
        <input name="tippet_x" list="dl-tippet-x" defaultValue={initial?.tippet_x ?? ''} placeholder="5X" className={cx.input} />
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
              <th className="px-6 py-2 text-left font-medium">Tippet end</th>
              <th className="px-6 py-2" />
            </tr>
          </thead>
          <tbody>
            {leaders.map((leader) =>
              s.editingId === leader.id ? (
                <tr key={leader.id} className="bg-slate-800/30">
                  <td colSpan={4} className="p-0">
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
                  <td className="px-6 py-3 text-slate-400">{leader.tippet_x ?? '—'}</td>
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

// ─── Tippet spools ───────────────────────────────────────────────────────────

function TippetFields({ initial }: { initial?: TippetSpool }) {
  return (
    <>
      <div>
        <label className={cx.label}>Size (X)</label>
        <input name="x_size" list="dl-tippet-x" required defaultValue={initial?.x_size} placeholder="5X" className={cx.input} />
      </div>
      <div>
        <label className={cx.label}>Material</label>
        <input name="material" list="dl-tippet-material" defaultValue={initial?.material ?? 'mono'} placeholder="mono" className={cx.input} />
      </div>
      <div>
        <label className={cx.label}>Breaking (lb)</label>
        <input name="breaking_lb" type="number" step="0.1" min="0" defaultValue={initial?.breaking_lb ?? ''} placeholder="4.5" className={cx.input} />
      </div>
      <label className="flex items-end gap-2 pb-2 cursor-pointer col-span-2 sm:col-span-1">
        <input type="checkbox" name="low_stock" defaultChecked={initial?.low_stock} className="accent-green-600" />
        <span className="text-sm text-slate-300">Low stock</span>
      </label>
    </>
  )
}

function TippetSection({ spools }: { spools: TippetSpool[] }) {
  const s = useSectionHandlers({ add: addTippetSpool, update: updateTippetSpool, remove: deleteTippetSpool })

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      <SectionHeader title="Tippet" onAdd={s.toggleForm} adding={s.showForm} />
      {s.error && <ErrorBanner message={s.error} onDismiss={() => s.setError(null)} />}
      {spools.length === 0 && !s.showForm && (
        <p className="px-6 py-4 text-slate-500 text-sm">No tippet spools added yet.</p>
      )}
      {spools.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 border-b border-slate-800">
              <th className="px-6 py-2 text-left font-medium">Size</th>
              <th className="px-6 py-2 text-left font-medium">Material</th>
              <th className="px-6 py-2 text-left font-medium">Breaking</th>
              <th className="px-6 py-2 text-left font-medium">Stock</th>
              <th className="px-6 py-2" />
            </tr>
          </thead>
          <tbody>
            {spools.map((spool) =>
              s.editingId === spool.id ? (
                <tr key={spool.id} className="bg-slate-800/30">
                  <td colSpan={5} className="p-0">
                    <form action={(fd) => s.handleUpdate(spool.id, fd)}>
                      <FormRow>
                        <TippetFields initial={spool} />
                        <FormButtons submitLabel="Save changes" onCancel={s.cancelEdit} />
                      </FormRow>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={spool.id} className="border-b border-slate-800/40 last:border-0">
                  <td className="px-6 py-3 text-white">{spool.x_size}</td>
                  <td className="px-6 py-3 text-slate-300 capitalize">{spool.material}</td>
                  <td className="px-6 py-3 text-slate-400">{spool.breaking_lb != null ? `${spool.breaking_lb} lb` : '—'}</td>
                  <td className="px-6 py-3">
                    {spool.low_stock
                      ? <span className="text-xs text-amber-400">Low</span>
                      : <span className="text-xs text-slate-600">OK</span>}
                  </td>
                  <td className="px-6 py-3">
                    <RowActions onEdit={() => s.startEdit(spool.id)} onDelete={() => s.handleDelete(spool.id)} />
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
            <TippetFields />
            <FormButtons submitLabel="Add tippet" onCancel={s.cancelAdd} />
          </FormRow>
        </form>
      )}
    </div>
  )
}

// ─── Flies ───────────────────────────────────────────────────────────────────

function boxLabelOf(boxes: FlyBox[]) {
  const m = new Map(boxes.map((b) => [b.id, b.label ?? 'Untitled box']))
  return (id: string | null) => (id ? m.get(id) ?? 'Unknown box' : 'Loose')
}

function sortFlies(flies: Fly[], sort: FlySort, label: (id: string | null) => string): Fly[] {
  const c = [...flies]
  switch (sort) {
    case 'name':
      return c.sort((a, b) => a.pattern.localeCompare(b.pattern))
    case 'size':
      return c.sort((a, b) => (a.hook_size ?? Infinity) - (b.hook_size ?? Infinity) || a.pattern.localeCompare(b.pattern))
    case 'box':
      return c.sort((a, b) => label(a.box_id).localeCompare(label(b.box_id)) || a.pattern.localeCompare(b.pattern))
    case 'category':
    default:
      return c.sort((a, b) => a.category.localeCompare(b.category) || a.pattern.localeCompare(b.pattern))
  }
}

function FlyFields({ initial, boxes }: { initial?: Fly; boxes: FlyBox[] }) {
  return (
    <>
      <div className="col-span-2 sm:col-span-1">
        <label className={cx.label}>Pattern</label>
        <input name="pattern" required defaultValue={initial?.pattern} placeholder="Parachute Adams" className={cx.input} />
      </div>
      <div>
        <label className={cx.label}>Category</label>
        <input name="category" list="dl-fly-category" required defaultValue={initial?.category ?? 'dry'} placeholder="dry" className={cx.input} />
      </div>
      <div>
        <label className={cx.label}>Hook size</label>
        <input name="hook_size" type="number" list="dl-hook-size" min="1" max="32" defaultValue={initial?.hook_size ?? ''} placeholder="16" className={cx.input} />
      </div>
      <div>
        <label className={cx.label}>Color</label>
        <input name="color" defaultValue={initial?.color ?? ''} placeholder="olive" className={cx.input} />
      </div>
      <div>
        <label className={cx.label}>Quantity</label>
        <input name="quantity" type="number" min="0" defaultValue={initial?.quantity ?? ''} placeholder="—" className={cx.input} />
      </div>
      <div>
        <label className={cx.label}>Imitates</label>
        <input name="imitates" list="dl-hatch-taxa" defaultValue={initial?.imitates ?? ''} placeholder="baetis" className={cx.input} />
      </div>
      <div>
        <label className={cx.label}>Box</label>
        <select name="box_id" defaultValue={initial?.box_id ?? ''} className={cx.select}>
          <option value="">— Loose (no box) —</option>
          {boxes.map((b) => (
            <option key={b.id} value={b.id}>{b.label ?? 'Untitled box'}</option>
          ))}
        </select>
      </div>
      <label className="flex items-end gap-2 pb-2 cursor-pointer">
        <input type="checkbox" name="weighted" defaultChecked={initial?.weighted} className="accent-green-600" />
        <span className="text-sm text-slate-300">Weighted</span>
      </label>
    </>
  )
}

// Optional physical containers. Flies keep their identity when a box is deleted
// (box_id → null), so this is purely organizational.
function FlyBoxManager({ boxes }: { boxes: FlyBox[] }) {
  const s = useSectionHandlers({ add: addFlyBox, update: updateFlyBox, remove: deleteFlyBox })
  const [open, setOpen] = useState(false)

  return (
    <div className="border-t border-slate-800">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-6 py-2.5 text-left text-xs text-slate-500 hover:text-slate-300 transition-colors"
      >
        {open ? '▾' : '▸'} Boxes ({boxes.length})
      </button>
      {open && (
        <div className="px-6 pb-4 space-y-2">
          {s.error && <div className="text-red-300 text-xs">{s.error}</div>}
          {boxes.map((b) =>
            s.editingId === b.id ? (
              <form key={b.id} action={(fd) => s.handleUpdate(b.id, fd)} className="flex gap-2">
                <input name="label" defaultValue={b.label ?? ''} placeholder="Box name" className={cx.input} />
                <button type="submit" className={cx.primaryBtn}>Save</button>
                <button type="button" onClick={s.cancelEdit} className={cx.cancelBtn}>Cancel</button>
              </form>
            ) : (
              <div key={b.id} className="flex items-center justify-between gap-2 text-sm text-slate-300">
                <span>{b.label ?? 'Untitled box'}</span>
                <div className="flex gap-1 shrink-0">
                  <button type="button" onClick={() => s.startEdit(b.id)} className={cx.editBtn}>Rename</button>
                  <form action={() => s.handleDelete(b.id)}>
                    <button type="submit" className={cx.removeBtn}>Delete</button>
                  </form>
                </div>
              </div>
            )
          )}
          {s.showForm ? (
            <form action={s.handleAdd} className="flex gap-2">
              <input name="label" placeholder="New box name" className={cx.input} />
              <button type="submit" className={cx.primaryBtn}>Add</button>
              <button type="button" onClick={s.cancelAdd} className={cx.cancelBtn}>Cancel</button>
            </form>
          ) : (
            <button type="button" onClick={s.toggleForm} className={cx.addBtn}>+ New box</button>
          )}
        </div>
      )}
    </div>
  )
}

function FliesSection({ flies, boxes, initialSort }: { flies: Fly[]; boxes: FlyBox[]; initialSort: FlySort }) {
  const s = useSectionHandlers({ add: addFly, update: updateFly, remove: deleteFly })
  const [sort, setSort] = useState<FlySort>(initialSort)
  const label = boxLabelOf(boxes)
  const sorted = sortFlies(flies, sort, label)

  const onSort = (next: FlySort) => {
    setSort(next)
    updateFlySort(next).catch(() => {})
  }

  const sortLabel: Record<FlySort, string> = {
    category: 'Category',
    name: 'A–Z',
    size: 'Hook size',
    box: 'Box',
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-800">
        <h2 className="text-sm font-semibold text-slate-300">Flies</h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            Sort
            <select
              value={sort}
              onChange={(e) => onSort(e.target.value as FlySort)}
              className="bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-green-600/50"
            >
              {FLY_SORTS.map((o) => (
                <option key={o} value={o}>{sortLabel[o]}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={s.toggleForm} className={cx.addBtn}>
            {s.showForm ? 'Cancel' : '+ Add'}
          </button>
        </div>
      </div>

      {s.error && <ErrorBanner message={s.error} onDismiss={() => s.setError(null)} />}

      {flies.length === 0 && !s.showForm && (
        <p className="px-6 py-4 text-slate-500 text-sm">No flies added yet.</p>
      )}

      {flies.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 border-b border-slate-800">
              <th className="px-6 py-2 text-left font-medium">Pattern</th>
              <th className="px-6 py-2 text-left font-medium">Category</th>
              <th className="px-6 py-2 text-left font-medium">Size</th>
              <th className="px-6 py-2 text-left font-medium">Qty</th>
              <th className="px-6 py-2 text-left font-medium">Box</th>
              <th className="px-6 py-2" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((fly) =>
              s.editingId === fly.id ? (
                <tr key={fly.id} className="bg-slate-800/30">
                  <td colSpan={6} className="p-0">
                    <form action={(fd) => s.handleUpdate(fly.id, fd)}>
                      <FormRow>
                        <FlyFields initial={fly} boxes={boxes} />
                        <FormButtons submitLabel="Save changes" onCancel={s.cancelEdit} />
                      </FormRow>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={fly.id} className="border-b border-slate-800/40 last:border-0">
                  <td className="px-6 py-3 text-white">
                    {fly.pattern}
                    {fly.color && <span className="text-slate-500"> · {fly.color}</span>}
                    {fly.imitates && <span className="text-slate-600"> · {fly.imitates}</span>}
                  </td>
                  <td className="px-6 py-3 text-slate-300 capitalize">{fly.category}</td>
                  <td className="px-6 py-3 text-slate-300">
                    {fly.hook_size ? `#${fly.hook_size}` : '—'}
                    {fly.weighted && <span className="ml-1 text-xs text-sky-500">wt</span>}
                  </td>
                  <td className="px-6 py-3 text-slate-300">{fly.quantity ?? '—'}</td>
                  <td className="px-6 py-3 text-slate-500">{fly.box_id ? label(fly.box_id) : '—'}</td>
                  <td className="px-6 py-3">
                    <RowActions onEdit={() => s.startEdit(fly.id)} onDelete={() => s.handleDelete(fly.id)} />
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
            <FlyFields boxes={boxes} />
            <FormButtons submitLabel="Add fly" onCancel={s.cancelAdd} />
          </FormRow>
        </form>
      )}

      <FlyBoxManager boxes={boxes} />
    </div>
  )
}

// ─── Page root ───────────────────────────────────────────────────────────────

export default function GearPageClient({ profile }: { profile: FullGearProfile }) {
  return (
    <main className="flex-1 px-6 py-10 max-w-3xl mx-auto w-full">
      <Datalists />
      <header className="mb-8">
        <Link href="/dashboard" className="text-slate-500 hover:text-slate-300 text-sm transition-colors inline-block mb-3">
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-white">Gear Locker</h1>
        <p className="text-slate-400 text-sm mt-0.5">Manage your rods, reels, lines, leaders, tippet, and flies.</p>
      </header>

      <div className="space-y-5">
        <ProfileSection profile={profile} />
        <RodsSection rods={profile.rods} />
        <ReelsSection reels={profile.reels} />
        <LinesSection lines={profile.lines} />
        <LeadersSection leaders={profile.leaders} />
        <TippetSection spools={profile.tippet_spools} />
        <FliesSection flies={profile.flies} boxes={profile.fly_boxes} initialSort={profile.fly_sort} />
      </div>
    </main>
  )
}
