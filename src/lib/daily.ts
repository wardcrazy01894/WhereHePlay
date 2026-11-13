/**
 * Deterministic daily question selection — same five players for everyone on
 * a given day and mode, with no backend.
 *
 * Each player gets a per-day rank, hash(`<seed>|<id>`); a slot takes
 * the best-ranked eligible player of its tier (and, in the grab bag, of its
 * league). Ranks are per player, NOT a shuffle of the pool, so a dataset
 * rebuild that adds players leaves everyone else's rank untouched.
 *
 * Recency cooldown: a player who appeared in the previous COOLDOWN_DAYS
 * lineups of that draw is skipped. The lineups are computed by walking the
 * days from EPOCH_DATE_KEY, so the result is a pure function of
 * (dataset, mode, date) — no storage, identical in every browser.
 *
 * The day rolls over at the PLAYER'S local midnight (Wordle-style).
 */
import type { League, Mode, Player, Tier, Variant } from '../types'
import { SWAP_DATE_KEY } from '../types'

export const QUESTIONS_PER_DAY = 5
/** Three easy, one medium, one hard — warm-ups first, the stumper last. */
export const TIER_PLAN: Tier[] = ['easy', 'easy', 'easy', 'medium', 'hard']
/**
 * Five easy players. Its window is shorter than the 3-1-1 one because it
 * draws five a day from the easy tier alone — a dataset guard test checks
 * the depth.
 */
export const EASY_PLAN: Tier[] = ['easy', 'easy', 'easy', 'easy', 'easy']
/** Puzzle #1. */
export const EPOCH_DATE_KEY = '2026-11-11'
export const COOLDOWN_DAYS = 45
export const EASY_COOLDOWN_DAYS = 30

/**
 * The two draws, each one unbroken walk from puzzle #1: `classic` follows
 * TIER_PLAN, `easy` follows EASY_PLAN. Neither has changed since launch.
 */
export type Draw = 'classic' | 'easy'
/**
 * Which draw a daily shows on a given day. Until SWAP_DATE_KEY the daily was
 * the classic draw and the second daily ("beginner") the easy one; from that
 * day on they are swapped — the daily is five easy players and the second
 * daily is Sicko Mode, the classic 3-1-1. Only this mapping changed: both
 * walks carry on untouched, so no day already played re-rolled. A future
 * change goes here the same way: a new rule with a START DATE IN THE FUTURE,
 * never an edit to days already played.
 */
export function drawFor(variant: Variant, dateKey: string): Draw {
  const swapped = dateKey >= SWAP_DATE_KEY
  return (variant === 'standard') === swapped ? 'easy' : 'classic'
}
/** The tier plan of a daily on a given day. */
export function tierPlanFor(
  dateKey: string,
  variant: Variant = 'standard',
): Tier[] {
  return drawFor(variant, dateKey) === 'easy' ? EASY_PLAN : TIER_PLAN
}

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
 * The players who may be drawn on `dateKey`: those with both photos (`e`)
 * whose eligibility started on or before that day. A day before the epoch
 * (practice only) uses the launch pool.
 */
export function eligibleOn(all: Player[], dateKey: string): Player[] {
  const day = Math.max(0, puzzleNumber(dateKey) - 1)
  return all.filter((p) => {
    if (p.e === undefined) return false
    if (typeof p.e === 'number') return p.e <= day
    // Windows [from, until, from, …]: a player who lost a photo keeps the
    // days he was eligible, so those days' lineups never change.
    for (let i = 0; i < p.e.length; i += 2)
      if (p.e[i] <= day && (i + 1 >= p.e.length || day < p.e[i + 1]))
        return true
    return false
  })
}

/**
 * The same players with the tier each had on `dateKey`: a player moved by a
 * hand-kept list (`tw`) keeps his old tier on the days before the move, so
 * those days' lineups never change. Everyone else is returned as he is.
 */
export function tiersOn(players: Player[], dateKey: string): Player[] {
  const day = Math.max(0, puzzleNumber(dateKey) - 1)
  return players.map((p) => (p.tw && day < p.tw[0] ? { ...p, t: p.tw[1] } : p))
}

/**
 * How many past lineups a day can keep out without running a tier dry: `base`
 * (COOLDOWN_DAYS), or fewer while the pool is small — it grows as players
 * get their photos. For each league and tier the window's lineups plus
 * today's must fit in the pool. The grab bag alternates leagues, so one
 * league fills at most half a tier's slots (rounded up). `held` is the number
 * of players per league and tier already taken by another lineup that day
 * (the easy draw keeps clear of the classic one).
 */
