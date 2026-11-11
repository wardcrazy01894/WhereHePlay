/** Free play: an endless shuffled run through a mode's pool — pure given `rand`. */
import type { Mode, Player } from '../types'
import { poolFor } from './daily'

/** How many recent players are kept out of the next draw. */
export const RECENT_WINDOW = 150

/**
 * Next player, never one of the `recent` ids (unless the pool is tiny).
 * `all` is the players who may be drawn today (eligibleOn) — the caller
 * filters, so a player waiting for a photo is never dealt.
 */
export function nextFreePlayer(
  all: Player[],
  mode: Mode,
  recent: readonly string[],
  rand: () => number = Math.random,
): Player {
  const pool = poolFor(all, mode)
  if (!pool.length) throw new Error(`No players for ${mode}.`)
  const skip = new Set(recent.slice(-Math.min(RECENT_WINDOW, pool.length - 1)))
  const eligible = pool.filter((p) => !skip.has(p.id))
  const from = eligible.length ? eligible : pool
  return from[Math.min(from.length - 1, Math.floor(rand() * from.length))]
}
