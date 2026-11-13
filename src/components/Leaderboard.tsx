import { useEffect, useState } from 'react'
import type { Mode, Variant } from '../types'
import {
  MODES,
  MODE_LABEL,
  boardId,
  gameLabel,
  secondDailyName,
} from '../types'
import { type Board, fetchBoard } from '../lib/api'
import { squares } from '../lib/share'

interface Props {
  mode: Mode
  variant?: Variant
  dateKey: string
  token: string
  /** Bumped by the parent when a score or name changed, to refetch. */
  refreshKey?: number
  /** Given on the standalone screen: shows the mode and variant tabs. */
  onModeChange?: (m: Mode, v: Variant) => void
}

/** The day's board for a mode: rank, name, squares, score, streak. */
export function Leaderboard({
  mode,
  variant = 'standard',
  dateKey,
  token,
  refreshKey,
  onModeChange,
}: Props) {
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    fetchBoard(boardId(mode, variant), dateKey, token).then((r) => {
      if (!live) return
      if (r.ok) {
        setBoard({ total: r.total, entries: r.entries })
        setError('')
      } else {
        setBoard(null)
        setError('The leaderboard is unavailable right now.')
      }
    })
    return () => {
      live = false
    }
  }, [mode, variant, dateKey, token, refreshKey])

  // Rank = 1 + number of strictly better scores (ties share a rank).
  const rankOf = (score: number) =>
    1 + (board?.entries.filter((e) => e.score > score).length ?? 0)

  return (
    <section className="board">
      {onModeChange && (
        <div className="tabs" role="tablist">
          {MODES.map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={m === mode}
              className={m === mode ? 'tab on' : 'tab'}
              onClick={() => onModeChange(m, variant)}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      )}
      {onModeChange && (
        <div className="tabs" role="tablist" aria-label="Daily">
          {(['standard', 'beginner'] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={v === variant}
              className={v === variant ? 'tab on' : 'tab'}
              onClick={() => onModeChange(mode, v)}
            >
              {v === 'standard' ? 'Daily' : secondDailyName(dateKey)}
            </button>
          ))}
        </div>
      )}
      <h2>
        {gameLabel(mode, variant, dateKey)} leaderboard{' '}
        <span className="muted">{dateKey}</span>
      </h2>
      {error && <p className="muted">{error}</p>}
      {board && board.entries.length === 0 && (
        <p className="muted">Nobody has finished today yet. Be the first.</p>
      )}
      {board && board.entries.length > 0 && (
        <>
          <ol className="board-rows">
            {board.entries.map((e, i) => (
              <li key={i} className={e.you ? 'you' : undefined}>
                <span className="rank">{rankOf(e.score)}</span>
                <span className="who">
                  {e.name}
                  {e.you && <span className="muted"> (you)</span>}
                </span>
                <span className="sq">{squares(e.marks)}</span>
                <span className="pts">{e.score}</span>
                <span className="fire">
                  {e.streak > 1 ? `🔥${e.streak}` : ''}
                </span>
              </li>
            ))}
          </ol>
          <p className="muted small">
            {board.total} player{board.total === 1 ? '' : 's'} today
          </p>
        </>
      )}
    </section>
  )
}
