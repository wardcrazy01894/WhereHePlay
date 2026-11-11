import { describe, it, expect } from 'vitest'
import type { League, Player, Tier } from '../types'
import { parseBoardId } from '../types'
import { dailyLineup } from './daily'
import { giveUp, mark, newQuestion, totalPoints } from './game'
import type { DailyGame, Stats } from './storage'
import {
  type Progress,
  gameFromScore,
  mergeStats,
  planSync,
  questionFromMark,
} from './sync'

const players: Player[] = []
for (const l of ['nfl', 'nba'] as League[])
  for (const t of ['easy', 'medium', 'hard'] as Tier[])
    for (let i = 0; i < 12; i++)
      players.push({
        id: `${l}-${t}-${i}`,
        n: `P ${l} ${t} ${i}`,
        l,
        s: [`school-${i}`],
        c: 'SEC',
        y: 2010,
        t,
        h: 'x',
        d: ['a', 'b', 'c'],
      })

const TODAY = '2026-11-12'
const empty: Stats = {
  current: 0,
  best: 0,
  lastDate: '',
  played: 0,
  totalPoints: 0,
}
const finished = (mode: DailyGame['mode'], dateKey = TODAY): DailyGame => ({
  mode,
  dateKey,
  lineup: dailyLineup(players, mode, dateKey).map((p) => p.id),
  questions: Array.from({ length: 5 }, () => giveUp(newQuestion())),
})

/** planSync over an in-memory "device". */
function plan(
  me: Progress & { username: string | null },
  games: DailyGame[] = [],
  stats: Record<string, Stats> = {},
) {
  return planSync({
    players,
    me,
    today: TODAY,
    localGame: (mode, date, variant) =>
      games.find(
        (g) =>
          g.mode === mode &&
          g.dateKey === date &&
          (g.variant ?? 'standard') === variant,
      ),
    localStats: (board) => stats[board] ?? empty,
  })
}

describe('parseBoardId', () => {
  it('reads the six boards and nothing else', () => {
    expect(parseBoardId('nfl')).toEqual({ mode: 'nfl', variant: 'standard' })
    expect(parseBoardId('mixed-beginner')).toEqual({
      mode: 'mixed',
      variant: 'beginner',
    })
    for (const bad of ['mlb', 'beginner', 'nfl-expert', '', 'nfl-beginner-x'])
      expect(parseBoardId(bad)).toBeNull()
  })
})

describe('mergeStats (a streak follows the account)', () => {
  const server = (current: number, best: number, last: string) => ({
    board: 'nfl',
    current,
    best,
    last,
  })
  it('a newer server day wins: the streak carries over to this device', () => {
    expect(mergeStats(empty, server(7, 9, TODAY))).toMatchObject({
      current: 7,
      best: 9,
      lastDate: TODAY,
    })
  })
  it('the same day keeps the larger count; an older server day changes nothing but best', () => {
    const local = { ...empty, current: 3, best: 3, lastDate: TODAY }
    expect(mergeStats(local, server(5, 5, TODAY)).current).toBe(5)
    expect(mergeStats(local, server(2, 8, '2026-11-10'))).toMatchObject({
      current: 3,
      best: 8,
      lastDate: TODAY,
    })
  })
  it('returns the same object when nothing changes, and ignores junk', () => {
    const local = { ...empty, current: 3, best: 4, lastDate: TODAY }
    expect(mergeStats(local, server(3, 4, TODAY))).toBe(local)
    expect(mergeStats(local, server(NaN, 4, 'nope'))).toBe(local)
    expect(mergeStats(local, server(-1, 4, TODAY))).toBe(local)
  })
})

