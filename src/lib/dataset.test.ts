import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import type { Player, School } from '../types'
import {
  COOLDOWN_DAYS,
  EPOCH_DATE_KEY,
  TIER_PLAN,
  tierPlanFor,
  addDays,
  dailyLineup,
} from './daily'
import { choices } from './game'

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
      // A photo to show: the league headshot, or the Wikimedia one.
      expect(p.h || p.a, p.id).toBeTruthy()
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
      if (p.l === 'nba') expect(p.h, p.id).toMatch(/^\d+$/)
      else
        expect(p.h, p.id).toMatch(
          /^(espn:\d+|clubs:[\w,/.-]+|(private|upload)\/.+)$/,
        )
    }
  })

  it('every tier is deep enough that the cooldown never runs dry', () => {
    for (const l of ['nfl', 'nba'] as const)
      for (const t of ['easy', 'medium', 'hard'] as const) {
        const perDay = TIER_PLAN.filter((x) => x === t).length
        const have = players.filter((p) => p.l === l && p.t === t).length
        expect(have, `${l} ${t}`).toBeGreaterThan(perDay * (COOLDOWN_DAYS + 1))
      }
  })
  it('a year of real dailies follows the plan with no repeat inside the window', () => {
    for (const mode of ['nfl', 'nba', 'mixed'] as const) {
      const days = Array.from({ length: 365 }, (_, i) =>
        dailyLineup(players, mode, addDays(EPOCH_DATE_KEY, i)),
      )
      days.forEach((day, i) => {
        expect(
          day.map((p) => p.t),
          `${mode} day ${i}`,
        ).toEqual(tierPlanFor(addDays(EPOCH_DATE_KEY, i)))
        const window = new Set(
          days
            .slice(Math.max(0, i - COOLDOWN_DAYS), i)
            .flatMap((d) => d.map((p) => p.id)),
        )
        expect(
          day.some((p) => window.has(p.id)),
          `${mode} day ${i}`,
        ).toBe(false)
      })
    }
  })
})
