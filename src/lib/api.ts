/**
 * Client for the whp-api worker (leaderboard, display names, accounts). Every
 * call resolves to `{ ok: true, … }` or `{ ok: false, error }` — never throws,
 * so the game is fully playable when the API is unset, down or blocked.
 */
import type { BoardId } from '../types'

export const API_BASE = (import.meta.env.VITE_API_ENDPOINT ?? '').replace(
  /\/+$/,
  '',
)
export const apiEnabled = API_BASE !== ''

export type ApiResult<T> =
  ({ ok: true } & T) | { ok: false; error: string; status?: number }

async function call<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  if (!apiEnabled) return { ok: false, error: 'offline' }
  try {
    const res = await fetch(API_BASE + path, {
      ...init,
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok || data.ok !== true)
      return {
        ok: false,
        error: String(data.error ?? `HTTP ${res.status}`),
        status: res.status,
      }
    return data as ApiResult<T>
  } catch {
    return { ok: false, error: 'network error' }
  }
}
const post = <T>(path: string, body: unknown) =>
  call<T>(path, { method: 'POST', body: JSON.stringify(body) })

export interface Standing {
  rank: number
  total: number
  streak?: { current: number; best: number }
}
export function submitScore(b: {
  token: string
  board: BoardId
  date: string
  score: number
  marks: string
}) {
  return post<Standing>('/score', b)
}

export interface BoardEntry {
  name: string
  score: number
  marks: string
  streak: number
  you?: boolean
}
export interface Board {
  total: number
  entries: BoardEntry[]
}
export function fetchBoard(board: BoardId, date: string, token?: string) {
  // The token rides in a POST body, never a URL (URLs end up in logs).
  return post<Board>('/board', { board, date, token })
}

/** A streak as the server keeps it (one per board, per player). */
export interface ServerStreak {
  board: string
  current: number
  best: number
  /** Last day that daily was finished. */
  last: string
}
/** One of the player's own recent results. */
export interface ServerScore {
  board: string
  date: string
  score: number
  marks: string
}
export interface Me {
  name: string
  username: string | null
  /** Cross-device sync (src/lib/sync.ts). Absent from a worker that predates
   *  it — the site is deployed by CI, the worker by hand. */
  streaks?: ServerStreak[]
  scores?: ServerScore[]
}
export const fetchMe = (token: string) => post<Me>('/me', { token })
export const setName = (token: string, name: string) =>
  post<Me>('/name', { token, name })
export const register = (token: string, username: string, pass: string) =>
  post<Me>('/register', { token, username, pass })
/**
 * `deviceToken` is the token this device has used so far. If it belongs to an
 * anonymous player, the server folds that player's results and streaks into
 * the account (so a day played before signing in is not on the board twice).
 */
export const login = (username: string, pass: string, deviceToken?: string) =>
  post<Me & { token: string }>('/login', {
    username,
    pass,
    token: deviceToken,
  })
export const logout = (token: string) => post<object>('/logout', { token })

/** Client-side half of the split KDF (see worker/api-lib.mjs §Passwords). */
export const KDF_ITERATIONS = 150_000
export async function derivePass(
  username: string,
  password: string,
): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: enc.encode('whp:v1:' + username.trim().toLowerCase()),
      iterations: KDF_ITERATIONS,
    },
    key,
    256,
  )
  return Array.from(new Uint8Array(bits), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
}
