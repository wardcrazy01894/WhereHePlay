import { describe, it, expect } from 'vitest'
import { photoFlag, photoYear } from './photos.mjs'

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
        photo({ cats: 'Miami Hurricanes football players', date: '2015' }),
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
