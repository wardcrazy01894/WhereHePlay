import { describe, it, expect } from 'vitest'
import type { League, Player, Tier } from '../types'
import {
  EASY_COOLDOWN_DAYS,
  EASY_PLAN,
  cooldownFor,
  eligibleOn,
  COOLDOWN_DAYS,
  EPOCH_DATE_KEY,
  TIER_PLAN,
  tierPlanFor,
  addDays,
  dailyLineup,
  drawFor,
  drawLineup,
  tiersOn,
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
          a: 'ab/x.jpg',
          d: ['a', 'b', 'c'],
          e: 0,
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
        drawLineup(all, mode, addDays(EPOCH_DATE_KEY, i), 'classic').map(
          (p) => p.id,
        ),
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
    const direct = drawLineup(a, 'nba', late, 'classic').map((p) => p.id)
    for (let i = 0; i <= 60; i++)
      drawLineup(b, 'nba', addDays(EPOCH_DATE_KEY, i), 'classic')
    expect(drawLineup(b, 'nba', late, 'classic').map((p) => p.id)).toEqual(
      direct,
    )
  })
  it('day one has no history and equals a plain draw', () => {
    const all = fixture()
    expect(drawLineup(all, 'nfl', EPOCH_DATE_KEY, 'classic')).toEqual(
      selectDaily(all, 'nfl', dateSeed('nfl', EPOCH_DATE_KEY)),
    )
  })
  it('the classic draw is 3 easy, 1 medium, 1 hard every day, from puzzle #1 on', () => {
    const all = fixture(240)
    for (const i of [0, 1, 40])
      expect(
        drawLineup(all, 'mixed', addDays(EPOCH_DATE_KEY, i), 'classic').map(
          (p) => p.t,
        ),
      ).toEqual(['easy', 'easy', 'easy', 'medium', 'hard'])
  })
})

describe('the swap of 2026-11-14: the daily is five easy, the second daily is Sicko Mode', () => {
  const ids = (ps: Player[]) => ps.map((p) => p.id)
  const before = ['2026-11-11', '2026-11-12', '2026-11-13']
  const after = ['2026-11-14', '2026-11-15', '2027-03-01']
  it('drawFor / tierPlanFor: which draw each daily shows, by day', () => {
    for (const d of before) {
      expect(drawFor('standard', d)).toBe('classic')
      expect(drawFor('beginner', d)).toBe('easy')
      expect(tierPlanFor(d)).toBe(TIER_PLAN)
      expect(tierPlanFor(d, 'beginner')).toBe(EASY_PLAN)
    }
    for (const d of after) {
      expect(drawFor('standard', d)).toBe('easy')
      expect(drawFor('beginner', d)).toBe('classic')
      expect(tierPlanFor(d)).toBe(EASY_PLAN)
      expect(tierPlanFor(d, 'beginner')).toBe(TIER_PLAN)
    }
    // A practice day before the epoch is the daily as it launched.
    expect(drawFor('standard', '2026-11-01')).toBe('classic')
  })
  it('the seeds are pinned: neither draw has moved since launch', () => {
    expect(dateSeed('nfl', '2026-11-14')).toBe('nfl:2026-11-14')
    expect(dateSeed('nfl', '2026-11-14', 'easy')).toBe(
      'nfl-beginner:2026-11-14',
    )
  })
  it('each daily shows its old draw through 2026-11-13 and the other one from 2026-11-14', () => {
    const all = fixture(240)
    for (const mode of ['nfl', 'nba', 'mixed'] as const) {
      for (const d of before) {
        expect(ids(dailyLineup(all, mode, d))).toEqual(
          ids(drawLineup(all, mode, d, 'classic')),
        )
        expect(ids(dailyLineup(all, mode, d, 'beginner'))).toEqual(
          ids(drawLineup(all, mode, d, 'easy')),
        )
      }
      for (const d of after) {
        const daily = dailyLineup(all, mode, d)
        const sicko = dailyLineup(all, mode, d, 'beginner')
        expect(daily.map((p) => p.t)).toEqual(EASY_PLAN)
        expect(sicko.map((p) => p.t)).toEqual(TIER_PLAN)
        expect(ids(daily)).toEqual(ids(drawLineup(all, mode, d, 'easy')))
        expect(ids(sicko)).toEqual(ids(drawLineup(all, mode, d, 'classic')))
        // Playing both never shows a player twice in a day.
        expect(daily.some((p) => sicko.includes(p))).toBe(false)
      }
    }
  })
  it('the swap leaves both walks unbroken: no repeat across it inside the window', () => {
    const all = fixture(240)
    const days = Array.from({ length: 40 }, (_, i) =>
      ids(dailyLineup(all, 'nfl', addDays(EPOCH_DATE_KEY, i), 'beginner')),
    )
    // Sicko Mode from day 3 on is the classic walk: nobody from the classic
    // lineups of days 0-2 (the old daily) comes back inside 45 days.
    const old = new Set(
      [0, 1, 2].flatMap((i) =>
        ids(drawLineup(all, 'nfl', addDays(EPOCH_DATE_KEY, i), 'classic')),
      ),
    )
    expect(
      days
        .slice(3)
        .flat()
        .some((id) => old.has(id)),
    ).toBe(false)
  })
})

