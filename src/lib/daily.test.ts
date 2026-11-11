import { describe, it, expect } from 'vitest'
import type { League, Player, Tier } from '../types'
import {
  BEGINNER_COOLDOWN_DAYS,
  COOLDOWN_DAYS,
  EPOCH_DATE_KEY,
  TIER_PLAN,
  tierPlanFor,
  addDays,
  dailyLineup,
  dateSeed,
  getDateKey,
  hashString,
  isValidDateKey,
  leaguePlan,
  puzzleNumber,
  selectDaily,
} from './daily'

function fixture(perCell = 40): Player[] {
  const out: Player[] = []
  const tiers: Tier[] = ['easy', 'medium', 'hard']
  const leagues: League[] = ['nfl', 'nba']
  for (const l of leagues)
    for (const t of tiers)
      for (let i = 0; i < perCell; i++)
        out.push({
          id: `${l}-${t}-${i}`,
          n: `P ${l} ${t} ${i}`,
          l,
          s: [`school-${i % 25}`],
          c: 'SEC',
          y: 2010,
          t,
          h: 'x',
          d: ['a', 'b', 'c'],
        })
  return out
}

describe('dates', () => {
  it('getDateKey is the calendar day in the given zone', () => {
    const t = new Date('2026-11-12T03:30:00Z')
    expect(getDateKey(t, 'America/New_York')).toBe('2026-11-11')
    expect(getDateKey(t, 'UTC')).toBe('2026-11-12')
  })
  it('isValidDateKey rejects impossible dates', () => {
    expect(isValidDateKey('2026-11-11')).toBe(true)
    expect(isValidDateKey('2026-02-30')).toBe(false)
    expect(isValidDateKey('11/11/2026')).toBe(false)
  })
  it('puzzle #1 is the epoch', () => {
    expect(puzzleNumber(EPOCH_DATE_KEY)).toBe(1)
    expect(puzzleNumber(addDays(EPOCH_DATE_KEY, 9))).toBe(10)
  })
  it('hashString is pinned (changing it re-rolls every puzzle)', () => {
    expect(hashString('mixed:2026-11-11|nfl-BradTo00')).toBe(
      hashString('mixed:2026-11-11|nfl-BradTo00'),
    )
    expect(hashString('a')).not.toBe(hashString('b'))
    expect(hashString('whereheplay')).toBe(3113173939)
  })
})

describe('selectDaily', () => {
  const all = fixture()
  it('follows the tier plan: 3 easy, 1 medium, 1 hard', () => {
    for (const mode of ['nfl', 'nba', 'mixed'] as const) {
      const picks = selectDaily(all, mode, dateSeed(mode, '2026-11-11'))
      expect(picks.map((p) => p.t)).toEqual(TIER_PLAN)
      expect(new Set(picks.map((p) => p.id)).size).toBe(5)
    }
  })
  it('single-league modes only use that league', () => {
    expect(selectDaily(all, 'nfl', 's').every((p) => p.l === 'nfl')).toBe(true)
    expect(selectDaily(all, 'nba', 's').every((p) => p.l === 'nba')).toBe(true)
  })
  it('the grab bag alternates leagues (always a 3/2 split)', () => {
    for (let d = 0; d < 30; d++) {
      const seed = dateSeed('mixed', addDays('2026-11-11', d))
      const picks = selectDaily(all, 'mixed', seed)
      expect(picks.map((p) => p.l)).toEqual(leaguePlan('mixed', seed))
      const nfl = picks.filter((p) => p.l === 'nfl').length
      expect([2, 3]).toContain(nfl)
    }
  })
  it('is deterministic and independent of input order', () => {
    const a = selectDaily(all, 'mixed', 'seed-1').map((p) => p.id)
    const b = selectDaily([...all].reverse(), 'mixed', 'seed-1').map(
      (p) => p.id,
    )
    expect(a).toEqual(b)
    expect(selectDaily(all, 'mixed', 'seed-2').map((p) => p.id)).not.toEqual(a)
  })
  it('prefers a different school in each slot', () => {
    const picks = selectDaily(all, 'nfl', 'seed-3')
    expect(new Set(picks.map((p) => p.s[0])).size).toBe(5)
  })
  it('adding an unrelated player leaves the lineup alone unless he out-ranks a pick', () => {
    const base = selectDaily(all, 'nfl', 'seed-4').map((p) => p.id)
    let changed = 0
    for (let i = 0; i < 40; i++) {
      const extra: Player = { ...all[0], id: `nfl-new-${i}`, s: ['elsewhere'] }
      const next = selectDaily([...all, extra], 'nfl', 'seed-4').map(
        (p) => p.id,
      )
      if (next.join() !== base.join()) changed++
    }
    // A whole-pool shuffle would change it nearly every time.
    expect(changed).toBeLessThan(8)
  })
  it('skips excluded players and still fills a tiny pool', () => {
    const picks = selectDaily(all, 'nfl', 'seed-5')
    const again = selectDaily(
      all,
      'nfl',
      'seed-5',
      new Set(picks.map((p) => p.id)),
    )
    expect(again.some((p) => picks.includes(p))).toBe(false)
    const tiny = all.filter((p) => p.l === 'nfl').slice(0, 5)
    expect(
      selectDaily(tiny, 'nfl', 'x', new Set(tiny.map((p) => p.id))),
    ).toHaveLength(5)
    expect(() => selectDaily(tiny.slice(0, 4), 'nfl', 'x')).toThrow()
  })
})

