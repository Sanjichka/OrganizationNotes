import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { avatarUrl, displayName, initials } from '../lib/profile'

interface Props {
  user: User
  onClose: () => void
  /** Called with the updated user after a successful save, so the rest of the
   *  app (header avatar and name) reflects the change immediately. */
  onUserChange: (user: User) => void
}

interface Msg {
  text: string
  ok: boolean
}

/**
 * The full profile screen, reached by tapping the header avatar. There is no
 * Save button: the photo uploads the moment it is picked, and the name is
 * written on blur (so leaving the field — including by pressing Back — stores
 * it). Email is shown but not editable here.
 *
 * The photo goes to the `avatars` Storage bucket (see 0002 migration); only its
 * public URL is stored on the auth user. The password change re-authenticates
 * with the current password first, since `updateUser` does not verify it.
 */
export function Profile({ user, onClose, onUserChange }: Props) {
  const savedName = displayName(user)
  const savedEmail = user.email ?? ''

  const [name, setName] = useState(savedName)
  const [preview, setPreview] = useState<string | null>(avatarUrl(user))
  const [uploading, setUploading] = useState(false)
  // Feedback for name/photo saves — errors mostly; success is conveyed by the
  // preview updating and the field keeping its value.
  const [notice, setNotice] = useState<Msg | null>(null)

  const [pwCur, setPwCur] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwConf, setPwConf] = useState('')
  const [pwMsg, setPwMsg] = useState<Msg | null>(null)
  const [savingPw, setSavingPw] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)
  // The object URL currently backing the preview, so we can revoke it.
  const objectUrlRef = useRef<string | null>(null)
  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    },
    [],
  )

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    const localUrl = URL.createObjectURL(file)
    objectUrlRef.current = localUrl
    setPreview(localUrl)
    setNotice(null)
    setUploading(true)
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${user.id}/avatar-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr
      const url = supabase.storage.from('avatars').getPublicUrl(path).data
        .publicUrl
      const { data, error } = await supabase.auth.updateUser({
        data: { avatar_url: url },
      })
      if (error) throw error
      if (data.user) onUserChange(data.user)
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
      setPreview(url)
    } catch (err) {
      const raw = (err as Error).message || 'Could not save photo'
      // The bucket must exist server-side — surface the fix, not the raw error.
      const text = /bucket not found/i.test(raw)
        ? 'Photo storage isn’t set up yet — run the 0002 migration (creates the “avatars” bucket).'
        : raw
      setNotice({ text, ok: false })
      // Roll the preview back to the saved avatar; the pick didn't persist.
      setPreview(avatarUrl(user))
    } finally {
      setUploading(false)
    }
  }

  async function commitName() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === savedName) return
    try {
      const { data, error } = await supabase.auth.updateUser({
        data: { full_name: trimmed },
      })
      if (error) throw error
      if (data.user) onUserChange(data.user)
    } catch (err) {
      setNotice({ text: (err as Error).message || 'Could not save name', ok: false })
    }
  }

  async function savePw(e: React.FormEvent) {
    e.preventDefault()
    if (!pwCur) return setPwMsg({ text: 'Enter your current password', ok: false })
    if (pwNew.length < 6)
      return setPwMsg({
        text: 'New password must be at least 6 characters',
        ok: false,
      })
    if (pwNew !== pwConf)
      return setPwMsg({ text: 'Passwords don’t match', ok: false })

    setSavingPw(true)
    // updateUser({ password }) does not check the old password — re-authenticate
    // first so a walk-up can't change it on an unlocked phone.
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: savedEmail,
      password: pwCur,
    })
    if (authErr) {
      setSavingPw(false)
      return setPwMsg({ text: 'Current password is incorrect', ok: false })
    }
    const { error } = await supabase.auth.updateUser({ password: pwNew })
    setSavingPw(false)
    if (error) return setPwMsg({ text: error.message, ok: false })
    setPwCur('')
    setPwNew('')
    setPwConf('')
    setPwMsg({ text: 'Password updated', ok: true })
  }

  const shownName = name.trim() || savedName

  return (
    <div className="profile">
      <div className="profile-top">
        <button type="button" className="back-btn" onClick={onClose}>
          <span className="back-chevron" aria-hidden="true">
            ‹
          </span>{' '}
          Back
        </button>
      </div>

      <div className="profile-body">
        <input
          type="file"
          accept="image/*"
          ref={fileRef}
          onChange={onPickImage}
          hidden
        />
        <button
          type="button"
          className="avatar-big-wrap"
          onClick={() => fileRef.current?.click()}
          aria-label="Change photo"
        >
          <span
            className="avatar-big"
            style={preview ? { backgroundImage: `url("${preview}")` } : undefined}
          >
            {preview ? '' : initials(shownName)}
          </span>
          <span className="avatar-camera" aria-hidden="true">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </span>
        </button>
        <button
          type="button"
          className="link-btn"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Uploading…' : 'Change photo'}
        </button>

        {notice && (
          <div className={`form-msg${notice.ok ? ' form-msg-ok' : ''}`}>
            {notice.text}
          </div>
        )}

        <div className="field-group">
          <label className="field">
            <span className="field-label">Name</span>
            <input
              className="field-input"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setNotice(null)
              }}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
              autoComplete="name"
            />
          </label>
          <label className="field">
            <span className="field-label">Email</span>
            <input
              className="field-input"
              value={savedEmail}
              readOnly
              disabled
              autoComplete="email"
            />
          </label>
        </div>

        <form className="pw-section" onSubmit={savePw}>
          <div className="pw-heading">Change password</div>
          <PasswordField
            placeholder="Current password"
            value={pwCur}
            autoComplete="current-password"
            onChange={(v) => {
              setPwCur(v)
              setPwMsg(null)
            }}
          />
          <PasswordField
            placeholder="New password"
            value={pwNew}
            autoComplete="new-password"
            onChange={(v) => {
              setPwNew(v)
              setPwMsg(null)
            }}
          />
          <PasswordField
            placeholder="Confirm new password"
            value={pwConf}
            autoComplete="new-password"
            onChange={(v) => {
              setPwConf(v)
              setPwMsg(null)
            }}
          />
          {pwMsg && (
            <div className={`form-msg${pwMsg.ok ? ' form-msg-ok' : ''}`}>
              {pwMsg.text}
            </div>
          )}
          <button type="submit" className="btn btn-wide" disabled={savingPw}>
            {savingPw ? 'Updating…' : 'Update password'}
          </button>
        </form>

        <button
          type="button"
          className="btn-signout"
          onClick={() => supabase.auth.signOut()}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

/** A password input with an eye toggle to reveal or hide the value. */
function PasswordField({
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  autoComplete: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="pw-field">
      <input
        className="field-input pw-input"
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        className="pw-eye"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
      >
        {show ? (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  )
}
