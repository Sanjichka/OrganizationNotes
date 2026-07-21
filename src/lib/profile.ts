import type { User } from '@supabase/supabase-js'

// Profile identity is read from Supabase auth: the name and avatar live in the
// user's metadata, the email on the user itself. No separate profile table —
// these are the fields `supabase.auth.updateUser` already owns.

export function displayName(user: User): string {
  const name = (user.user_metadata?.full_name as string | undefined)?.trim()
  if (name) return name
  const email = user.email ?? ''
  return email ? email.split('@')[0] : 'You'
}

export function avatarUrl(user: User): string | null {
  const url = (user.user_metadata?.avatar_url as string | undefined)?.trim()
  return url || null
}

/** Up to two initials from a name, for the fallback avatar. */
export function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
  return letters.toUpperCase() || '?'
}
