/**
 * Client for the whp-api worker (leaderboard, display names, accounts). Every
 * call resolves to `{ ok: true, … }` or `{ ok: false, error }` — never throws,
 * so the game is fully playable when the API is unset, down or blocked.
 */
import type { Mode } from '../types'

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
  board: Mode
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
export function fetchBoard(board: Mode, date: string, token?: string) {
  // The token rides in a POST body, never a URL (URLs end up in logs).
  return post<Board>('/board', { board, date, token })
}

export interface Me {
  name: string
  username: string | null
}
export const fetchMe = (token: string) => post<Me>('/me', { token })
export const setName = (token: string, name: string) =>
  post<Me>('/name', { token, name })
export const register = (token: string, username: string, pass: string) =>
  post<Me>('/register', { token, username, pass })
export const login = (username: string, pass: string) =>
  post<Me & { token: string }>('/login', { username, pass })
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
