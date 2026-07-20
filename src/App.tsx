import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { Auth } from './components/Auth'
import { Board } from './components/Board'
import { Stats } from './components/Stats'
import { Tabs, type Page } from './components/Tabs'

export function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState<Page>('tasks')

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

  return (
    <div className="phone">
      {page === 'tasks' ? <Board session={session} /> : <Stats />}
      <Tabs page={page} onChange={setPage} />
    </div>
  )
}
