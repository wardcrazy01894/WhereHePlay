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
  /** Headshot key: NBA.com person id, the NFL image path, or "espn:<id>". Absent when the
   *  league only has a placeholder — then `a` is always present. */
  h?: string
  /** Three wrong school ids for the multiple-choice stage. */
  d: string[]
  /** Position (NFL only). */
  p?: string
  /** Wikimedia Commons storage path of an in-uniform photo, when one exists. */
  a?: string
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

export const MODES: Mode[] = ['mixed', 'nfl', 'nba']
export const MODE_LABEL: Record<Mode, string> = {
  mixed: 'Grab Bag',
  nfl: 'NFL',
  nba: 'NBA',
}
