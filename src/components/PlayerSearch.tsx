import { useState } from 'react'
import type { Player } from '../types'
import {
  canRequest,
  hasPlayer,
  MAX_REQUEST_CHARS,
  searchPlayers,
} from '../lib/playerSearch'
import {
  type ReportContext,
  type SubmitResult,
  playerRequestMessage,
  submitBugReport,
} from '../lib/report'

interface Props {
  players: Player[]
  context: ReportContext
  onClose: () => void
}

/**
 * "Is he in the game?" — search the player list by name; if he isn't there,
 * one tap files a request to add him (a GitHub issue, same route as bug
 * reports). Shows names and leagues only: the college would answer a question.
 */
export function PlayerSearch({ players, context, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  // The request result, tied to the name it was made for.
  const [sent, setSent] = useState<{
    name: string
    result: SubmitResult
  } | null>(null)

  const name = query.replace(/\s+/g, ' ').trim()
  const matches = searchPlayers(players, query)
  const inGame = hasPlayer(players, name)
  const requestable = canRequest(players, name)
  const result = sent?.name === name ? sent.result : null

  const request = async () => {
    setBusy(true)
    const r = await submitBugReport(
      playerRequestMessage(name),
      context,
      false,
      fetch,
      'player',
    )
    setSent({ name, result: r })
    setBusy(false)
  }

  return (
    <div
      className="dialog-backdrop"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Is he in the game?"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Is he in the game?</h2>
        <label className="field">
          <span>
            Search {players.length.toLocaleString('en-US')} players by name
          </span>
          <input
            type="text"
            value={query}
            maxLength={MAX_REQUEST_CHARS}
            placeholder="e.g. Larry Johnson"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>

        {matches.length > 0 && (
          <ul className="player-matches" aria-label="Players in the game">
            {matches.map((p) => (
              <li key={p.id}>
                <span>{p.n}</span>
                <span className="muted">{p.l.toUpperCase()}</span>
              </li>
            ))}
          </ul>
        )}
        {inGame && <p role="status">✅ {name} is in the game.</p>}

        {requestable && !result && (
          <div className="request">
            <p className="muted">
              {matches.length
                ? 'Not the one you meant?'
                : `No player matches “${name}”.`}
            </p>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={request}
            >
              {busy ? 'Sending…' : `Request “${name}”`}
            </button>
          </div>
        )}
        {result?.ok && (
          <p role="status">
            Requested — thanks!{' '}
            {result.url && (
              <a href={result.url} target="_blank" rel="noreferrer">
                View the request
              </a>
            )}
          </p>
        )}
        {result && !result.ok && (
          <p className="dialog-message" role="status">
            Couldn’t send it automatically.{' '}
            <a href={result.fallbackUrl} target="_blank" rel="noreferrer">
              Open a prefilled request on GitHub instead
            </a>
            .
          </p>
        )}

        <button type="button" className="quiet close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
