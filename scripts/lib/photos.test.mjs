import { describe, it, expect } from 'vitest'
import {
  applyBlocklist,
  applyHeadOverrides,
  eligibleSince,
  firstNewDay,
  newDayFor,
  photoFlag,
  photoYear,
} from './photos.mjs'

const iowaState = {
  name: 'Iowa State',
  aliases: ['Cyclones'],
  nfl: ['Iowa State'],
  wd: ['Iowa State Cyclones'],
}
const miami = {
  name: 'Miami (FL)',
  aliases: [],
  nfl: ['Miami'],
  wd: ['Miami Hurricanes'],
}
const who = (school, year = 2018) => ({ year, schools: [school] })
const photo = (o) => ({
  file: 'Some_Player.jpg',
  date: '',
  desc: '',
  cats: '',
  ...o,
})

describe('photoYear', () => {
  it('finds the year in free-text Commons dates', () => {
    expect(photoYear('2018-07-16 10:02')).toBe(2018)
    expect(photoYear('25 March 2008 (original upload date)')).toBe(2008)
    expect(photoYear('')).toBeNull()
    expect(photoYear('unknown')).toBeNull()
  })
})

describe('photoFlag', () => {
  it('flags a photo taken in or before his final college season', () => {
    expect(photoFlag(photo({ date: '2018-07-16' }), who(iowaState))).toMatch(
      /taken in 2018/,
    )
    expect(photoFlag(photo({ date: '2016' }), who(iowaState))).toMatch(
      /taken in 2016/,
    )
  })
  it('does not flag by date once he is a pro', () => {
    expect(
      photoFlag(
        photo({ date: '2019-09-08', desc: 'Chicago Bears at Denver' }),
        who(iowaState),
      ),
    ).toBe('')
    expect(photoFlag(photo({ date: '2021' }), who(iowaState))).toBe('')
  })
  it('flags a mention of his school or its team in the name, description or categories', () => {
    expect(
      photoFlag(
        photo({ cats: 'Iowa State Cyclones football players|2018 in sports' }),
        who(iowaState, 2010),
      ),
    ).toMatch(/Iowa State/)
    expect(
      photoFlag(
        photo({ file: '2018-0716-Big12MD-Iowa_State.jpg' }),
        who(iowaState, 2010),
      ),
    ).toMatch(/mentions/)
  })
  it('a city-like school name alone is not a mention (Miami Heat, Miami Dolphins), its team name is', () => {
    expect(
      photoFlag(
        photo({ desc: 'Miami Dolphins at Buffalo', date: '2015' }),
        who(miami, 2010),
      ),
    ).toBe('')
    expect(
      photoFlag(
        photo({ cats: 'Miami Hurricanes football players', date: '2011' }),
        who(miami, 2010),
      ),
    ).toMatch(/Miami Hurricanes/)
  })
  it('flags college-only wording, but not the Super Bowl or Pro Bowl', () => {
    for (const desc of [
      'at the 2008 NCAA Tournament',
      'Senior Bowl practice',
      'Rose Bowl 2014',
      'College Football Playoff media day',
      'Big 12 Media Days',
    ])
      expect(photoFlag(photo({ desc }), who(iowaState, 2000)), desc).toMatch(
        /college wording/,
      )
    for (const desc of [
      'Super Bowl LII victory parade',
      '2012 Pro Bowl at Aloha Stadium',
      'at University of Phoenix Stadium',
    ])
      expect(photoFlag(photo({ desc }), who(iowaState, 2000)), desc).toBe('')
  })
})

