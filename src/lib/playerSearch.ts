/** "Is this player in the game?" — name search over the dataset. Pure. */
import type { Player } from '../types'
import { normalize } from './search'

/** Shortest name that can be requested (and longest we will send). */
export const MIN_REQUEST_CHARS = 3
export const MAX_REQUEST_CHARS = 60

/**
 * Players whose name matches `query`, best first: exact, then starts-with,
 * then a later word starting with it, then any substring. Ties alphabetical.
 * Returns only what is safe to show mid-day: callers display name + league,
 * never the college (that would answer a question).
 */
export function searchPlayers(
  players: Player[],
  query: string,
  limit = 8,
): Player[] {
  const q = normalize(query)
  if (q.length < 2) return []
  const scored: { p: Player; score: number }[] = []
  for (const p of players) {
    const name = normalize(p.n)
    const score =
      name === q
        ? 0
        : name.startsWith(q)
          ? 1
          : name.includes(' ' + q)
            ? 2
            : name.includes(q)
              ? 3
              : -1
    if (score >= 0) scored.push({ p, score })
  }
  return scored
    .sort((a, b) => a.score - b.score || a.p.n.localeCompare(b.p.n))
    .slice(0, limit)
    .map((s) => s.p)
}

/** True when a player with exactly this name (ignoring case/punctuation) exists. */
export function hasPlayer(players: Player[], query: string): boolean {
  const q = normalize(query)
  return q !== '' && players.some((p) => normalize(p.n) === q)
}

/** Whether `query` is a name we would let someone request. */
export function canRequest(players: Player[], query: string): boolean {
  const q = query.replace(/\s+/g, ' ').trim()
  return (
    q.length >= MIN_REQUEST_CHARS &&
    q.length <= MAX_REQUEST_CHARS &&
    /\p{L}/u.test(q) &&
    !hasPlayer(players, q)
  )
}
