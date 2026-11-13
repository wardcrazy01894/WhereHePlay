import { useEffect, useMemo, useState } from 'react'
import type { Mode, Player, School, Variant } from '../types'
import { boardId, gameLabel } from '../types'
import {
  QUESTIONS_PER_DAY,
  dailyLineup,
  eligibleOn,
  puzzleNumber,
} from '../lib/daily'
import {
  type QuestionState,
  MAX_QUESTION_POINTS,
  newQuestion,
  totalPoints,
} from '../lib/game'
import {
  type DailyGame as Saved,
  type Identity,
  type PhotoStyle,
  bumpStats,
  liveStreak,
  loadDaily,
  loadStats,
  saveDaily,
  saveStats,
} from '../lib/storage'
import { type Standing, apiEnabled, submitScore } from '../lib/api'
import { marks, shareText, squares } from '../lib/share'
import { QuestionCard } from './QuestionCard'
import { Leaderboard } from './Leaderboard'

interface Props {
  players: Player[]
  schools: School[]
  mode: Mode
  /** The daily, or the second one — Sicko Mode (its own save, streak and board). */
  variant: Variant
  dateKey: string
  /** False for ?date= playtest days: nothing is recorded or submitted. */
  official: boolean
  identity: Identity
  photoStyle: PhotoStyle
  onNeedName: () => void
}

/** Resolve a saved game against the dataset, or start today's fresh. */
function startGame(
  players: Player[],
  mode: Mode,
  dateKey: string,
  photo: PhotoStyle,
  variant: Variant,
): Saved {
  const saved = loadDaily(mode, dateKey, variant)
  // A dataset update may have changed today's lineup after this player
  // started: keep THEIR lineup as long as every player in it can still be
  // asked — he exists and has both his photos that day.
  const askable = new Set(eligibleOn(players, dateKey).map((p) => p.id))
  if (
    saved &&
    saved.lineup.length === QUESTIONS_PER_DAY &&
    saved.questions.length === QUESTIONS_PER_DAY &&
    saved.lineup.every((id) => askable.has(id))
  )
    return saved
  return {
    mode,
    // Left off a standard game, so its saved shape is what it always was.
    ...(variant === 'beginner' ? { variant } : {}),
    dateKey,
    // The first-photo choice is fixed when the day starts, so the share card
    // can say truthfully which way it was played.
    photo,
    lineup: dailyLineup(players, mode, dateKey, variant).map((p) => p.id),
    questions: Array.from({ length: QUESTIONS_PER_DAY }, newQuestion),
  }
}

