'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function createProject(formData: FormData) {
  const supabase = await createClient()

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    redirect('/login')
  }

  const { error } = await supabase
    .from('projects')
    .insert({
      name: formData.get('name') as string,
      description: formData.get('description') as string,
      user_id: user.id,
    })

  if (error) {
    return { error: 'Failed to create project' }
  }

  revalidatePath('/dashboard')
  return { success: true }
}

export async function deleteProject(formData: FormData) {
  const supabase = await createClient()
  const projectId = formData.get('projectId') as string

  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)

  if (error) {
    redirect('/error')
  }

  revalidatePath('/dashboard')
} 