describe('dailyLineup (cooldown)', () => {
  it('never repeats a player within the cooldown window', () => {
    // Big enough that the window can't exhaust a tier (2 easy/day × 45 days).
    const all = fixture(240)
    for (const mode of ['nfl', 'mixed'] as const) {
      const days = Array.from({ length: 120 }, (_, i) =>
        dailyLineup(all, mode, addDays(EPOCH_DATE_KEY, i)).map((p) => p.id),
      )
      for (let i = 0; i < days.length; i++) {
        const window = new Set(
          days.slice(Math.max(0, i - COOLDOWN_DAYS), i).flat(),
        )
        expect(days[i].some((id) => window.has(id))).toBe(false)
      }
    }
  })
  it('is the same no matter which day is asked for first', () => {
    const a = fixture()
    const b = fixture()
    const late = addDays(EPOCH_DATE_KEY, 60)
    const direct = dailyLineup(a, 'nba', late).map((p) => p.id)
    for (let i = 0; i <= 60; i++)
      dailyLineup(b, 'nba', addDays(EPOCH_DATE_KEY, i))
    expect(dailyLineup(b, 'nba', late).map((p) => p.id)).toEqual(direct)
  })
  it('day one has no history and equals a plain draw', () => {
    const all = fixture()
    expect(dailyLineup(all, 'nfl', EPOCH_DATE_KEY)).toEqual(
      selectDaily(all, 'nfl', dateSeed('nfl', EPOCH_DATE_KEY)),
    )
  })
  it('every day, from puzzle #1 on, is 3 easy, 1 medium, 1 hard', () => {
    const all = fixture(240)
    for (const i of [0, 1, 40])
      expect(
        dailyLineup(all, 'mixed', addDays(EPOCH_DATE_KEY, i)).map((p) => p.t),
      ).toEqual(['easy', 'easy', 'easy', 'medium', 'hard'])
    expect(tierPlanFor(EPOCH_DATE_KEY)).toBe(TIER_PLAN)
  })
})

describe('beginner daily (easy players only)', () => {
  const day = (i: number) => addDays(EPOCH_DATE_KEY, i)
  it('adding the variant leaves the standard seed and lineup untouched', () => {
    expect(dateSeed('nfl', '2026-11-11')).toBe('nfl:2026-11-11')
    expect(dateSeed('nfl', '2026-11-11', 'standard')).toBe('nfl:2026-11-11')
    expect(dateSeed('mixed', '2026-11-11', 'beginner')).toBe(
      'mixed-beginner:2026-11-11',
    )
    const a = fixture(240)
    const b = fixture(240)
    // Asking for beginner days first must not disturb the standard walk.
    for (let i = 0; i < 10; i++) dailyLineup(a, 'nfl', day(i), 'beginner')
    for (let i = 0; i < 10; i++)
      expect(dailyLineup(a, 'nfl', day(i)).map((p) => p.id)).toEqual(
        dailyLineup(b, 'nfl', day(i), 'standard').map((p) => p.id),
      )
  })
  it('is five different easy players, in every mode', () => {
    const all = fixture(240)
    for (const mode of ['nfl', 'nba', 'mixed'] as const)
      for (const i of [0, 1, 50]) {
        const picks = dailyLineup(all, mode, day(i), 'beginner')
        expect(picks.map((p) => p.t)).toEqual(Array(5).fill('easy'))
        expect(new Set(picks.map((p) => p.id)).size).toBe(5)
        if (mode !== 'mixed')
          expect(picks.every((p) => p.l === mode)).toBe(true)
        else expect([2, 3]).toContain(picks.filter((p) => p.l === 'nfl').length)
      }
  })
  it("never shares a player with the same day's standard daily", () => {
    const all = fixture(240)
    for (const mode of ['nfl', 'mixed'] as const)
      for (let i = 0; i < 60; i++) {
        const standard = new Set(
          dailyLineup(all, mode, day(i)).map((p) => p.id),
        )
        expect(
          dailyLineup(all, mode, day(i), 'beginner').some((p) =>
            standard.has(p.id),
          ),
        ).toBe(false)
      }
  })
  it('never repeats a player within its own cooldown window', () => {
    const all = fixture(240)
    const days = Array.from({ length: 90 }, (_, i) =>
      dailyLineup(all, 'nba', day(i), 'beginner').map((p) => p.id),
    )
    days.forEach((ids, i) => {
      const window = new Set(
        days.slice(Math.max(0, i - BEGINNER_COOLDOWN_DAYS), i).flat(),
      )
      expect(ids.some((id) => window.has(id))).toBe(false)
    })
  })
  it('stays easy-only even when the easy pool is too small for the cooldown', () => {
    // 12 easy NFL players: the window (and the standard daily) exhaust them,
    // so it must reuse an easy player rather than reach for a harder one.
    const all = fixture(12)
    for (let i = 0; i < 20; i++)
      expect(
        dailyLineup(all, 'nfl', day(i), 'beginner').every(
          (p) => p.t === 'easy',
        ),
      ).toBe(true)
  })
  it('is the same no matter which day is asked for first', () => {
    const a = fixture(240)
    const b = fixture(240)
    const direct = dailyLineup(a, 'mixed', day(40), 'beginner').map((p) => p.id)
    for (let i = 0; i <= 40; i++) dailyLineup(b, 'mixed', day(i), 'beginner')
    expect(
      dailyLineup(b, 'mixed', day(40), 'beginner').map((p) => p.id),
    ).toEqual(direct)
  })
})