export function DailyGame(props: Props) {
  const { players, schools, mode, dateKey, official, identity, photoStyle } =
    props
  const { variant } = props
  const board = boardId(mode, variant)
  const label = gameLabel(mode, variant, dateKey)
  const [game, setGame] = useState<Saved>(() =>
    startGame(players, mode, dateKey, photoStyle, variant),
  )
  // Which question is on screen. Starts at the first unanswered one.
  const [index, setIndex] = useState(() => {
    const i = game.questions.findIndex((q) => !q.done)
    return i === -1 ? QUESTIONS_PER_DAY : i
  })
  const [standing, setStanding] = useState<Standing | null>(null)
  const [copied, setCopied] = useState(false)
  const [boardKey, setBoardKey] = useState(0)

  const lineup = useMemo(() => {
    const byId = new Map(players.map((p) => [p.id, p]))
    return game.lineup.map((id) => byId.get(id)!)
  }, [players, game.lineup])

  // How this day is being played (older saves have no record: use the setting).
  const played = game.photo ?? photoStyle
  const finished = game.questions.every((q) => q.done)
  const total = totalPoints(game.questions)
  const showResults = finished && index >= QUESTIONS_PER_DAY

  const update = (i: number, q: QuestionState) => {
    // Another tab may have synced this day in as finished on another device
    // while this one sat on a question. That result is the one the server
    // keeps, so show it rather than overwrite it with answers typed here.
    const stored = official ? loadDaily(mode, dateKey, variant) : undefined
    if (stored?.synced && stored.questions.every((x) => x.done)) {
      setGame(stored)
      setIndex(QUESTIONS_PER_DAY)
      return
    }
    const questions = game.questions.map((x, j) => (j === i ? q : x))
    const next = {
      ...game,
      questions,
      // A finished day belongs to the account signed in when it ended.
      ...(identity.username && questions.every((x) => x.done)
        ? { owner: identity.username }
        : {}),
    }
    setGame(next)
    if (official) saveDaily(next)
    if (official && next.questions.every((x) => x.done)) {
      // Finishing records the day once (bumpStats ignores a repeat).
      saveStats(
        board,
        bumpStats(loadStats(board), dateKey, totalPoints(next.questions)),
      )
    }
  }

  // Send the finished day to the leaderboard (idempotent server-side: the
  // first result stands), and retry on a later visit if it didn't get through.
  useEffect(() => {
    if (!finished || !official || !apiEnabled) return
    // A day that belongs to an account is only ever sent as that account:
    // signing out, or in as someone else, with the results on screen must
    // not post it under the new identity (same rule as src/lib/sync.ts).
    if (game.owner && game.owner !== identity.username) return
    const { username } = identity
    let live = true
    submitScore({
      token: identity.token,
      board,
      date: dateKey,
      score: total,
      marks: marks(game.questions),
    }).then((r) => {
      if (!live || !r.ok) return
      setStanding({ rank: r.rank, total: r.total, streak: r.streak })
      setBoardKey((k) => k + 1)
      // Accepted under an account: from now on the day is that account's.
      const claim = username && !game.owner ? { owner: username } : {}
      if (!game.submitted || claim.owner) {
        const done = { ...game, submitted: true, ...claim }
        setGame(done)
        saveDaily(done)
      }
    })
    return () => {
      live = false
    }
    // Only when the day completes or the identity changes: a sign-in (new
    // token) or creating an account (same token, new username — the day
    // must be stamped as that account's).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, identity.token, identity.username])

  const stats = loadStats(board)
  const streak = Math.max(
    liveStreak(stats, dateKey),
    standing?.streak?.current ?? 0,
  )

  const share = async () => {
    const url = window.location.origin + import.meta.env.BASE_URL
    const text = shareText(mode, dateKey, game.questions, url, played, variant)
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent))
        await navigator.share({ text })
      else {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch {
      // Share sheet dismissed or clipboard blocked — nothing to do.
    }
  }

  if (showResults) {
    return (
      <div className="results">
        <h2>
          {label} #{puzzleNumber(dateKey)}
        </h2>
        <div className="big-score">
          {total}
          <span className="muted">
            {' '}
            / {QUESTIONS_PER_DAY * MAX_QUESTION_POINTS}
          </span>
        </div>
        <div className="big-squares" aria-label="Result by question">
          {squares(marks(game.questions))}
        </div>
        {!official && <p className="muted">Practice day — not recorded.</p>}
        {game.synced && (
          <p className="muted small">Played on another device.</p>
        )}
        {official && (
          <p className="streak-line">
            🔥 {streak}-day streak · best{' '}
            {Math.max(stats.best, standing?.streak?.best ?? 0)}
          </p>
        )}
        {standing && (
          <p className="standing">
            You’re #{standing.rank} of {standing.total} today.
          </p>
        )}
        <div className="row center">
          <button type="button" className="primary" onClick={share}>
            {copied ? 'Copied!' : 'Share result'}
          </button>
          {apiEnabled && official && !identity.name && (
            <button type="button" onClick={props.onNeedName}>
              Add your name
            </button>
          )}
        </div>
        <ol className="recap">
          {lineup.map((p, i) => {
            const q = game.questions[i]
            const school = schools.find((s) => s.id === p.s[0])?.name ?? p.s[0]
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className="recap-row"
                  onClick={() => setIndex(i)}
                >
                  <span>{squares(marks([q]))}</span>
                  <span className="recap-name">{p.n}</span>
                  <span className="muted">{school}</span>
                  <span className="pts">+{q.points}</span>
                </button>
              </li>
            )
          })}
        </ol>
        <p className="muted small">New players at midnight, your time.</p>
        {apiEnabled && official && (
          <Leaderboard
            mode={mode}
            variant={variant}
            dateKey={dateKey}
            token={identity.token}
            refreshKey={boardKey + (identity.name ? 1000 : 0)}
          />
        )}
      </div>
    )
  }

  const q = game.questions[index]
  return (
    <div className="daily">
      <div className="progress">
        <span>
          {label} daily · {index + 1} of {QUESTIONS_PER_DAY}
        </span>
        <span>{total} pts</span>
      </div>
      <QuestionCard
        player={lineup[index]}
        schools={schools}
        state={q}
        photoStyle={played}
        onChange={(next) => update(index, next)}
      />
      {q.done && (
        <button
          type="button"
          className="primary next"
          autoFocus
          onClick={() =>
            setIndex(
              finished
                ? QUESTIONS_PER_DAY
                : game.questions.findIndex((x) => !x.done),
            )
          }
        >
          {finished ? 'See results' : 'Next player'}
        </button>
      )}
    </div>
  )
}