describe('photoFlag refinements', () => {
  const bama = {
    name: 'Alabama',
    aliases: [],
    nfl: ['Alabama'],
    wd: ['Alabama Crimson Tide'],
  }
  const kansas = {
    name: 'Kansas',
    aliases: [],
    nfl: ['Kansas'],
    wd: ['Kansas Jayhawks'],
  }
  it('uses the EARLIEST year in a messy date', () => {
    expect(
      photoYear(
        '23 April 2008 (original upload date) ( Original text: July 27, 2007 )',
      ),
    ).toBe(2007)
  })
  it('a pro-era photo filed under his college category (biography) is not flagged…', () => {
    const p = {
      file: 'Shaun_Alexander_camp.jpg',
      date: '2008-08-01',
      desc: 'Seahawks training camp',
      cats: 'Alabama Crimson Tide football players|Seattle Seahawks players',
    }
    expect(photoFlag(p, { year: 1999, schools: [bama] })).toBe('')
  })
  it('…but is when the file name or description itself names the school, or the date is unknown/early', () => {
    const base = {
      file: 'X.jpg',
      desc: 'Seahawks camp',
      cats: 'Alabama Crimson Tide football players',
    }
    expect(
      photoFlag(
        { ...base, date: '2008', desc: 'with the Alabama Crimson Tide' },
        { year: 1999, schools: [bama] },
      ),
    ).toMatch(/mentions/)
    expect(
      photoFlag({ ...base, date: '' }, { year: 1999, schools: [bama] }),
    ).toMatch(/mentions/)
    expect(
      photoFlag({ ...base, date: '2000' }, { year: 1999, schools: [bama] }),
    ).toMatch(/mentions/)
  })
  it('a city-like school written as a university counts ("University of Kansas")', () => {
    const p = {
      file: 'Jeff_Withey_2013.jpg',
      date: '2013-06-05',
      desc: 'Jeff Withey, University of Kansas basketball player',
      cats: '',
    }
    expect(photoFlag(p, { year: 2012, schools: [kansas] })).toMatch(
      /University of Kansas/,
    )
    expect(
      photoFlag(
        { ...p, desc: 'Kansas City Chiefs' },
        { year: 2012, schools: [kansas] },
      ),
    ).toBe('')
  })
})

describe('applyBlocklist', () => {
  const lists = {
    manual: ['College.jpg'],
    auto: ['AutoCollege.jpg', 'Cleared.jpg'],
    allow: ['Cleared.jpg'],
    notPlaying: ['Suit.jpg'],
    weak: ['Warmup.jpg'],
  }
  const rec = (head, file) => ({ head, action: file ? `ab/${file}` : '' })
  it('a college photo is never used, even when it is his only photo', () => {
    const only = rec('', 'College.jpg')
    const auto = rec('h', 'AutoCollege.jpg')
    expect(applyBlocklist([only, auto], lists)).toBe(2)
    expect(only.action).toBe('')
    expect(auto.action).toBe('')
  })
  it('an allowed photo survives the automatic list', () => {
    const r = rec('h', 'Cleared.jpg')
    expect(applyBlocklist([r], lists)).toBe(0)
    expect(r.action).toBe('ab/Cleared.jpg')
  })
  it('a playing photo is a playing photo: a suit or a warm-up shot is not one, even when it is all there is', () => {
    const suit = rec('h', 'Suit.jpg')
    const warmup = rec('h', 'Warmup.jpg')
    const lastPhoto = rec('', 'Suit.jpg')
    expect(applyBlocklist([suit, warmup, lastPhoto], lists)).toBe(3)
    expect([suit.action, warmup.action, lastPhoto.action]).toEqual(['', '', ''])
  })
  it('tolerates a list file without the newer keys', () => {
    const r = rec('h', 'Suit.jpg')
    expect(applyBlocklist([r], { manual: [], auto: [] })).toBe(0)
  })
})

