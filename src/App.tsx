import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { Auth } from './components/Auth'
import { Board } from './components/Board'
import { Stats } from './components/Stats'
import { OverallReview } from './components/OverallReview'
import { Profile } from './components/Profile'
import { type Page } from './components/Tabs'

export function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState<Page>('week')
  // The profile is an overlay over whichever view you were on, not another tab —
  // closing it returns you to the view you opened it from.
  const [showProfile, setShowProfile] = useState(false)

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session)
      })
      .catch((e) => {
        setError(e?.message ?? String(e))
      })
      .finally(() => {
        setReady(true)
      })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (error) {
    return (
      <div className="phone">
        <div className="auth">
          <h1 className="app-title">Orgo</h1>
          <p className="auth-error">Startup error: {error}</p>
        </div>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="phone">
        <div className="status">Loading…</div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="phone">
        <Auth />
      </div>
    )
  }

  const onOpenProfile = () => setShowProfile(true)
  // A profile edit returns the fresh user; merge it into the session so the
  // header avatar and name update at once, without waiting on the auth event.
  const onUserChange = (user: User) =>
    setSession((s) => (s ? { ...s, user } : s))

  return (
    <div className="phone">
      {showProfile ? (
        <Profile
          user={session.user}
          onClose={() => setShowProfile(false)}
          onUserChange={onUserChange}
        />
      ) : page === 'week' || page === 'next' ? (
        // One Board serves both weeks, and deliberately stays mounted across the
        // switch: it already holds every task, so flipping between them is a
        // re-filter rather than a reload.
        <Board
          session={session}
          weekOffset={page === 'next' ? 1 : 0}
          page={page}
          onChange={setPage}
          onOpenProfile={onOpenProfile}
        />
      ) : page === 'review' ? (
        <Stats
          user={session.user}
          page={page}
          onChange={setPage}
          onOpenProfile={onOpenProfile}
        />
      ) : (
        <OverallReview
          user={session.user}
          page={page}
          onChange={setPage}
          onOpenProfile={onOpenProfile}
        />
      )}
    </div>
  )
}
