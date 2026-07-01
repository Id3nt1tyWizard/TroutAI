'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type ActionResult = { error?: string }

async function getProfileId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase
    .from('gear_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!data) throw new Error('Gear profile not found')
  return data.id
}

// ─── FormData coercion helpers ─────────────────────────────────────────────────
// Optional text/number fields collapse blank input to null so we never write ""
// or NaN into nullable columns.

function str(v: FormDataEntryValue | null): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}
function reqStr(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : ''
}
function int(v: FormDataEntryValue | null): number | null {
  const s = str(v)
  if (s === null) return null
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}
function dec(v: FormDataEntryValue | null): number | null {
  const s = str(v)
  if (s === null) return null
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}
function bool(v: FormDataEntryValue | null): boolean {
  return v === 'on' || v === 'true'
}

// ─── Profile ────────────────────────────────────────────────────────────────

export async function updateGearProfile(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase
    .from('gear_profiles')
    .update({ wading_setup: formData.get('wading_setup') as string })
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/gear')
  return {}
}

/** Persist the angler's preferred fly-list sort (category | name | size | box). */
export async function updateFlySort(sort: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase
    .from('gear_profiles')
    .update({ fly_sort: sort })
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/gear')
  return {}
}

// ─── Rods ────────────────────────────────────────────────────────────────────

export async function addRod(formData: FormData): Promise<ActionResult> {
  const profileId = await getProfileId()
  const supabase = await createClient()
  const { error } = await supabase.from('rods').insert({
    gear_profile_id: profileId,
    make: reqStr(formData.get('make')),
    model: str(formData.get('model')),
    length_ft: parseFloat(formData.get('length_ft') as string),
    weight_class: parseInt(formData.get('weight_class') as string),
    action: str(formData.get('action')),
    pieces: int(formData.get('pieces')),
  })
  if (error) return { error: error.message }
  revalidatePath('/gear')
  return {}
}

export async function updateRod(id: string, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('rods')
    .update({
      make: reqStr(formData.get('make')),
      model: str(formData.get('model')),
      length_ft: parseFloat(formData.get('length_ft') as string),
      weight_class: parseInt(formData.get('weight_class') as string),
      action: str(formData.get('action')),
      pieces: int(formData.get('pieces')),
    })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/gear')
  return {}
}

export async function deleteRod(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('rods').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/gear')
  return {}
}

// ─── Reels ───────────────────────────────────────────────────────────────────

export async function addReel(formData: FormData): Promise<ActionResult> {
  const profileId = await getProfileId()
  const supabase = await createClient()
  const { error } = await supabase.from('reels').insert({
    gear_profile_id: profileId,
    make: reqStr(formData.get('make')),
    model: str(formData.get('model')),
    line_weight: parseInt(formData.get('line_weight') as string),
    arbor: str(formData.get('arbor')),
  })
  if (error) return { error: error.message }
  revalidatePath('/gear')
  return {}
}

export async function updateReel(id: string, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('reels')
    .update({
      make: reqStr(formData.get('make')),
      model: str(formData.get('model')),
      line_weight: parseInt(formData.get('line_weight') as string),
      arbor: str(formData.get('arbor')),
    })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/gear')
  return {}
}

export async function deleteReel(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('reels').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/gear')
  return {}
}

// ─── Lines ───────────────────────────────────────────────────────────────────

export async function addLine(formData: FormData): Promise<ActionResult> {
  const profileId = await getProfileId()
  const supabase = await createClient()
  const { error } = await supabase.from('lines').insert({
    gear_profile_id: profileId,
    type: reqStr(formData.get('type')),
    weight: parseInt(formData.get('weight') as string),
    taper: str(formData.get('taper')),
    sink_ips: dec(formData.get('sink_ips')),
  })
  if (error) return { error: error.message }
  revalidatePath('/gear')
  return {}
}