describe('tiersOn: a player moved to another tier keeps the old one on earlier days (`tw`)', () => {
  const day = (i: number) => addDays(EPOCH_DATE_KEY, i)
  const ids = (ps: Player[]) => ps.map((p) => p.id)
  it('old tier before the day, new tier from it; everyone else is the same row', () => {
    const [a, b] = fixture(1)
    const moved: Player = { ...a, t: 'easy', tw: [3, 'hard'] }
    expect(tiersOn([moved, b], day(2)).map((p) => p.t)).toEqual(['hard', b.t])
    expect(tiersOn([moved, b], day(3))[0]).toBe(moved)
    expect(tiersOn([moved, b], day(2))[1]).toBe(b)
    expect(tiersOn([moved], addDays(EPOCH_DATE_KEY, -4))[0].t).toBe('hard')
  })
  it('moving players to easy on day 3 changes no lineup of days 0-2, in any mode or draw, and they are drawn as easy afterwards', () => {
    // A deep pool: the no-repeat window is then never the pool's limit.
    const base = fixture(240)
    // Every third medium or hard player becomes easy from day 3.
    const later = base.map((p, i): Player =>
      p.t !== 'easy' && i % 3 === 0 ? { ...p, t: 'easy', tw: [3, p.t] } : p,
    )
    const movedIds = new Set(later.filter((p) => p.tw).map((p) => p.id))
    for (const mode of ['nfl', 'nba', 'mixed'] as const)
      for (const kind of ['classic', 'easy'] as const) {
        for (let i = 0; i < 3; i++)
          expect(ids(drawLineup(later, mode, day(i), kind))).toEqual(
            ids(drawLineup(base, mode, day(i), kind)),
          )
        const seen = Array.from({ length: 40 }, (_, i) =>
          drawLineup(later, mode, day(3 + i), kind),
        )
        // Lineups hold the dataset's own rows, never a re-tiered copy.
        expect(seen.flat().every((p) => later.includes(p))).toBe(true)
        if (kind === 'easy')
          expect(seen.flat().some((p) => movedIds.has(p.id))).toBe(true)
        else
          for (const lineup of seen)
            expect(lineup.map((p) => p.t)).toEqual(TIER_PLAN)
      }
  })
})