export function cooldownFor(
  pool: Player[],
  mode: Mode,
  plan: Tier[],
  base: number,
  held = 0,
): number {
  const leagues: League[] = mode === 'mixed' ? ['nfl', 'nba'] : [mode]
  let days = base
  for (const tier of new Set(plan)) {
    const slots = plan.filter((t) => t === tier).length
    const perLeague = mode === 'mixed' ? Math.ceil(slots / 2) : slots
    for (const league of leagues) {
      const have =
        pool.filter((p) => p.l === league && p.t === tier).length - held
      days = Math.min(days, Math.floor(have / perLeague) - 1)
    }
  }
  return Math.max(0, days)
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

/**
 * A draw's seed: `<mode>:<date>` for the classic one, `<mode>-beginner:<date>`
 * for the easy one — both unchanged since launch (the easy draw began as the
 * beginner daily, hence the name).
 */
export function dateSeed(
  mode: Mode,
  dateKey: string,
  draw: Draw = 'classic',
): string {
  return `${draw === 'easy' ? `${mode}-beginner` : mode}:${dateKey}`
}

interface Walk {
  mode: Mode
  draw: Draw
  history: Player[][]
}
interface Walks {
  byId: Map<string, Player>
  list: Walk[]
}
/** One walk per dataset array (identity), mode and draw. */
const walks = new WeakMap<Player[], Walks>()

/**
 * The official lineup of a daily for (mode, dateKey): that day's lineup of
 * the draw the daily shows then (drawFor).
 */
export function dailyLineup(
  all: Player[],
  mode: Mode,
  dateKey: string,
  variant: Variant = 'standard',
): Player[] {
  return drawLineup(all, mode, dateKey, drawFor(variant, dateKey))
}

/**
 * A draw's lineup for (mode, dateKey).
 *
 * Drawn only from the players eligible that day (both photos — eligibleOn),
 * with the tiers they had that day (tiersOn), skipping whoever appeared in
 * the previous lineups of that draw, as many as the pool can sustain
 * (cooldownFor). Each day depends only on the days before it and on players
 * already eligible then, so the result is a pure function of (dataset, mode,
 * date): photos that land later add players to later days and never touch a
 * day already played.
 *
 * The classic draw depends on nothing but itself. The easy draw is drawn from
 * the easy tier only (so every fallback in selectDaily stays easy) and also
 * skips that day's classic lineup of the same mode, so playing both dailies
 * never shows a player twice in a day.
 */
export function drawLineup(
  all: Player[],
  mode: Mode,
  dateKey: string,
  kind: Draw,
): Player[] {
  let cache = walks.get(all)
  if (!cache)
    walks.set(
      all,
      (cache = { byId: new Map(all.map((p) => [p.id, p])), list: [] }),
    )
  const { byId } = cache
  let walk = cache.list.find((w) => w.mode === mode && w.draw === kind)
  if (!walk) cache.list.push((walk = { mode, draw: kind, history: [] }))
  const draw = (d: string, history: Player[][]): Player[] => {
    const eligible = tiersOn(eligibleOn(all, d), d)
    const recent = (days: number) =>
      new Set(
        (days > 0 ? history.slice(-days) : []).flatMap((day) =>
          day.map((p) => p.id),
        ),
      )
    // tiersOn hands out copies of the players it re-tiers: give back the
    // dataset's own rows.
    const rows = (picks: Player[]) => picks.map((p) => byId.get(p.id)!)
    if (kind === 'classic') {
      const window = cooldownFor(
        poolFor(eligible, mode),
        mode,
        TIER_PLAN,
        COOLDOWN_DAYS,
      )
      return rows(
        selectDaily(
          eligible,
          mode,
          dateSeed(mode, d),
          recent(window),
          TIER_PLAN,
        ),
      )
    }
    const easy = eligible.filter((p) => p.t === 'easy')
    const classic = drawLineup(all, mode, d, 'classic')
    const window = cooldownFor(
      poolFor(easy, mode),
      mode,
      EASY_PLAN,
      EASY_COOLDOWN_DAYS,
      // At most this many of a league's easy players are in the classic
      // lineup that day (cooldownFor's own bound for a plan).
      mode === 'mixed' ? 2 : 3,
    )
    const exclude = recent(window)
    for (const p of classic) exclude.add(p.id)
    return rows(
      selectDaily(easy, mode, dateSeed(mode, d, 'easy'), exclude, EASY_PLAN),
    )
  }
  // Days before the epoch (only reachable via ?date=) get a plain draw.
  if (dateKey < EPOCH_DATE_KEY) return draw(dateKey, [])
  const index = puzzleNumber(dateKey) - 1
  while (walk.history.length <= index)
    walk.history.push(
      draw(addDays(EPOCH_DATE_KEY, walk.history.length), walk.history),
    )
  return walk.history[index]
}
