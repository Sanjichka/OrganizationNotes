import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { Auth } from './components/Auth'
import { Board } from './components/Board'

export function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <div className="phone">
      {session ? <Board session={session} /> : <Auth />}
    </div>
  )
}