describe('gameFromScore (a result from another device)', () => {
  it('a mark rebuilds a finished question worth the same', () => {
    for (const m of ['0', '1', '2', '3', '4']) {
      const q = questionFromMark(m)
      expect(q.done).toBe(true)
      expect(mark(q)).toBe(m)
    }
    expect(questionFromMark('4').points).toBe(100)
    expect(questionFromMark('1').points).toBe(25)
  })
  it('rebuilds the day: that mode’s lineup, the same total, already submitted', () => {
    const g = gameFromScore(
      players,
      { board: 'nba-beginner', date: TODAY, score: 250, marks: '43210' },
      TODAY,
    )!
    expect(g).toMatchObject({
      mode: 'nba',
      variant: 'beginner',
      dateKey: TODAY,
      submitted: true,
      synced: true,
    })
    expect(g.lineup).toEqual(
      dailyLineup(players, 'nba', TODAY, 'beginner').map((p) => p.id),
    )
    expect(totalPoints(g.questions)).toBe(250)
    expect(g.questions.every((q) => q.done)).toBe(true)
    // A standard game keeps its pre-beginner shape.
    const s = gameFromScore(
      players,
      { board: 'nfl', date: TODAY, score: 0, marks: '00000' },
      TODAY,
    )!
    expect('variant' in s).toBe(false)
  })
  it('refuses anything malformed or far from today (a far date would hang the walk)', () => {
    const ok = { board: 'nfl', date: TODAY, score: 250, marks: '43210' }
    for (const bad of [
      { ...ok, board: 'mlb' },
      { ...ok, marks: '4321' },
      { ...ok, marks: '43215' },
      { ...ok, score: 500 },
      { ...ok, date: '9999-12-31' },
      { ...ok, date: '2026-11-01' },
      { ...ok, date: '2026-02-30' },
    ])
      expect(gameFromScore(players, bad, TODAY)).toBeNull()
  })
})

describe('planSync', () => {
  const score = { board: 'nfl', date: TODAY, score: 250, marks: '43210' }
  it('a daily finished elsewhere becomes finished here', () => {
    const p = plan({ username: 'al', scores: [score], streaks: [] })
    expect(p.games).toHaveLength(1)
    expect(p.games[0]).toMatchObject({ mode: 'nfl', synced: true })
    expect(p.unsent).toEqual([])
  })
  it('…even over a game in progress here (the first result stands)', () => {
    const half = finished('nfl')
    half.questions[4] = newQuestion()
    const p = plan({ username: 'al', scores: [score], streaks: [] }, [half])
    expect(totalPoints(p.games[0].questions)).toBe(250)
  })
  it('a game already finished here is left alone', () => {
    const p = plan({ username: 'al', scores: [score], streaks: [] }, [
      finished('nfl'),
    ])
    expect(p.games).toEqual([])
    expect(p.unsent).toEqual([])
  })
  it('streaks: only the boards that change are written', () => {
    const p = plan(
      {
        username: 'al',
        scores: [],
        streaks: [
          { board: 'nfl', current: 4, best: 4, last: TODAY },
          { board: 'nba', current: 1, best: 1, last: TODAY },
          { board: 'bogus', current: 9, best: 9, last: TODAY },
        ],
      },
      [],
      { nba: { ...empty, current: 1, best: 1, lastDate: TODAY } },
    )
    expect(p.stats.map((s) => s.board)).toEqual(['nfl'])
    expect(p.stats[0].stats).toMatchObject({ current: 4, lastDate: TODAY })
  })
  it('signed in: today’s dailies finished here but unknown to the account are sent', () => {
    const local = [
      finished('nfl'),
      finished('nba'),
      finished('mixed', '2026-11-11'),
    ]
    const p = plan(
      {
        username: 'al',
        scores: [{ board: 'nba', date: TODAY, score: 0, marks: '00000' }],
        streaks: [],
      },
      local,
    )
    expect(p.unsent.map((g) => g.mode)).toEqual(['nfl'])
  })
  it('never sends for an anonymous device, or to a worker that predates sync', () => {
    const local = [finished('nfl')]
    expect(
      plan({ username: null, scores: [], streaks: [] }, local).unsent,
    ).toEqual([])
    expect(plan({ username: 'al' }, local)).toEqual({
      games: [],
      stats: [],
      unsent: [],
    })
  })
})
