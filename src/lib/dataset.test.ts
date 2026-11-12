import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import type { Player, School } from '../types'
import {
  BEGINNER_COOLDOWN_DAYS,
  BEGINNER_PLAN,
  cooldownFor,
  eligibleOn,
  COOLDOWN_DAYS,
  EPOCH_DATE_KEY,
  TIER_PLAN,
  tierPlanFor,
  addDays,
  dailyLineup,
} from './daily'
import { choices } from './game'
import { actionDirectUrl, headshotUrl } from './images'

/** Guards over the COMMITTED dataset (public/*.json) — the build's contract. */
const load = <T>(f: string): T =>
  JSON.parse(
    readFileSync(new URL(`../../public/${f}`, import.meta.url), 'utf8'),
  )
const players = load<Player[]>('players.json')
const schools = load<School[]>('schools.json')
const schoolIds = new Set(schools.map((s) => s.id))

describe('schools.json', () => {
  it('has unique ids and names', () => {
    expect(schoolIds.size).toBe(schools.length)
    expect(new Set(schools.map((s) => s.name)).size).toBe(schools.length)
  })
})

describe('players.json', () => {
  it('is big: at least 700 players per league', () => {
    for (const l of ['nfl', 'nba'])
      expect(players.filter((p) => p.l === l).length).toBeGreaterThanOrEqual(
        700,
      )
  })
  it('has unique ids', () => {
    expect(new Set(players.map((p) => p.id)).size).toBe(players.length)
  })
  it('every row is complete and points at real schools', () => {
    for (const p of players) {
      expect(p.n, p.id).toBeTruthy()
      expect(['nfl', 'nba'], p.id).toContain(p.l)
      expect(['easy', 'medium', 'hard'], p.id).toContain(p.t)
      expect(p.c, p.id).toBeTruthy()
      expect(p.y, p.id).toBeGreaterThanOrEqual(1994)
      expect(p.s.length, p.id).toBeGreaterThan(0)
      for (const id of [...p.s, ...p.d])
        expect(schoolIds.has(id), `${p.id} → ${id}`).toBe(true)
    }
  })
  it('every player has four distinct choices with exactly one right answer', () => {
    for (const p of players) {
      const c = choices(p)
      expect(new Set(c).size, p.id).toBe(4)
      expect(
        c.filter((id) => p.s.includes(id)),
        p.id,
      ).toEqual([p.s[0]])
    }
  })
  it('internationals are listed, NBA, easy, answer "International", with top-program decoys', () => {
    const listed = new Set(
      (
        JSON.parse(
          readFileSync(
            new URL('../../data/international.json', import.meta.url),
            'utf8',
          ),
        ).players as { name: string }[]
      ).map((p) =>
        p.name
          .normalize('NFKD')
          .toLowerCase()
          .replace(/[^a-z]/g, ''),
      ),
    )
    const intl = players.filter((p) => p.s[0] === 'international')
    expect(intl.length).toBeGreaterThanOrEqual(20)
    for (const p of intl) {
      expect(
        listed.has(
          p.n
            .normalize('NFKD')
            .toLowerCase()
            .replace(/[^a-z]/g, ''),
        ),
        p.id,
      ).toBe(true)
      expect(p.l, p.id).toBe('nba')
      expect(p.t, p.id).toBe('easy')
      expect(p.s, p.id).toEqual(['international'])
      expect(p.d, p.id).not.toContain('international')
      expect(p.d, p.id).not.toContain('high-school')
    }
    expect(schools.find((s) => s.id === 'international')?.aliases).toContain(
      'International',
    )
  })
  it('preps-to-pros players are in, answer "High School", and carry their real school', () => {
    const preps = players.filter((p) => p.s[0] === 'high-school')
    expect(preps.length).toBeGreaterThanOrEqual(30)
    for (const p of preps) {
      expect(p.l, p.id).toBe('nba')
      expect(p.s, p.id).toEqual(['high-school'])
      expect(p.hs, p.id).toBeTruthy()
      expect(p.d, p.id).not.toContain('high-school')
    }
    for (const n of [
      'LeBron James',
      'Kobe Bryant',
      'Kevin Garnett',
      'Dwight Howard',
      'Tracy McGrady',
    ])
      expect(
        preps.some((p) => p.n === n),
        n,
      ).toBe(true)
    // Nobody else carries a high school, and it is a typed answer.
    expect(players.filter((p) => p.hs && p.s[0] !== 'high-school')).toEqual([])
    expect(schools.find((s) => s.id === 'high-school')?.aliases).toContain(
      'High School',
    )
  })

  it('headshot keys are one of the known shapes', () => {
    for (const p of players) {
      if (!p.h) continue
      if (p.l === 'nba')
        expect(p.h, p.id).toMatch(
          /^((espn:)?\d+|bbr:[a-z]+\d{2}|(web|local):.+)$/,
        )
      else
        expect(p.h, p.id).toMatch(
          /^(espn:\d+|clubs:[\w,/.-]+|pfr:[A-Za-z]+\d{2}_(USAT_)?\d{4}|(web|local):.+|(private|upload)\/.+)$/,
        )
      // A hand-found headshot must be a well-formed key the client can show.
      if (/^(web|local):/.test(p.h)) expect(headshotUrl(p), p.id).not.toBeNull()
    }
  })

  const data = (f: string) =>
    JSON.parse(
      readFileSync(new URL(`../../data/${f}`, import.meta.url), 'utf8'),
    )
  it('a headshot is a headshot: no league placeholder, no action cut-out', () => {
    const not = new Set<string>([
      ...data('nba-placeholder-heads.json'),
      ...data('nfl-placeholder-heads.json'),
      ...Object.keys(data('nfl-not-headshots.json')),
    ])
    for (const p of players) if (p.h) expect(not.has(p.h), p.id).toBe(false)
  })
  it('no two players share a playing photo, and every key has a known shape', () => {
    // A shared photo means one of them is shown someone else (it happened:
    // Jason Smith was once given a photo of Alan Williams).
    const seen = new Map<string, string>()
    for (const p of players) {
      if (!p.a) continue
      expect(seen.get(p.a), `${p.id} and ${seen.get(p.a)}`).toBeUndefined()
      seen.set(p.a, p.id)
      expect(p.a, p.id).toMatch(
        /^([0-9a-f]{2}\/[^/]+\.(jpe?g|png)|tsdb:(thumb|cutout|render|fanart)\/[a-z0-9]+\.(jpg|png)|(web|local):.+)$/i,
      )
      // A hand-found photo must be a well-formed key the client can show.
      if (/^(web|local):/.test(p.a))
        expect(actionDirectUrl(p), p.id).not.toBeNull()
    }
  })
  it('every "local:" photo is in public/photos/', () => {
    for (const p of players)
      for (const key of [p.a, p.h])
        if (key?.startsWith('local:'))
          expect(
            existsSync(
              new URL(`../../public/photos/${key.slice(6)}`, import.meta.url),
            ),
            `${p.id} ${key}`,
          ).toBe(true)
  })
  it('a playing photo is a playing photo: nothing from the blocklist', () => {
    const lists = data('photo-blocklist.json')
    const allowed = new Set<string>(lists.allow)
    const blocked = new Set<string>(
      [
        ...lists.manual,
        ...lists.auto,
        ...lists.notPlaying,
        ...lists.weak,
      ].filter((f: string) => !allowed.has(f) || lists.notPlaying.includes(f)),
    )
    for (const p of players)
      if (p.a)
        expect(blocked.has(p.a.slice(p.a.indexOf('/') + 1)), p.id).toBe(false)
  })
  it('`e` (may be drawn): his window is open exactly when he has both photos; and it matches data/eligible-since.json', () => {
    const since = data('eligible-since.json')
    for (const p of players) {
      // One day, or window edges [from, until, from, …]; odd length = open.
      const edges = [p.e ?? []].flat()
      expect(edges.length % 2 === 1, p.id).toBe(!!p.h && !!p.a)
      edges.forEach((d, i) => {
        expect(Number.isInteger(d) && d >= 0, p.id).toBe(true)
        if (i) expect(d, p.id).toBeGreaterThan(edges[i - 1])
      })
      expect(since[p.id], p.id).toEqual(p.e)
    }
    // The build script counts days from the same epoch as the game.
    const buildLib = readFileSync(
      new URL('../../scripts/lib/photos.mjs', import.meta.url),
      'utf8',
    )
    expect(buildLib).toContain(`EPOCH_DATE_KEY = '${EPOCH_DATE_KEY}'`)
  })
  it('the launch pool is deep enough: every board can go at least two weeks without a repeat', () => {
    const launch = eligibleOn(players, EPOCH_DATE_KEY)
    for (const mode of ['nfl', 'nba', 'mixed'] as const) {
      const pool =
        mode === 'mixed' ? launch : launch.filter((p) => p.l === mode)
      expect(
        cooldownFor(pool, mode, TIER_PLAN, COOLDOWN_DAYS),
        mode,
      ).toBeGreaterThanOrEqual(14)
      expect(
        cooldownFor(
          pool.filter((p) => p.t === 'easy'),
          mode,
          BEGINNER_PLAN,
          BEGINNER_COOLDOWN_DAYS,
          mode === 'mixed' ? 2 : 3,
        ),
        `${mode} beginner`,
      ).toBeGreaterThanOrEqual(14)
    }
  })
  /** The no-repeat window a board really has on day `i` (cooldownFor). */
  const windowOn = (
    mode: 'nfl' | 'nba' | 'mixed',
    i: number,
    beginner: boolean,
  ) => {
    const eligible = eligibleOn(players, addDays(EPOCH_DATE_KEY, i))
    const pool =
      mode === 'mixed' ? eligible : eligible.filter((p) => p.l === mode)
    return beginner
      ? cooldownFor(
          pool.filter((p) => p.t === 'easy'),
          mode,
          BEGINNER_PLAN,
          BEGINNER_COOLDOWN_DAYS,
          mode === 'mixed' ? 2 : 3,
        )
      : cooldownFor(pool, mode, TIER_PLAN, COOLDOWN_DAYS)
  }
  it('a year of real dailies: only players with both photos, on plan, no repeat inside the window', () => {
    for (const mode of ['nfl', 'nba', 'mixed'] as const) {
      const days = Array.from({ length: 365 }, (_, i) =>
        dailyLineup(players, mode, addDays(EPOCH_DATE_KEY, i)),
      )
      days.forEach((day, i) => {
        const eligible = new Set(
          eligibleOn(players, addDays(EPOCH_DATE_KEY, i)),
        )
        expect(
          day.every((p) => p.h && p.a && eligible.has(p)),
          `${mode} day ${i}`,
        ).toBe(true)
        expect(
          day.map((p) => p.t),
          `${mode} day ${i}`,
        ).toEqual(tierPlanFor(addDays(EPOCH_DATE_KEY, i)))
        const window = new Set(
          days
            .slice(Math.max(0, i - windowOn(mode, i, false)), i)
            .flatMap((d) => d.map((p) => p.id)),
        )
        expect(
          day.some((p) => window.has(p.id)),
          `${mode} day ${i}`,
        ).toBe(false)
      })
    }
  })
  it("a year of real beginner dailies is all easy, with no repeat inside the window and nobody from that day's standard daily", () => {
    for (const mode of ['nfl', 'nba', 'mixed'] as const) {
      const days = Array.from({ length: 365 }, (_, i) =>
        dailyLineup(players, mode, addDays(EPOCH_DATE_KEY, i), 'beginner'),
      )
      days.forEach((day, i) => {
        expect(
          day.map((p) => p.t),
          `${mode} day ${i}`,
        ).toEqual(Array(5).fill('easy'))
        expect(
          day.every((p) => p.h && p.a),
          `${mode} day ${i}`,
        ).toBe(true)
        const blocked = new Set([
          ...days
            .slice(Math.max(0, i - windowOn(mode, i, true)), i)
            .flatMap((d) => d.map((p) => p.id)),
          ...dailyLineup(players, mode, addDays(EPOCH_DATE_KEY, i)).map(
            (p) => p.id,
          ),
        ])
        expect(
          day.some((p) => blocked.has(p.id)),
          `${mode} day ${i}`,
        ).toBe(false)
      })
    }
  })
})
