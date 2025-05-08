'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function login(formData: FormData) {
  const supabase = await createClient()

  // type-casting here for convenience
  // in practice, you should validate your inputs
  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }
  console.log('[Login Action] Attempting to sign in with email:', data.email);

  const { error, data: authData } = await supabase.auth.signInWithPassword(data)
  console.log('[Login Action] Supabase signInWithPassword result:', { error, authData });

  if (error) {
    console.error('[Login Action] Supabase signInWithPassword error:', error);
    redirect('/login?error=AuthenticationFailed')
  }

  revalidatePath('/', 'layout')
  console.log('[Login Action] Redirecting to /dashboard');
  redirect('/dashboard')
}

export async function signup(formData: FormData) {
  const supabase = await createClient()

  // type-casting here for convenience
  // in practice, you should validate your inputs
  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  const { error } = await supabase.auth.signUp(data)

  if (error) {
    redirect('/error')
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
} 