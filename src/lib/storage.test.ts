import { describe, it, expect } from 'vitest'
import { type Stats, bumpStats, liveStreak } from './storage'
import { shareText, squares } from './share'
import { giveUp, guess, newQuestion, takeHint } from './game'
import { nextFreePlayer } from './freeplay'
import { actionCreditUrl, actionUrls, headshotUrl } from './images'
import type { Player } from '../types'
import { boardId, gameLabel } from '../types'

const empty: Stats = {
  current: 0,
  best: 0,
  lastDate: '',
  played: 0,
  totalPoints: 0,
}
const p: Player = {
  id: 'nfl-x',
  n: 'X',
  l: 'nfl',
  s: ['a'],
  c: 'SEC',
  y: 2010,
  t: 'easy',
  h: 'private/f_auto,q_auto/league/abc',
  d: ['b', 'c', 'd'],
}

describe('streaks', () => {
  it('counts consecutive days, holds on a repeat, restarts after a gap', () => {
    const d1 = bumpStats(empty, '2026-11-11', 300)
    expect(d1).toMatchObject({
      current: 1,
      best: 1,
      played: 1,
      totalPoints: 300,
    })
    const d2 = bumpStats(d1, '2026-11-12', 500)
    expect(d2).toMatchObject({
      current: 2,
      best: 2,
      played: 2,
      totalPoints: 800,
    })
    expect(bumpStats(d2, '2026-11-12', 0)).toBe(d2)
    expect(bumpStats(d2, '2026-11-15', 100)).toMatchObject({
      current: 1,
      best: 2,
      played: 3,
    })
  })
  it('crosses month ends', () => {
    const a = bumpStats(empty, '2026-11-30', 0)
    expect(bumpStats(a, '2026-12-01', 0).current).toBe(2)
  })
  it('a streak not extended yesterday or today shows as 0', () => {
    const s = bumpStats(empty, '2026-11-11', 0)
    expect(liveStreak(s, '2026-11-11')).toBe(1)
    expect(liveStreak(s, '2026-11-12')).toBe(1)
    expect(liveStreak(s, '2026-11-13')).toBe(0)
  })
})

describe('share', () => {
  it('builds the card', () => {
    const qs = [
      guess(newQuestion(), p, 'a'),
      guess(takeHint(newQuestion()), p, 'a'),
      guess(takeHint(takeHint(newQuestion())), p, 'a'),
      guess(takeHint(takeHint(takeHint(newQuestion()))), p, 'a'),
      giveUp(newQuestion()),
    ]
    expect(shareText('nfl', '2026-11-11', qs, 'https://x.test/')).toBe(
      'WhereHePlay #1 · NFL (headshot)\n🟩🟨🟧🟥⬛ 250/500\nhttps://x.test/',
    )
    // The first-photo choice is on the card.
    expect(
      shareText('nba', '2026-11-12', qs, 'https://x.test/', 'action').split(
        '\n',
      )[0],
    ).toBe('WhereHePlay #2 · NBA (in action)')
    expect(squares('9')).toBe('⬛')
  })
  it('a beginner daily says so on the card', () => {
    expect(
      shareText(
        'mixed',
        '2026-11-11',
        [],
        'https://x.test/',
        'headshot',
        'beginner',
      ).split('\n')[0],
    ).toBe('WhereHePlay #1 · Grab Bag Beginner (headshot)')
  })
})

describe('free play', () => {
  const pool = Array.from({ length: 10 }, (_, i) => ({ ...p, id: `nfl-${i}` }))
  it('never repeats a recent player', () => {
    const recent: string[] = []
    for (let i = 0; i < 9; i++) {
      const next = nextFreePlayer(pool, 'nfl', recent, () => 0)
      expect(recent).not.toContain(next.id)
      recent.push(next.id)
    }
  })
  it('respects the mode and survives rand() === 1', () => {
    expect(() => nextFreePlayer(pool, 'nba', [])).toThrow()
    expect(nextFreePlayer(pool, 'mixed', [], () => 1).id).toBe('nfl-9')
  })
})

describe('images', () => {
  it('builds CDN URLs per league', () => {
    expect(headshotUrl(p)).toBe(
      'https://static.www.nfl.com/image/private/f_auto,q_auto/league/abc',
    )
    expect(headshotUrl({ ...p, l: 'nba', h: '201939' })).toBe(
      'https://cdn.nba.com/headshots/nba/latest/260x190/201939.png',
    )
  })
  it('an "espn:" key points at ESPN\'s headshot server', () => {
    expect(headshotUrl({ ...p, h: 'espn:5209' })).toBe(
      'https://a.espncdn.com/i/headshots/nfl/players/full/5209.png',
    )
  })
  it('an "espn:" key on an NBA player points at ESPN\'s NBA headshots', () => {
    expect(headshotUrl({ ...p, l: 'nba', h: 'espn:3202' })).toBe(
      'https://a.espncdn.com/i/headshots/nba/players/full/3202.png',
    )
  })
  it('a "clubs:" key points at the NFL clubs image server', () => {
    expect(
      headshotUrl({ ...p, h: 'clubs:private/w_480/buccaneers/abc.jpg' }),
    ).toBe(
      'https://static.clubs.nfl.com/image/private/w_480/buccaneers/abc.jpg',
    )
  })
  it('no headshot key → null', () => {
    expect(headshotUrl({ ...p, h: undefined })).toBeNull()
  })
  it('in-uniform photo: thumbnail then original, straight from the CORS-enabled host', () => {
    expect(actionUrls(p)).toEqual([])
    expect(actionCreditUrl(p)).toBeNull()
    const a = { ...p, a: 'cb/Tom_Brady_2021_(cropped).png' }
    expect(actionUrls(a)).toEqual([
      'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/Tom_Brady_2021_(cropped).png/500px-Tom_Brady_2021_(cropped).png',
      'https://upload.wikimedia.org/wikipedia/commons/c/cb/Tom_Brady_2021_(cropped).png',
    ])
    expect(actionCreditUrl(a)).toBe(
      'https://commons.wikimedia.org/wiki/File:Tom_Brady_2021_(cropped).png',
    )
  })
})

describe('board ids', () => {
  it('a standard daily keeps the bare mode; a beginner daily gets its own id', () => {
    expect(boardId('nfl')).toBe('nfl')
    expect(boardId('mixed', 'standard')).toBe('mixed')
    expect(boardId('nba', 'beginner')).toBe('nba-beginner')
    expect(gameLabel('nba')).toBe('NBA')
    expect(gameLabel('mixed', 'beginner')).toBe('Grab Bag Beginner')
  })
})