export async function updateLine(id: string, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('lines')
    .update({
      type: reqStr(formData.get('type')),
      weight: parseInt(formData.get('weight') as string),
      taper: str(formData.get('taper')),
      sink_ips: dec(formData.get('sink_ips')),
    })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/gear')
  return {}
}

export async function deleteLine(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('lines').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/gear')
  return {}
}

// ─── Leaders ─────────────────────────────────────────────────────────────────

export async function addLeader(formData: FormData): Promise<ActionResult> {
  const profileId = await getProfileId()
  const supabase = await createClient()
  const { error } = await supabase.from('leaders').insert({
    gear_profile_id: profileId,
    material: reqStr(formData.get('material')),
    length_ft: parseFloat(formData.get('length_ft') as string),
    tippet_x: str(formData.get('tippet_x')),
  })
  if (error) return { error: error.message }
  revalidatePath('/gear')
  return {}
}

export async function updateLeader(id: string, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('leaders')
    .update({
      material: reqStr(formData.get('material')),
      length_ft: parseFloat(formData.get('length_ft') as string),
      tippet_x: str(formData.get('tippet_x')),
    })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/gear')
  return {}
}

export async function deleteLeader(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('leaders').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/gear')
  return {}
}

// ─── Tippet spools ─────────────────────────────────────────────────────────────

export async function addTippetSpool(formData: FormData): Promise<ActionResult> {
  const profileId = await getProfileId()
  const supabase = await createClient()
  const { error } = await supabase.from('tippet_spools').insert({
    gear_profile_id: profileId,
    x_size: reqStr(formData.get('x_size')),
    material: reqStr(formData.get('material')) || 'mono',
    breaking_lb: dec(formData.get('breaking_lb')),
    low_stock: bool(formData.get('low_stock')),
  })
  if (error) return { error: error.message }
  revalidatePath('/gear')
  return {}
}

export async function updateTippetSpool(id: string, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('tippet_spools')
    .update({
      x_size: reqStr(formData.get('x_size')),
      material: reqStr(formData.get('material')) || 'mono',
      breaking_lb: dec(formData.get('breaking_lb')),
      low_stock: bool(formData.get('low_stock')),
    })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/gear')
  return {}
}

export async function deleteTippetSpool(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('tippet_spools').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/gear')
  return {}
}

// ─── Fly boxes (optional containers) ─────────────────────────────────────────

export async function addFlyBox(formData: FormData): Promise<ActionResult> {
  const profileId = await getProfileId()
  const supabase = await createClient()
  const { error } = await supabase.from('fly_boxes').insert({
    gear_profile_id: profileId,
    label: str(formData.get('label')),
  })
  if (error) return { error: error.message }
  revalidatePath('/gear')
  return {}
}

export async function updateFlyBox(id: string, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('fly_boxes')
    .update({ label: str(formData.get('label')) })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/gear')
  return {}
}

// Deleting a box leaves its flies intact (box_id ON DELETE SET NULL → loose flies).
export async function deleteFlyBox(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('fly_boxes').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/gear')
  return {}
}

// ─── Flies ───────────────────────────────────────────────────────────────────

function flyValues(formData: FormData) {
  return {
    pattern: reqStr(formData.get('pattern')),
    category: reqStr(formData.get('category')),
    hook_size: int(formData.get('hook_size')),
    color: str(formData.get('color')),
    weighted: bool(formData.get('weighted')),
    quantity: int(formData.get('quantity')),
    imitates: str(formData.get('imitates')),
    box_id: str(formData.get('box_id')),
  }
}

export async function addFly(formData: FormData): Promise<ActionResult> {
  const profileId = await getProfileId()
  const supabase = await createClient()
  const { error } = await supabase.from('flies').insert({
    gear_profile_id: profileId,
    ...flyValues(formData),
  })
  if (error) return { error: error.message }
  revalidatePath('/gear')
  return {}
}

export async function updateFly(id: string, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('flies').update(flyValues(formData)).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/gear')
  return {}
}

export async function deleteFly(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('flies').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/gear')
  return {}
}
