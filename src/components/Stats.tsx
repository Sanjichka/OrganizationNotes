import { supabase } from '../lib/supabase'

// Intentionally empty for now — the weekly review lives here later.
export function Stats() {
  return (
    <div className="board">
      <header className="app-header">
        <div>
          <h1 className="app-title">Orgo</h1>
        </div>
        <div className="week-pct-wrap">
          <button
            className="signout"
            onClick={() => supabase.auth.signOut()}
            type="button"
          >
            Sign out
          </button>
        </div>
      </header>
    </div>
  )
}
