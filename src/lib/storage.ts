/**
 * localStorage persistence — everything under the `whp:v2:` prefix (v1 was
 * the launch-day data, abandoned when the game restarted on players with both
 * photos; nothing reads it). All reads
 * are defensive (private windows, cleared or corrupted data): a bad value is
 * treated as absent, never thrown.
 */
import type { BoardId, Mode, Variant } from '../types'
import { boardId } from '../types'
import type { QuestionState } from './game'
import { addDays } from './daily'

const PREFIX = 'whp:v2:'

function read<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw == null ? undefined : (JSON.parse(raw) as T)
  } catch {
    return undefined
  }
}
function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Storage full or blocked — the game still works for this session.
  }
}

// ---- Daily game in progress / finished --------------------------------------

export interface DailyGame {
  mode: Mode
  /** Absent on the daily; 'sicko' on Sicko Mode ('beginner' before the swap). */
  variant?: Variant
  dateKey: string
  /** Player ids of the lineup this game was started on. */
  lineup: string[]
  questions: QuestionState[]
  /** The first-photo choice this day was started with. */
  photo?: PhotoStyle
  /** True once the result was accepted by the leaderboard. */
  submitted?: boolean
  /** The account (username) this result belongs to, once known: the one
   *  signed in when it was finished, or the one it was handed to. A day is
   *  never handed to a different account (src/lib/sync.ts). */
  owner?: string
  /** True when this day was played on another device and rebuilt here from
   *  the account's result (src/lib/sync.ts): the score and squares are real,
   *  the per-question detail (wrong guesses) is not known. */
  synced?: boolean
}

export function loadDaily(
  mode: Mode,
  dateKey: string,
  variant: Variant = 'standard',
): DailyGame | undefined {
  const g = read<DailyGame>(`daily:${boardId(mode, variant)}:${dateKey}`)
  if (!g || g.mode !== mode || g.dateKey !== dateKey) return undefined
  if ((g.variant ?? 'standard') !== variant) return undefined
  if (!Array.isArray(g.lineup) || !Array.isArray(g.questions)) return undefined
  return g
}
export function saveDaily(g: DailyGame): void {
  write(`daily:${boardId(g.mode, g.variant)}:${g.dateKey}`, g)
}

// ---- Streaks + history --------------------------------------------------------

export interface Stats {
  current: number
  best: number
  /** Last day a daily was FINISHED in this mode. */
  lastDate: string
  played: number
  /** Sum of all daily totals (for the average). */
  totalPoints: number
}

const EMPTY: Stats = {
  current: 0,
  best: 0,
  lastDate: '',
  played: 0,
  totalPoints: 0,
}

/** Streaks are per daily game: Sicko Mode has its own. */
export function loadStats(board: BoardId): Stats {
  const s = read<Stats>(`stats:${board}`)
  if (!s || typeof s.current !== 'number' || typeof s.best !== 'number')
    return { ...EMPTY }
  return { ...EMPTY, ...s }
}

/**
 * Record a finished daily. Pure: same day again → unchanged; the day after
 * the last one → streak + 1; any gap → streak restarts at 1.
 */
export function bumpStats(prev: Stats, dateKey: string, points: number): Stats {
  if (prev.lastDate === dateKey) return prev
  const current = prev.lastDate === addDays(dateKey, -1) ? prev.current + 1 : 1
  return {
    current,
    best: Math.max(prev.best, current),
    lastDate: dateKey,
    played: prev.played + 1,
    totalPoints: prev.totalPoints + points,
  }
}

/** The streak to SHOW today: a streak whose last day is older than yesterday is over. */
export function liveStreak(s: Stats, todayKey: string): number {
  return s.lastDate === todayKey || s.lastDate === addDays(todayKey, -1)
    ? s.current
    : 0
}

export function saveStats(board: BoardId, s: Stats): void {
  write(`stats:${board}`, s)
}

// ---- Free play -----------------------------------------------------------------

export interface FreePlayBest {
  /** Longest run of consecutive correct answers. */
  streak: number
}
export function loadFreeBest(mode: Mode): FreePlayBest {
  const b = read<FreePlayBest>(`free:${mode}`)
  return { streak: typeof b?.streak === 'number' ? b.streak : 0 }
}
export function saveFreeBest(mode: Mode, b: FreePlayBest): void {
  write(`free:${mode}`, b)
}

// ---- Identity + preferences ----------------------------------------------------

export interface Identity {
  /** Secret bearer token for the API (never shown, never on the board). */
  token: string
  name: string
  /** Set when this device is signed in to an account. */
  username?: string
}

export function newToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function loadIdentity(): Identity {
  const id = read<Identity>('identity')
  if (id && typeof id.token === 'string' && /^[0-9a-f]{48}$/.test(id.token))
    return {
      token: id.token,
      name: typeof id.name === 'string' ? id.name : '',
      username: id.username,
    }
  const fresh: Identity = { token: newToken(), name: '' }
  write('identity', fresh)
  return fresh
}
export function saveIdentity(id: Identity): void {
  write('identity', id)
}

export type PhotoStyle = 'headshot' | 'action'
export function loadPhotoStyle(): PhotoStyle {
  return read<PhotoStyle>('photo') === 'action' ? 'action' : 'headshot'
}
export function savePhotoStyle(p: PhotoStyle): void {
  write('photo', p)
}
