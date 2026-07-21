import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { DAY_BUCKETS } from '../lib/buckets'
import { openShade } from '../lib/shading'

// The week's seven hues at full weight — the same gradient the board reads as,
// so the sign-in screen carries the app's identity before any data has loaded.
// Colours come from the one shared shading formula, never hardcoded here.
const WEEK_HUES = DAY_BUCKETS.map((b) => openShade(b, 0, 1).background)

export function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setBusy(false)
    if (error) setError(error.message)
  }

  async function sendMagicLink() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <div className="auth">
      <div className="auth-brand">
        <div className="auth-week" aria-hidden="true">
          {WEEK_HUES.map((c, i) => (
            <span
              key={i}
              className="auth-week-bar"
              style={{ background: c }}
            />
          ))}
        </div>
        <h1 className="app-title">Orgo</h1>
        <p className="auth-tagline">Your week, one glance.</p>
      </div>

      {sent ? (
        <div className="auth-sent">
          <p className="auth-note">
            Check <strong>{email}</strong> for a magic link, then open it on this
            device.
          </p>
          <button
            type="button"
            className="signout"
            onClick={() => setSent(false)}
          >
            ← back to sign in
          </button>
        </div>
      ) : (
        <form onSubmit={signInWithPassword} className="auth-form">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            autoComplete="email"
          />
          <input
            type="password"
            required
            placeholder="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            autoComplete="current-password"
          />
          <button className="btn" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <button
            type="button"
            className="signout"
            disabled={busy}
            onClick={sendMagicLink}
          >
            or email me a magic link instead
          </button>
          {error && <p className="auth-error">{error}</p>}
        </form>
      )}
    </div>
  )
}