describe('eligibleSince', () => {
  const rec = (id, head, action) => ({ id, head, action })
  it('a player is eligible from the day after both his photos exist, and that day never moves', () => {
    const prev = { 'nfl-a': 0 }
    const next = eligibleSince(
      prev,
      [
        rec('nfl-a', 'h', 'x/a.jpg'),
        rec('nfl-new', 'h', 'x/n.jpg'),
        rec('nfl-headonly', 'h', ''),
        rec('nfl-photoonly', '', 'x/p.jpg'),
      ],
      7,
    )
    expect(next).toEqual({ 'nfl-a': 0, 'nfl-new': 7 })
  })
  it('losing a photo closes his window from the next day — the days he was drawn in stay his', () => {
    // Eligible since day 0; his playing photo is blocklisted during day 19.
    const lost = eligibleSince({ 'nfl-a': 0 }, [rec('nfl-a', 'h', '')], 20)
    expect(lost).toEqual({ 'nfl-a': [0, 20] })
    // Nothing changes while he waits…
    expect(eligibleSince(lost, [rec('nfl-a', 'h', '')], 25)).toEqual(lost)
    // …and a new photo opens a second window, leaving the first untouched.
    const back = eligibleSince(lost, [rec('nfl-a', 'h', 'x/a2.jpg')], 31)
    expect(back).toEqual({ 'nfl-a': [0, 20, 31] })
    expect(eligibleSince(back, [rec('nfl-a', 'h', 'x/a2.jpg')], 40)).toEqual(
      back,
    )
  })
  it('a window opened and closed before it ever started leaves no trace', () => {
    const opened = eligibleSince({}, [rec('nfl-a', 'h', 'x/a.jpg')], 7)
    expect(eligibleSince(opened, [rec('nfl-a', 'h', '')], 7)).toEqual({})
  })
  it('an edge that has not started yet is taken back, never followed by an earlier one', () => {
    // His window opens on day 9; a build whose "new day" is 8 (an earlier
    // build the same evening, or a clock that is behind) pulls his photo.
    expect(eligibleSince({ 'nfl-a': 9 }, [rec('nfl-a', 'h', '')], 8)).toEqual(
      {},
    )
    expect(
      eligibleSince({ 'nfl-a': [0, 9] }, [rec('nfl-a', 'h', 'x/a.jpg')], 8),
    ).toEqual({ 'nfl-a': 0 })
  })
  it('a player who leaves the dataset keeps his history (he may come back)', () => {
    expect(eligibleSince({ 'nfl-gone': [0, 5] }, [], 9)).toEqual({
      'nfl-gone': [0, 5],
    })
    // Still open when he vanished: closed, like any other loss.
    expect(eligibleSince({ 'nfl-gone': 0 }, [], 9)).toEqual({
      'nfl-gone': [0, 9],
    })
  })
  it('firstNewDay: the day after the latest "today" anywhere on Earth, as days since the epoch', () => {
    // 2026-11-11 23:30 UTC is already 2026-11-12 in UTC+14.
    expect(firstNewDay(new Date('2026-11-11T23:30:00Z'), '2026-11-11')).toBe(2)
    expect(firstNewDay(new Date('2026-11-11T05:00:00Z'), '2026-11-11')).toBe(1)
    expect(firstNewDay(new Date('2026-11-20T12:00:00Z'), '2026-11-11')).toBe(11)
  })
})

describe('newDayFor (--first-day, an owner override)', () => {
  it('without the flag: the safe day', () => {
    expect(newDayFor(2, undefined)).toBe(2)
  })
  it('one day earlier than the safe day is allowed — nothing else', () => {
    // 2026-11-11, before the site was public: photos merged that US evening
    // start on the 12th although the 12th had begun in Europe and Asia.
    expect(newDayFor(2, '1')).toBe(1)
    expect(newDayFor(2, '2')).toBe(2)
    expect(() => newDayFor(2, '0')).toThrow(/re-roll/)
    expect(() => newDayFor(2, '3')).toThrow()
    expect(() => newDayFor(2, 'soon')).toThrow()
  })
})

describe('applyHeadOverrides (data/head-overrides.json)', () => {
  const recs = () => [
    { id: 'nba-a', head: '', action: '' },
    { id: 'nba-b', head: '123', action: '' },
  ]
  it('gives a player a hand-checked headshot from Basketball-Reference', () => {
    const r = recs()
    applyHeadOverrides(r, { _comment: 'x', 'nba-a': 'bbr:almonmo01' })
    expect(r[0].head).toBe('bbr:almonmo01')
    expect(r[1].head).toBe('123')
  })
  it('…or from Pro-Football-Reference (the file name carries a year)', () => {
    const r = recs()
    applyHeadOverrides(r, {
      'nba-a': 'pfr:DaviTe00_USAT_1996',
      'nba-b': 'pfr:AlbeBr20_2017',
    })
    expect(r.map((x) => x.head)).toEqual([
      'pfr:DaviTe00_USAT_1996',
      'pfr:AlbeBr20_2017',
    ])
  })
  it('refuses an unknown player or a malformed key', () => {
    expect(() => applyHeadOverrides(recs(), { 'nba-zzz': 'bbr:x01' })).toThrow(
      /no candidate player/,
    )
    for (const bad of [
      'bbr:',
      'bbr:../x',
      'http://x/y.jpg',
      'espn:12',
      'pfr:',
      'pfr:../x_1996',
      'pfr:DaviTe00',
    ])
      expect(() => applyHeadOverrides(recs(), { 'nba-a': bad })).toThrow(/bad/)
  })
})
