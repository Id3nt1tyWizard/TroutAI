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

export async function updateGearProfile(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase
    .from('gear_profiles')
    .update({
      wading_setup: formData.get('wading_setup') as string,
      tippet_sizes: formData.getAll('tippet_sizes') as string[],
    })
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
    make: formData.get('make') as string,
    length_ft: parseFloat(formData.get('length_ft') as string),
    weight_class: parseInt(formData.get('weight_class') as string),
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
      make: formData.get('make') as string,
      length_ft: parseFloat(formData.get('length_ft') as string),
      weight_class: parseInt(formData.get('weight_class') as string),
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
    make: formData.get('make') as string,
    line_weight: parseInt(formData.get('line_weight') as string),
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
      make: formData.get('make') as string,
      line_weight: parseInt(formData.get('line_weight') as string),
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
    type: formData.get('type') as string,
    weight: parseInt(formData.get('weight') as string),
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
      type: formData.get('type') as string,
      weight: parseInt(formData.get('weight') as string),
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
    material: formData.get('material') as string,
    length_ft: parseFloat(formData.get('length_ft') as string),
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
      material: formData.get('material') as string,
      length_ft: parseFloat(formData.get('length_ft') as string),
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

// ─── Fly boxes ───────────────────────────────────────────────────────────────

function parsePatterns(raw: string | null): string[] {
  if (!raw) return []
  return raw.split(',').map((p) => p.trim()).filter(Boolean)
}

export async function addFlyBox(formData: FormData): Promise<ActionResult> {
  const profileId = await getProfileId()
  const supabase = await createClient()
  const { error } = await supabase.from('fly_boxes').insert({
    gear_profile_id: profileId,
    category: formData.get('category') as string,
    patterns: parsePatterns(formData.get('patterns') as string),
  })
  if (error) return { error: error.message }
  revalidatePath('/gear')
  return {}
}

export async function updateFlyBox(id: string, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('fly_boxes')
    .update({
      category: formData.get('category') as string,
      patterns: parsePatterns(formData.get('patterns') as string),
    })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/gear')
  return {}
}

export async function deleteFlyBox(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('fly_boxes').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/gear')
  return {}
}
