/**
 * Cross-device sync. The server already keeps each player's results and
 * streaks (worker `/me`); this folds them into the device's localStorage so
 * a streak — and a daily already finished elsewhere — follows the account
 * from the computer to the phone.
 *
 * `planSync` is pure (what should change); `syncProgress` applies it.
 * What does NOT sync: a daily still in progress (only finished results reach
 * the server), free play, and the first-photo setting.
 */
import type { BoardId, Mode, Player, Variant } from '../types'
import { MODES, boardId, parseBoardId } from '../types'
import type { Me, ServerScore, ServerStreak } from './api'
import { submitScore } from './api'
import {
  QUESTIONS_PER_DAY,
  addDays,
  dailyLineup,
  isValidDateKey,
} from './daily'
import {
  type QuestionState,
  type Stage,
  LAST_STAGE,
  STAGE_POINTS,
  totalPoints,
} from './game'
import { marks } from './share'
import {
  type DailyGame,
  type Stats,
  loadDaily,
  loadStats,
  saveDaily,
  saveStats,
} from './storage'

export type Progress = Pick<Me, 'streaks' | 'scores'>

const VARIANTS: Variant[] = ['standard', 'beginner']
const isCount = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0

/**
 * Fold the server's streak into the device's. The newer last-played day
 * decides the current count (same day: the larger); best only ever grows.
 * Returns `local` itself when nothing changes.
 */
export function mergeStats(local: Stats, server: ServerStreak): Stats {
  if (
    !isCount(server.current) ||
    !isCount(server.best) ||
    !isValidDateKey(server.last)
  )
    return local
  let { current, lastDate } = local
  if (server.last > lastDate) {
    current = server.current
    lastDate = server.last
  } else if (server.last === lastDate) {
    current = Math.max(current, server.current)
  }
  const best = Math.max(local.best, server.best, current)
  if (
    current === local.current &&
    lastDate === local.lastDate &&
    best === local.best
  )
    return local
  return { ...local, current, best, lastDate }
}

/** A finished question worth what the mark says ('4' photo only … '0' missed). */
export function questionFromMark(m: string): QuestionState {
  const n = Number(m)
  const base = { wrong: [], done: true }
  if (!(n >= 1 && n <= 4))
    return {
      ...base,
      stage: LAST_STAGE,
      correct: false,
      gaveUp: true,
      points: 0,
    }
  const stage = (4 - n) as Stage
  return {
    ...base,
    stage,
    correct: true,
    gaveUp: false,
    points: STAGE_POINTS[stage],
  }
}

/**
 * The finished game behind one of the player's server results, or null when
 * the row is not one this build can show. `today` bounds the date: a lineup is
 * computed by walking forward from the epoch, so a far-future date must never
 * reach dailyLineup.
 */
export function gameFromScore(
  players: Player[],
  score: ServerScore,
  today: string,
): DailyGame | null {
  const board = typeof score.board === 'string' && parseBoardId(score.board)
  if (!board) return null
  const { date } = score
  if (!isValidDateKey(date)) return null
  if (date < addDays(today, -3) || date > addDays(today, 1)) return null
  if (
    typeof score.marks !== 'string' ||
    !new RegExp(`^[0-4]{${QUESTIONS_PER_DAY}}$`).test(score.marks)
  )
    return null
  const questions = [...score.marks].map(questionFromMark)
  if (totalPoints(questions) !== score.score) return null
  return {
    mode: board.mode,
    ...(board.variant === 'beginner' ? { variant: board.variant } : {}),
    dateKey: date,
    lineup: dailyLineup(players, board.mode, date, board.variant).map(
      (p) => p.id,
    ),
    questions,
    submitted: true,
    synced: true,
  }
}

export interface SyncPlan {
  /** Days finished on another device, to store as finished here. */
  games: DailyGame[]
  /** Streaks that change on this device. */
  stats: { board: BoardId; stats: Stats }[]
  /** Today's dailies finished here that the account has no result for. */
  unsent: DailyGame[]
}

const isFinished = (g: DailyGame | undefined) =>
  !!g && g.questions.length > 0 && g.questions.every((q) => q.done)

export function planSync(input: {
  players: Player[]
  me: Progress & { username: string | null }
  /** The device's local day. */
  today: string
  localGame: (
    mode: Mode,
    dateKey: string,
    variant: Variant,
  ) => DailyGame | undefined
  localStats: (board: BoardId) => Stats
}): SyncPlan {
  const { players, me, today, localGame, localStats } = input
  const plan: SyncPlan = { games: [], stats: [], unsent: [] }

  const scores = Array.isArray(me.scores) ? me.scores : null
  const known = new Set<string>()
  for (const score of scores ?? []) {
    const game = gameFromScore(players, score, today)
    if (!game) continue
    known.add(`${score.board}|${score.date}`)
    // The server keeps the FIRST result, so it also wins over a game that is
    // only in progress here.
    const variant = game.variant ?? 'standard'
    if (!isFinished(localGame(game.mode, game.dateKey, variant)))
      plan.games.push(game)
  }

  for (const streak of Array.isArray(me.streaks) ? me.streaks : []) {
    const board =
      typeof streak?.board === 'string' && parseBoardId(streak.board)
    if (!board) continue
    const id = boardId(board.mode, board.variant)
    const local = localStats(id)
    const next = mergeStats(local, streak)
    if (next !== local) plan.stats.push({ board: id, stats: next })
  }

  // Played before signing in on this device: hand today's results to the
  // account, so its streak counts them. Accounts only (signing OUT must not
  // repost the day as a second, anonymous player), and only when the server
  // told us what it has.
  if (me.username && scores)
    for (const mode of MODES)
      for (const variant of VARIANTS) {
        const local = localGame(mode, today, variant)
        if (
          local &&
          isFinished(local) &&
          !known.has(`${boardId(mode, variant)}|${today}`)
        )
          plan.unsent.push(local)
      }
  return plan
}

/**
 * Apply the server's view of this player to the device. Resolves to true
 * when anything on the device changed (the caller re-renders).
 */
export async function syncProgress(
  players: Player[],
  me: Progress & { username: string | null },
  token: string,
  today: string,
): Promise<boolean> {
  const plan = planSync({
    players,
    me,
    today,
    localGame: loadDaily,
    localStats: loadStats,
  })
  for (const game of plan.games) saveDaily(game)
  for (const { board, stats } of plan.stats) saveStats(board, stats)
  let changed = plan.games.length > 0 || plan.stats.length > 0
  for (const game of plan.unsent) {
    const board = boardId(game.mode, game.variant)
    const r = await submitScore({
      token,
      board,
      date: game.dateKey,
      score: totalPoints(game.questions),
      marks: marks(game.questions),
    })
    if (!r.ok) continue
    if (!game.submitted) saveDaily({ ...game, submitted: true })
    if (r.streak) {
      const local = loadStats(board)
      const next = mergeStats(local, {
        board,
        current: r.streak.current,
        best: r.streak.best,
        last: game.dateKey,
      })
      if (next !== local) {
        saveStats(board, next)
        changed = true
      }
    }
  }
  return changed
}
