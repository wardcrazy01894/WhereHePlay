import { describe, it, expect } from 'vitest'
import type { Player } from '../types'
import { canRequest, hasPlayer, searchPlayers } from './playerSearch'

const mk = (n: string, l: 'nfl' | 'nba' = 'nfl'): Player => ({
  id: n,
  n,
  l,
  s: ['a'],
  c: 'SEC',
  y: 2010,
  t: 'easy',
  d: ['b', 'c', 'd'],
  h: 'x',
})
const players = [
  mk('Tom Brady'),
  mk('Brady Quinn'),
  mk('Drew Brees'),
  mk("D'Angelo Russell", 'nba'),
  mk('Odell Beckham Jr.'),
  mk('Aaron Brooks', 'nba'),
]
const names = (q: string) => searchPlayers(players, q).map((p) => p.n)

describe('searchPlayers', () => {
  it('needs two characters', () => {
    expect(names('')).toEqual([])
    expect(names('b')).toEqual([])
  })
  it('ranks exact, then first-name prefix, then later-word prefix, then substring', () => {
    expect(names('brady')).toEqual(['Brady Quinn', 'Tom Brady'])
    expect(names('tom brady')).toEqual(['Tom Brady'])
    expect(names('br')).toEqual([
      'Brady Quinn',
      'Aaron Brooks',
      'Drew Brees',
      'Tom Brady',
    ])
  })
  it('ignores case, apostrophes and periods', () => {
    expect(names('dangelo')).toEqual(["D'Angelo Russell"])
    expect(names('beckham jr')).toEqual(['Odell Beckham Jr.'])
  })
  it('respects the limit', () => {
    expect(searchPlayers(players, 'br', 2)).toHaveLength(2)
  })
})

describe('requests', () => {
  it('hasPlayer is an exact (normalised) name match', () => {
    expect(hasPlayer(players, 'tom BRADY')).toBe(true)
    expect(hasPlayer(players, 'Tom')).toBe(false)
  })
  it('only a plausible, missing name can be requested', () => {
    expect(canRequest(players, 'Kurt Warner')).toBe(true)
    expect(canRequest(players, 'Tom Brady')).toBe(false) // already in
    expect(canRequest(players, 'ab')).toBe(false) // too short
    expect(canRequest(players, '12345')).toBe(false) // not a name
    expect(canRequest(players, 'x'.repeat(61))).toBe(false)
  })
})