describe('the easy draw (easy players only)', () => {
  const day = (i: number) => addDays(EPOCH_DATE_KEY, i)
  it('adding the variant leaves the standard seed and lineup untouched', () => {
    expect(dateSeed('nfl', '2026-11-11')).toBe('nfl:2026-11-11')
    expect(dateSeed('nfl', '2026-11-11', 'classic')).toBe('nfl:2026-11-11')
    expect(dateSeed('mixed', '2026-11-11', 'easy')).toBe(
      'mixed-beginner:2026-11-11',
    )
    const a = fixture(240)
    const b = fixture(240)
    // Asking for beginner days first must not disturb the standard walk.
    for (let i = 0; i < 10; i++) drawLineup(a, 'nfl', day(i), 'easy')
    for (let i = 0; i < 10; i++)
      expect(drawLineup(a, 'nfl', day(i), 'classic').map((p) => p.id)).toEqual(
        drawLineup(b, 'nfl', day(i), 'classic').map((p) => p.id),
      )
  })
  it('is five different easy players, in every mode', () => {
    const all = fixture(240)
    for (const mode of ['nfl', 'nba', 'mixed'] as const)
      for (const i of [0, 1, 50]) {
        const picks = drawLineup(all, mode, day(i), 'easy')
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
          drawLineup(all, mode, day(i), 'classic').map((p) => p.id),
        )
        expect(
          drawLineup(all, mode, day(i), 'easy').some((p) => standard.has(p.id)),
        ).toBe(false)
      }
  })
  it('never repeats a player within its own cooldown window', () => {
    const all = fixture(240)
    const days = Array.from({ length: 90 }, (_, i) =>
      drawLineup(all, 'nba', day(i), 'easy').map((p) => p.id),
    )
    days.forEach((ids, i) => {
      const window = new Set(
        days.slice(Math.max(0, i - EASY_COOLDOWN_DAYS), i).flat(),
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
        drawLineup(all, 'nfl', day(i), 'easy').every((p) => p.t === 'easy'),
      ).toBe(true)
  })
  it('is the same no matter which day is asked for first', () => {
    const a = fixture(240)
    const b = fixture(240)
    const direct = drawLineup(a, 'mixed', day(40), 'easy').map((p) => p.id)
    for (let i = 0; i <= 40; i++) drawLineup(b, 'mixed', day(i), 'easy')
    expect(drawLineup(b, 'mixed', day(40), 'easy').map((p) => p.id)).toEqual(
      direct,
    )
  })
})

describe('only players with both photos are drawn (`e`: eligible since day N)', () => {
  const day = (i: number) => addDays(EPOCH_DATE_KEY, i)
  const ids = (ps: Player[]) => ps.map((p) => p.id)
  it('eligibleOn: `e` at or before that day; no `e` means not yet', () => {
    const [a, b, c] = fixture(1)
    const all = [
      { ...a, e: 0 },
      { ...b, e: 3 },
      { ...c, e: undefined },
    ]
    expect(ids(eligibleOn(all, day(0)))).toEqual([a.id])
    expect(ids(eligibleOn(all, day(3)))).toEqual([a.id, b.id])
    // A practice day before the epoch draws from the launch pool.
    expect(ids(eligibleOn(all, addDays(EPOCH_DATE_KEY, -5)))).toEqual([a.id])
  })
  it('eligibleOn: windows — a player who lost a photo keeps the days he had, and may return', () => {
    const [a] = fixture(1)
    // Eligible days 0–19, out from day 20, back from day 31.
    const p = { ...a, e: [0, 20, 31] }
    const on = (i: number) => eligibleOn([p], day(i)).length === 1
    expect([0, 19, 20, 30, 31, 400].map(on)).toEqual([
      true,
      true,
      false,
      false,
      true,
      true,
    ])
    expect(eligibleOn([{ ...a, e: [3, 9] }], day(9))).toEqual([])
  })
  it('taking a photo away later never changes a day already played', () => {
    const base = fixture(240)
    // The same data after 60 players lost a photo on day 10.
    const later = base.map((p, i) => (i % 4 === 0 ? { ...p, e: [0, 10] } : p))
    for (const kind of ['classic', 'easy'] as const)
      for (let i = 0; i < 10; i++)
        expect(ids(drawLineup(later, 'mixed', day(i), kind))).toEqual(
          ids(drawLineup(base, 'mixed', day(i), kind)),
        )
    const out = new Set(
      later.filter((p) => Array.isArray(p.e)).map((p) => p.id),
    )
    for (let i = 10; i < 60; i++)
      expect(
        drawLineup(later, 'nfl', day(i), 'classic').some((p) => out.has(p.id)),
      ).toBe(false)
  })
  it('a player waiting for a photo is never in a lineup, in any mode or variant', () => {
    const all = fixture(240).map((p, i) =>
      i % 3 === 0 ? { ...p, e: undefined } : p,
    )
    const waiting = new Set(
      all.filter((p) => p.e === undefined).map((p) => p.id),
    )
    for (const mode of ['nfl', 'nba', 'mixed'] as const)
      for (const kind of ['classic', 'easy'] as const)
        for (let i = 0; i < 40; i++)
          expect(
            drawLineup(all, mode, day(i), kind).some((p) => waiting.has(p.id)),
          ).toBe(false)
  })
  it('photos that land later never change a day already played — he joins from his day on', () => {
    const base = fixture(240)
    // The same data after 60 more players got their photos on day 10.
    const later = base.map((p, i) => (i % 4 === 0 ? { ...p, e: 10 } : p))
    const before = later.filter((p) => p.e === 0)
    for (const kind of ['classic', 'easy'] as const) {
      for (let i = 0; i < 10; i++)
        expect(ids(drawLineup(later, 'mixed', day(i), kind))).toEqual(
          ids(drawLineup(before, 'mixed', day(i), kind)),
        )
      const joined = new Set(later.filter((p) => p.e === 10).map((p) => p.id))
      const seen = Array.from({ length: 60 }, (_, i) =>
        drawLineup(later, 'mixed', day(10 + i), kind),
      ).flat()
      expect(seen.some((p) => joined.has(p.id))).toBe(true)
    }
  })
  it('cooldownFor: the no-repeat window shrinks to what the pool can sustain', () => {
    const big = fixture(240)
    expect(cooldownFor(big, 'nfl', TIER_PLAN, COOLDOWN_DAYS)).toBe(
      COOLDOWN_DAYS,
    )
    // 40 easy NFL players at three a day: 12 days of history plus today.
    const small = fixture(40)
    expect(cooldownFor(small, 'nfl', TIER_PLAN, COOLDOWN_DAYS)).toBe(12)
    // The grab bag takes at most two easy players a day from one league.
    expect(cooldownFor(small, 'mixed', TIER_PLAN, COOLDOWN_DAYS)).toBe(19)
    // Beginner: five a day, and three are held back by the standard daily.
    expect(cooldownFor(small, 'nfl', EASY_PLAN, EASY_COOLDOWN_DAYS, 3)).toBe(6)
    expect(cooldownFor(fixture(3), 'nfl', TIER_PLAN, COOLDOWN_DAYS)).toBe(0)
  })
  it('a small pool still follows the plan and never repeats inside its own window', () => {
    const all = fixture(40)
    for (const mode of ['nfl', 'mixed'] as const) {
      const window = cooldownFor(all, mode, TIER_PLAN, COOLDOWN_DAYS)
      const days = Array.from({ length: 120 }, (_, i) =>
        drawLineup(all, mode, day(i), 'classic'),
      )
      days.forEach((lineup, i) => {
        expect(lineup.map((p) => p.t)).toEqual(TIER_PLAN)
        const recent = new Set(
          days.slice(Math.max(0, i - window), i).flatMap(ids),
        )
        expect(lineup.some((p) => recent.has(p.id))).toBe(false)
      })
    }
    // Beginner on the same small pool: easy only, no repeat in its window,
    // nobody from that day's standard daily.
    const bWindow = cooldownFor(
      all.filter((p) => p.t === 'easy'),
      'nfl',
      EASY_PLAN,
      EASY_COOLDOWN_DAYS,
      3,
    )
    const b = Array.from({ length: 80 }, (_, i) =>
      drawLineup(all, 'nfl', day(i), 'easy'),
    )
    b.forEach((lineup, i) => {
      expect(lineup.every((p) => p.t === 'easy')).toBe(true)
      const blocked = new Set([
        ...b.slice(Math.max(0, i - bWindow), i).flatMap(ids),
        ...ids(drawLineup(all, 'nfl', day(i), 'classic')),
      ])
      expect(lineup.some((p) => blocked.has(p.id))).toBe(false)
    })
  })
})
