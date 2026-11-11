/**
 * Deterministic daily question selection — same five players for everyone on
 * a given day and mode, with no backend.
 *
 * Each player gets a per-day rank, hash(`<mode>:<date>|<id>`); a slot takes
 * the best-ranked eligible player of its tier (and, in the grab bag, of its
 * league). Ranks are per player, NOT a shuffle of the pool, so a dataset
 * rebuild that adds players leaves everyone else's rank untouched.
 *
 * Recency cooldown: a player who appeared in the previous COOLDOWN_DAYS
 * lineups of that mode is skipped. The lineups are computed by walking the
 * days from EPOCH_DATE_KEY, so the result is a pure function of
 * (dataset, mode, date) — no storage, identical in every browser.
 *
 * The day rolls over at the PLAYER'S local midnight (Wordle-style).
 */
import type { League, Mode, Player, Tier } from '../types'

export const QUESTIONS_PER_DAY = 5
/** Three easy, one medium, one hard — warm-ups first, the stumper last. */
export const TIER_PLAN: Tier[] = ['easy', 'easy', 'easy', 'medium', 'hard']
/**
 * The plan for a given day. One plan so far (the game launched with it); if
 * it ever changes, add the new plan here with a START DATE IN THE FUTURE and
 * keep returning the old one for earlier days — never edit a plan that has
 * been played, or past and in-progress puzzles re-roll.
 */
export function tierPlanFor(_dateKey: string): Tier[] {
  return TIER_PLAN
}
/** Puzzle #1. */
export const EPOCH_DATE_KEY = '2026-11-11'
export const COOLDOWN_DAYS = 45

export function addDays(dateKey: string, n: number): string {
  return new Date(Date.parse(dateKey + 'T00:00:00Z') + n * 86_400_000)
    .toISOString()
    .slice(0, 10)
}

/** Calendar day "YYYY-MM-DD" in `timeZone` (default: the player's own). */
export function getDateKey(now: Date = new Date(), timeZone?: string): string {
  // Built from numeric parts: a locale's short-date pattern is not stable.
  const parts = new Intl.DateTimeFormat('en-US', {
    ...(timeZone ? { timeZone } : {}),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** True for a REAL calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isValidDateKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false
  const d = new Date(key + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === key
}

/** Wordle-style puzzle number: days since the epoch, 1-based. */
export function puzzleNumber(dateKey: string): number {
  const ms =
    Date.parse(dateKey + 'T00:00:00Z') -
    Date.parse(EPOCH_DATE_KEY + 'T00:00:00Z')
  return Math.round(ms / 86_400_000) + 1
}

/** cyrb53 string hash → unsigned 32-bit. https://stackoverflow.com/a/52171480 */
export function hashString(str: string): number {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return ((h2 >>> 0) ^ (h1 >>> 0)) >>> 0
}

/** The players a mode draws from. */
export function poolFor(all: Player[], mode: Mode): Player[] {
  return mode === 'mixed' ? all : all.filter((p) => p.l === mode)
}

/**
 * League wanted in each slot. Single-league modes: that league. Grab bag:
 * alternate, starting league decided by the day, so a day is 3/2 one way or
 * the other and never five of one league.
 */
export function leaguePlan(mode: Mode, seed: string): League[] {
  if (mode !== 'mixed') return TIER_PLAN.map(() => mode)
  const first = hashString(seed) % 2
  return TIER_PLAN.map((_, i) => ((first + i) % 2 === 0 ? 'nfl' : 'nba'))
}

/**
 * Pick the day's five for `seed`, skipping ids in `exclude`. Falls back
 * (tier → league → anything → excluded) so a full set is always returned for
 * any pool of at least five.
 */
export function selectDaily(
  all: Player[],
  mode: Mode,
  seed: string,
  exclude: ReadonlySet<string> = new Set(),
  plan: Tier[] = TIER_PLAN,
): Player[] {
  const pool = poolFor(all, mode)
  if (pool.length < QUESTIONS_PER_DAY)
    throw new Error(`Need at least ${QUESTIONS_PER_DAY} players for ${mode}.`)
  // One hash per player, then a linear scan per slot for the best-ranked
  // match (rank, then id) — equivalent to sorting the pool and taking the
  // first match, at a fraction of the cost. dailyLineup calls this once per
  // day since the epoch, so the per-day cost is what bounds a cold start.
  const ranks = pool.map((p) => hashString(`${seed}|${p.id}`))
  const best = (ok: (p: Player) => boolean): Player | undefined => {
    let at = -1
    for (let i = 0; i < pool.length; i++) {
      if (!ok(pool[i])) continue
      if (
        at === -1 ||
        ranks[i] < ranks[at] ||
        (ranks[i] === ranks[at] && pool[i].id < pool[at].id)
      )
        at = i
    }
    return at === -1 ? undefined : pool[at]
  }
  const leagues = leaguePlan(mode, seed)
  const used = new Set<string>()
  const usedSchools = new Set<string>()
  const chosen: Player[] = []
  plan.forEach((tier, i) => {
    const free = (p: Player) => !used.has(p.id) && !exclude.has(p.id)
    const fresh = (p: Player) => !usedSchools.has(p.s[0])
    const want = (p: Player) => free(p) && p.t === tier && p.l === leagues[i]
    const pick =
      best((p) => want(p) && fresh(p)) ??
      best(want) ??
      best((p) => free(p) && p.l === leagues[i]) ??
      best(free) ??
      best((p) => !used.has(p.id))!
    used.add(pick.id)
    usedSchools.add(pick.s[0])
    chosen.push(pick)
  })
  return chosen
}

export function dateSeed(mode: Mode, dateKey: string): string {
  return `${mode}:${dateKey}`
}

interface Walk {
  mode: Mode
  history: Player[][]
}
/** One walk per dataset array (identity) and mode. */
const walks = new WeakMap<Player[], Walk[]>()

/** The official lineup for (mode, dateKey), with the recency cooldown. */
export function dailyLineup(
  all: Player[],
  mode: Mode,
  dateKey: string,
): Player[] {
  // Days before the epoch (only reachable via ?date=) get a plain draw.
  if (dateKey < EPOCH_DATE_KEY)
    return selectDaily(
      all,
      mode,
      dateSeed(mode, dateKey),
      undefined,
      tierPlanFor(dateKey),
    )
  let list = walks.get(all)
  if (!list) walks.set(all, (list = []))
  let walk = list.find((w) => w.mode === mode)
  if (!walk) list.push((walk = { mode, history: [] }))
  const index = puzzleNumber(dateKey) - 1
  while (walk.history.length <= index) {
    const d = addDays(EPOCH_DATE_KEY, walk.history.length)
    const exclude = new Set(
      walk.history.slice(-COOLDOWN_DAYS).flatMap((day) => day.map((p) => p.id)),
    )
    walk.history.push(
      selectDaily(all, mode, dateSeed(mode, d), exclude, tierPlanFor(d)),
    )
  }
  return walk.history[index]
}
