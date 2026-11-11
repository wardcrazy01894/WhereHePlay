import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseCsv } from './csv.mjs'
import {
  parseSchools,
  parseTimeline,
  conferenceAt,
  buildMatchers,
} from './schools.mjs'
import {
  commonsFile,
  nflHeadKey,
  nflFame,
  nflCandidates,
  nbaCandidates,
  assignTiers,
  pickDecoys,
  applyOverrides,
  NBA_LEAGUE,
} from './players.mjs'

describe('parseCsv', () => {
  it('handles quotes, embedded commas, escapes and CRLF', () => {
    const rows = parseCsv('a,b\r\n1,"x, ""y"""\r\n2,\n')
    expect(rows).toEqual([
      { a: '1', b: 'x, "y"' },
      { a: '2', b: '' },
    ])
  })
})

const PSV = `# comment
texas|Texas|Texas|Texas Longhorns|Longhorns|1994:SWC,1996:Big 12,2024:SEC|
miami-fl|Miami (FL)|Miami|Miami Hurricanes||1994:Big East,2004:ACC|
miami-oh|Miami (OH)|Miami (Ohio)|Miami RedHawks||MAC|
notre-dame|Notre Dame|Notre Dame|Notre Dame Fighting Irish||Independent|1994:Independent,1995:Big East,2013:ACC
gonzaga|Gonzaga||Gonzaga Bulldogs|Zags|WCC|
baylor|Baylor|Baylor|Baylor Bears||1994:SWC,1996:Big 12|
kansas|Kansas|Kansas|Kansas Jayhawks||1994:Big Eight,1996:Big 12|
iowa-state|Iowa State|Iowa State|Iowa State Cyclones||1994:Big Eight,1996:Big 12|
`
const schools = parseSchools(PSV)
const byId = Object.fromEntries(schools.map((s) => [s.id, s]))

describe('schools table', () => {
  it('parses timelines', () => {
    expect(parseTimeline('SEC')).toEqual([[0, 'SEC']])
    expect(parseTimeline('1994:SWC,1996:Big 12')).toEqual([
      [1994, 'SWC'],
      [1996, 'Big 12'],
    ])
    expect(() => parseTimeline('1996:A,1994:B')).toThrow(/ascending/)
    expect(() => parseTimeline('1996:A,oops')).toThrow(/Bad timeline/)
  })
  it('rejects malformed rows', () => {
    expect(() => parseSchools('a|b|c')).toThrow(/7 fields/)
    expect(() => parseSchools('x|X|||||\n')).toThrow(/No conference/)
    expect(() => parseSchools('x|X||||SEC|\nx|Y||||SEC|\n')).toThrow(
      /Duplicate/,
    )
  })
  it('conferenceAt follows realignment by fall year and by sport', () => {
    expect(conferenceAt(byId.texas, 'nfl', 1995)).toBe('SWC')
    expect(conferenceAt(byId.texas, 'nfl', 1996)).toBe('Big 12')
    expect(conferenceAt(byId.texas, 'nba', 2024)).toBe('SEC')
    expect(conferenceAt(byId['notre-dame'], 'nfl', 2020)).toBe('Independent')
    expect(conferenceAt(byId['notre-dame'], 'nba', 2020)).toBe('ACC')
    expect(conferenceAt(byId.gonzaga, 'nba', 2000)).toBe('WCC')
  })
  it('matches source names; the longest team prefix wins', () => {
    const m = buildMatchers(schools)
    expect(m.nfl('Miami (Ohio)').id).toBe('miami-oh')
    expect(m.nfl(' miami ').id).toBe('miami-fl')
    expect(m.nfl('Blinn College')).toBeUndefined()
    expect(m.wd("Miami RedHawks men's basketball").id).toBe('miami-oh')
    expect(m.wd("Miami Hurricanes men's basketball").id).toBe('miami-fl')
    expect(m.wd("Texas Longhorns men's basketball").id).toBe('texas')
    expect(m.wd("Texas State Bobcats men's basketball")).toBeUndefined()
  })
  it('the real table parses and every display name is unique', () => {
    const real = parseSchools(
      readFileSync(new URL('../../data/schools.psv', import.meta.url), 'utf8'),
    )
    expect(real.length).toBeGreaterThan(300)
    expect(new Set(real.map((s) => s.name)).size).toBe(real.length)
  })
})

