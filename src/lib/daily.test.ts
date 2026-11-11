import { describe, it, expect } from 'vitest'
import type { League, Player, Tier } from '../types'
import {
  COOLDOWN_DAYS,
  EPOCH_DATE_KEY,
  TIER_PLAN,
  LEGACY_TIER_PLAN,
  TIER_PLAN_FROM,
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
      selectDaily(
        all,
        'nfl',
        dateSeed('nfl', EPOCH_DATE_KEY),
        undefined,
        LEGACY_TIER_PLAN,
      ),
    )
  })
  it('puzzle #1 keeps 2-2-1; every later day is 3 easy, 1 medium, 1 hard', () => {
    const all = fixture(240)
    const tiers = (d: string) => dailyLineup(all, 'mixed', d).map((p) => p.t)
    expect(tiers(EPOCH_DATE_KEY)).toEqual([
      'easy',
      'easy',
      'medium',
      'medium',
      'hard',
    ])
    expect(tiers(TIER_PLAN_FROM)).toEqual([
      'easy',
      'easy',
      'easy',
      'medium',
      'hard',
    ])
    expect(tiers(addDays(TIER_PLAN_FROM, 40))).toEqual(TIER_PLAN)
    expect(tierPlanFor('2026-11-11')).toBe(LEGACY_TIER_PLAN)
    expect(tierPlanFor('2026-11-12')).toBe(TIER_PLAN)
  })
})
