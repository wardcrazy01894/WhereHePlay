import { describe, it, expect } from 'vitest'
import {
  applyBlocklist,
  keepEveryone,
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
  it('a photo that does not show him playing goes — unless it is all there is of him', () => {
    const withHead = rec('h', 'Suit.jpg')
    const lastPhoto = rec('', 'Suit.jpg')
    expect(applyBlocklist([withHead, lastPhoto], lists)).toBe(1)
    expect(withHead.action).toBe('')
    // A portrait is a poor "in action" photo, but better than dropping him.
    expect(lastPhoto.action).toBe('ab/Suit.jpg')
  })
  it('tolerates a list file without the newer keys', () => {
    const r = rec('h', 'Suit.jpg')
    expect(applyBlocklist([r], { manual: [], auto: [] })).toBe(0)
  })
})

describe('keepEveryone', () => {
  it('a player with no photo at all keeps the league placeholder rather than leave the game', () => {
    const fine = { name: 'A', head: 'espn:1', action: '', placeholderHead: '9' }
    const photoOnly = {
      name: 'B',
      head: '',
      action: 'ab/B.jpg',
      placeholderHead: '8',
    }
    const nothing = { name: 'C', head: '', action: '', placeholderHead: '7' }
    expect(keepEveryone([fine, photoOnly, nothing])).toEqual(['C'])
    expect(fine.head).toBe('espn:1')
    expect(photoOnly.head).toBe('')
    expect(nothing.head).toBe('7')
  })
})
