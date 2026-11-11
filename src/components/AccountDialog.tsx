import { useState } from 'react'
import {
  apiEnabled,
  derivePass,
  login,
  logout,
  register,
  setName as apiSetName,
} from '../lib/api'
import { type Identity, newToken } from '../lib/storage'

interface Props {
  identity: Identity
  onChange: (next: Identity) => void
  onClose: () => void
}

/**
 * Display name + optional account. Everyone can set a name; creating an
 * account (username + password, no email) reserves it and carries scores and
 * streaks to other devices.
 */
export function AccountDialog({ identity, onChange, onClose }: Props) {
  const [name, setName] = useState(identity.name)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [form, setForm] = useState<'none' | 'register' | 'login'>('none')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true)
    setMessage('')
    try {
      const err = await fn()
      setMessage(err ?? 'Saved.')
    } finally {
      setBusy(false)
    }
  }

  const saveName = () =>
    run(async () => {
      const trimmed = name.replace(/\s+/g, ' ').trim()
      if (!apiEnabled) {
        onChange({ ...identity, name: trimmed })
        return
      }
      const r = await apiSetName(identity.token, trimmed)
      if (!r.ok) return r.error
      onChange({ ...identity, name: r.name })
      setName(r.name)
    })

  const submitAccount = () =>
    run(async () => {
      if (password.length < 8) return 'Password must be at least 8 characters.'
      const pass = await derivePass(username, password)
      if (form === 'register') {
        const r = await register(identity.token, username, pass)
        if (!r.ok) return r.error
        onChange({
          ...identity,
          name: r.name,
          username: r.username ?? undefined,
        })
        setName(r.name)
      } else {
        const r = await login(username, pass)
        if (!r.ok) return r.error
        onChange({
          token: r.token,
          name: r.name,
          username: r.username ?? undefined,
        })
        setName(r.name)
      }
      setPassword('')
      setForm('none')
      return form === 'register' ? 'Account created.' : 'Signed in.'
    })

  const signOut = () =>
    run(async () => {
      await logout(identity.token)
      // Back to a fresh anonymous identity on this device.
      onChange({ token: newToken(), name: '' })
      setName('')
      return 'Signed out.'
    })

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Your profile"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Your profile</h2>
        <label className="field">
          <span>Display name (shown on the leaderboard)</span>
          <div className="row">
            <input
              type="text"
              value={name}
              maxLength={20}
              placeholder="Anonymous"
              onChange={(e) => setName(e.target.value)}
            />
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={saveName}
            >
              Save
            </button>
          </div>
        </label>

        {apiEnabled &&
          (identity.username ? (
            <div className="account">
              <p>
                Signed in as <strong>{identity.username}</strong>. Your scores
                and streaks follow this account.
              </p>
              <button type="button" disabled={busy} onClick={signOut}>
                Sign out
              </button>
            </div>
          ) : form === 'none' ? (
            <div className="account">
              <p className="muted">
                Optional: an account keeps your name, scores and streaks across
                devices. No email needed — which also means a forgotten password
                can’t be reset.
              </p>
              <div className="row">
                <button type="button" onClick={() => setForm('register')}>
                  Create account
                </button>
                <button type="button" onClick={() => setForm('login')}>
                  Sign in
                </button>
              </div>
            </div>
          ) : (
            <form
              className="account"
              onSubmit={(e) => {
                e.preventDefault()
                void submitAccount()
              }}
            >
              <h3>{form === 'register' ? 'Create account' : 'Sign in'}</h3>
              <label className="field">
                <span>Username</span>
                <input
                  type="text"
                  value={username}
                  maxLength={20}
                  autoComplete="username"
                  autoCapitalize="none"
                  onChange={(e) => setUsername(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  autoComplete={
                    form === 'register' ? 'new-password' : 'current-password'
                  }
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <div className="row">
                <button type="submit" className="primary" disabled={busy}>
                  {form === 'register' ? 'Create account' : 'Sign in'}
                </button>
                <button type="button" onClick={() => setForm('none')}>
                  Cancel
                </button>
              </div>
            </form>
          ))}

        {message && (
          <p className="dialog-message" role="status">
            {message}
          </p>
        )}
        <button type="button" className="quiet close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
