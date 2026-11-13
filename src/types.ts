export type League = 'nfl' | 'nba'
/** A game mode: one league, or the grab bag of both. */
export type Mode = 'nfl' | 'nba' | 'mixed'
export type Tier = 'easy' | 'medium' | 'hard'

/** One row of public/players.json (short keys keep the file small). */
export interface Player {
  id: string
  /** Display name. */
  n: string
  l: League
  /** Accepted answers (school ids). The first is where he finished. */
  s: string[]
  /** Conference of s[0] in his final college season (hint 2). */
  c: string
  /** Fall year of his final college season. */
  y: number
  t: Tier
  /** Headshot key: NBA.com person id, the NFL image path, "espn:<id>" or
   *  "clubs:<path>", "bbr:<id>" or "pfr:<file>" (see src/lib/images.ts). Absent when the
   *  league only has a placeholder — then `a` is always present. */
  h?: string
  /** Three wrong school ids for the multiple-choice stage. */
  d: string[]
  /** Position (NFL only). */
  p?: string
  /** Wikimedia Commons storage path of an in-uniform photo, when one exists. */
  a?: string
  /**
   * Eligible since: days after puzzle #1 from which he may be drawn — he has
   * BOTH a real headshot and a real playing photo. Everyone else waits in the
   * dataset (and is still found by the search). A flat list is windows
   * `[from, until, from, …]` (until exclusive): he lost a photo for a while,
   * and keeps the days he was eligible. The build never changes an edge in
   * the past, so shipping or pulling photos cannot change a lineup that is
   * already being played.
   */
  e?: number | number[]
  /**
   * "Tier was": `[day, tier]` — his tier before `day` (days after puzzle #1)
   * when a hand-kept list moved him (data/nba-top-picks.json). Days before
   * it are drawn with the old tier (tiersOn in src/lib/daily.ts), so moving
   * a player never changes a lineup already being played.
   */
  tw?: [number, Tier]
  /** The high school of a player who skipped college (his answer is the
   *  pseudo-school HIGH_SCHOOL_ID); shown in the reveal. */
  hs?: string
}

/** One row of public/schools.json. */
export interface School {
  id: string
  name: string
  aliases?: string[]
}

/** The "school" that is the right answer for a preps-to-pros player. */
export const HIGH_SCHOOL_ID = 'high-school'
/** The answer for an international who turned pro abroad instead of college. */
export const INTERNATIONAL_ID = 'international'

/**
 * Which daily of a mode. Every mode has two a day: the daily (`standard`) and
 * a second one, which is a different game either side of SWAP_DATE_KEY:
 *   - `beginner` — through 2026-11-13: five players from the easy tier;
 *   - `sicko` — Sicko Mode, from 2026-11-14: three easy, one medium, one hard
 *     (what the daily was until then, while the daily became the five easy).
 * Sicko Mode is a new game with its own id, saves, streak and leaderboard;
 * the beginner daily's are left as they ended. The daily's id and streak
 * never moved — only how its players are picked (drawFor in
 * src/lib/daily.ts).
 */
export type Variant = 'standard' | 'beginner' | 'sicko'
/** The first day of the swapped dailies (the player's local day). */
export const SWAP_DATE_KEY = '2026-11-14'
/** The second daily that exists on `dateKey`. */
export function secondVariant(dateKey: string): 'beginner' | 'sicko' {
  return dateKey < SWAP_DATE_KEY ? 'beginner' : 'sicko'
}
/**
 * Identifies one daily game everywhere it is keyed: the saved game, the
 * streak and the leaderboard (the worker's BOARDS). The daily keeps the bare
 * mode.
 */
export type BoardId = Mode | `${Mode}-beginner` | `${Mode}-sicko`
export function boardId(mode: Mode, variant: Variant = 'standard'): BoardId {
  return variant === 'standard' ? mode : `${mode}-${variant}`
}
/** The inverse of boardId, for a board name that came over the wire. */
export function parseBoardId(
  board: string,
): { mode: Mode; variant: Variant } | null {
  const [mode, tail, ...rest] = board.split('-')
  if (rest.length || (mode !== 'nfl' && mode !== 'nba' && mode !== 'mixed'))
    return null
  if (tail === undefined) return { mode, variant: 'standard' }
  return tail === 'beginner' || tail === 'sicko'
    ? { mode, variant: tail }
    : null
}

export const MODES: Mode[] = ['mixed', 'nfl', 'nba']
export const MODE_LABEL: Record<Mode, string> = {
  mixed: 'Grab Bag',
  nfl: 'NFL',
  nba: 'NBA',
}
/** What a second daily is called. */
export const SECOND_DAILY_NAME = {
  beginner: 'Beginner',
  sicko: 'Sicko Mode',
} as const
/** A daily's display name: "NFL", "NFL Sicko Mode". */
export function gameLabel(mode: Mode, variant: Variant = 'standard'): string {
  return variant === 'standard'
    ? MODE_LABEL[mode]
    : `${MODE_LABEL[mode]} ${SECOND_DAILY_NAME[variant]}`
}