describe('players', () => {
  const match = buildMatchers(schools)
  it('extracts image keys', () => {
    expect(
      commonsFile(
        'http://commons.wikimedia.org/wiki/Special:FilePath/Tom%20Brady%202021.png',
      ),
    ).toBe('cb/Tom_Brady_2021.png')
    expect(commonsFile('')).toBe('')
    // Not a plain raster image → no usable thumbnail URL.
    expect(
      commonsFile(
        'http://commons.wikimedia.org/wiki/Special:FilePath/Logo.svg',
      ),
    ).toBe('')
    expect(
      nflHeadKey(
        'https://static.www.nfl.com/image/private/f_auto,q_auto/league/abc',
      ),
    ).toBe('private/f_auto,q_auto/league/abc')
    expect(nflHeadKey('https://elsewhere.test/x.png')).toBe('')
  })
  it('fame: honours and a first-round pick add; line play counts half', () => {
    const base = {
      links: 10,
      probowls: 0,
      allpro: 0,
      av: 80,
      round: 3,
      pick: 70,
    }
    expect(nflFame({ ...base, position: 'QB' })).toBe(20)
    expect(nflFame({ ...base, position: 'G' })).toBe(15)
    expect(nflFame({ ...base, position: 'QB', round: 1, pick: 1 })).toBe(28)
    expect(nflFame({ ...base, position: 'QB', probowls: 2, allpro: 1 })).toBe(
      34,
    )
  })

  const nflRow = (o) => ({
    display_name: 'Test Guy',
    pfr_id: 'GuyTe00',
    rookie_season: '2010',
    last_season: '2018',
    college_name: 'Texas',
    position: 'QB',
    latest_team: 'DAL',
    draft_round: '1',
    draft_pick: '5',
    headshot:
      'https://static.www.nfl.com/image/private/f_auto,q_auto/league/abc',
    ...o,
  })
  const wdRow = (id, links) => ({
    pfr: `${id[0]}/${id}`,
    links: String(links),
    img: '',
  })

  it('NFL: maps colleges, keeps the finishing school first, drops the obscure', () => {
    const { records, unmapped } = nflCandidates(
      [
        nflRow({}),
        nflRow({
          display_name: 'Transfer',
          pfr_id: 'TranXx00',
          college_name: 'Baylor; Blinn College; Texas',
        }),
        nflRow({ display_name: 'Nobody', pfr_id: 'NobXx00' }),
        nflRow({
          display_name: 'Juco Finish',
          pfr_id: 'JucXx00',
          college_name: 'Blinn College; Texas',
        }),
        nflRow({
          display_name: 'Old Timer',
          pfr_id: 'OldXx00',
          rookie_season: '1994',
        }),
        nflRow({
          display_name: 'Early Retiree',
          pfr_id: 'EarXx00',
          last_season: '2005',
        }),
        nflRow({
          display_name: 'Legend',
          pfr_id: 'LegXx00',
          last_season: '2005',
        }),
      ],
      [],
      [
        wdRow('GuyTe00', 20),
        wdRow('TranXx00', 20),
        wdRow('NobXx00', 1),
        wdRow('JucXx00', 20),
        wdRow('OldXx00', 50),
        wdRow('EarXx00', 20),
        wdRow('LegXx00', 60),
      ],
      match,
    )
    expect(records.map((r) => r.name).sort()).toEqual([
      'Legend',
      'Test Guy',
      'Transfer',
    ])
    const t = records.find((r) => r.name === 'Transfer')
    expect(t.schools).toEqual(['baylor', 'texas'])
    expect(t.year).toBe(2009)
    expect(unmapped.get('Blinn College')).toBe(2)
  })

  it('NBA: reads college stints from the team history', () => {
    const base = [
      {
        bbref: 'd/duranke01',
        name: 'Kevin Durant',
        nbaid: '201142',
        img: '',
        links: '75',
        dob: '1988-09-29T00:00:00Z',
      },
      {
        bbref: 'x/prepto01',
        name: 'Prep To Pro',
        nbaid: '1',
        img: '',
        links: '90',
        dob: '1984-12-30T00:00:00Z',
      },
      {
        bbref: 'y/noid01',
        name: 'No Id',
        nbaid: '',
        img: '',
        links: '40',
        dob: '1990-01-01T00:00:00Z',
      },
    ]
    const teams = [
      {
        bbref: 'd/duranke01',
        teamLabel: "Texas Longhorns men's basketball",
        league: 'x',
        start: '2006-01-01T00:00:00Z',
        end: '2007-01-01T00:00:00Z',
      },
      {
        bbref: 'd/duranke01',
        teamLabel: 'Seattle SuperSonics',
        league: NBA_LEAGUE,
        start: '2007-01-01T00:00:00Z',
        end: '2008-01-01T00:00:00Z',
      },
      {
        bbref: 'd/duranke01',
        teamLabel: 'Houston Rockets',
        league: NBA_LEAGUE,
        start: '2025-01-01T00:00:00Z',
        end: '',
      },
      {
        bbref: 'd/duranke01',
        teamLabel: "United States men's national basketball team",
        league: '',
        start: '',
        end: '',
      },
      {
        bbref: 'x/prepto01',
        teamLabel: 'Cleveland Cavaliers',
        league: NBA_LEAGUE,
        start: '2003-01-01T00:00:00Z',
        end: '',
      },
      {
        bbref: 'y/noid01',
        teamLabel: "Kansas Jayhawks men's basketball",
        league: 'x',
        start: '',
        end: '2011-01-01T00:00:00Z',
      },
      {
        bbref: 'y/noid01',
        teamLabel: 'Utah Jazz',
        league: NBA_LEAGUE,
        start: '2011-01-01T00:00:00Z',
        end: '',
      },
    ]
    const { records } = nbaCandidates(base, teams, match, 2026)
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      id: 'nba-duranke01',
      schools: ['texas'],
      year: 2006,
      head: '201142',
      lastPro: 2026,
    })
  })

  it('tiers: the famous at a pipeline school are easy, the tail is hard', () => {
    const recs = Array.from({ length: 100 }, (_, i) => ({
      id: `nfl-${String(i).padStart(3, '0')}`,
      league: 'nfl',
      fame: 100 - i,
      schools: [i % 2 ? 'texas' : `solo-${i}`],
    }))
    assignTiers(recs)
    expect(recs[0].tier).toBe('easy') // top of the list, any school
    expect(recs[11].tier).toBe('easy') // famous + 50-player school
    expect(recs[98].tier).toBe('hard') // unknown + one-player school
    expect(recs[40].tier).toBe('medium')
  })

  it('overrides replace schools and tiers, and reject typos', () => {
    const recs = [{ id: 'nba-x', schools: ['kansas'], tier: 'hard' }]
    const ids = new Set(['kansas', 'texas'])
    applyOverrides(
      recs,
      { _comment: 'x', 'nba-x': { s: ['texas', 'kansas'], t: 'easy' } },
      ids,
    )
    expect(recs[0]).toMatchObject({
      schools: ['texas', 'kansas'],
      tier: 'easy',
    })
    expect(() =>
      applyOverrides(recs, { 'nba-nope': { t: 'easy' } }, ids),
    ).toThrow(/no player/)
    expect(() =>
      applyOverrides(recs, { 'nba-x': { s: ['nowhere'] } }, ids),
    ).toThrow(/unknown school/)
    expect(() =>
      applyOverrides(recs, { 'nba-x': { t: 'brutal' } }, ids),
    ).toThrow(/bad tier/)
  })

  it('overrides can set the final college year, and reject a bad one', () => {
    const recs = [
      { id: 'nba-x', schools: ['kansas'], year: 2010, tier: 'hard' },
    ]
    const ids = new Set(['kansas', 'texas'])
    applyOverrides(recs, { 'nba-x': { s: ['texas', 'kansas'], y: 2015 } }, ids)
    expect(recs[0]).toMatchObject({ schools: ['texas', 'kansas'], year: 2015 })
    expect(() => applyOverrides(recs, { 'nba-x': { y: 1980 } }, ids)).toThrow(
      /bad year/,
    )
    expect(() => applyOverrides(recs, { 'nba-x': { y: '2015' } }, ids)).toThrow(
      /bad year/,
    )
  })

  it('decoys come from the same conference that season and never include his schools', () => {
    const rec = {
      id: 'nfl-x',
      league: 'nfl',
      schools: ['texas'],
      year: 1998,
      conf: 'Big 12',
    }
    const pool = new Set(['baylor', 'kansas', 'iowa-state', 'miami-fl'])
    const d = pickDecoys(rec, schools, pool)
    expect([...d].sort()).toEqual(['baylor', 'iowa-state', 'kansas'])
    // Too few conference mates (independent): topped up from the pool.
    const nd = {
      id: 'nfl-y',
      league: 'nfl',
      schools: ['notre-dame'],
      year: 2000,
      conf: 'Independent',
    }
    const d2 = pickDecoys(nd, schools, pool)
    expect(d2).toHaveLength(3)
    expect(d2).not.toContain('notre-dame')
    expect(pickDecoys(rec, schools, pool)).toEqual(d)
  })
})
