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
  applyExclusions,
  applyTierMoves,
  recentNfl,
  nbaClassOf,
  RECENT_ROOKIE_YEAR,
  INTERNATIONAL_ID,
  actionKeyFor,
  commonsPath,
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

  it('NFL: a placeholder headshot is replaced by the ESPN one when there is one', () => {
    const key = 'private/f_auto,q_auto/league/abc'
    const run = (espn) =>
      nflCandidates(
        [nflRow({})],
        [],
        [wdRow('GuyTe00', 20)],
        match,
        new Set([key]),
        espn,
      ).records
    expect(run({ [key]: '5209' })[0].head).toBe('espn:5209')
    // No ESPN image and no Wikimedia photo: he has no photo yet, but he is
    // still a player — nobody is left out of the dataset over photos.
    expect(run({})[0]).toMatchObject({ head: '', action: '' })
  })

  it("NFL: a league image that is not a headshot gives way to ESPN's, and is not used when ESPN has none", () => {
    // Hall of Famers get an action cut-out (or, once, his father's photo)
    // under the headshot URL: data/nfl-not-headshots.json lists those.
    const key = 'private/f_auto,q_auto/league/abc'
    const run = (espn) =>
      nflCandidates(
        [nflRow({})],
        [],
        [wdRow('GuyTe00', 20)],
        match,
        new Set(),
        espn,
        new Set([key]),
      ).records
    expect(run({ [key]: '964' })[0].head).toBe('espn:964')
    // A headshot is a headshot: an action cut-out does not stand in for one.
    expect(run({})[0].head).toBe('')
  })

  it('actionKeyFor: a Commons file name, or a TheSportsDB image key', () => {
    expect(actionKeyFor('Tom Brady 2021.png')).toBe(
      commonsPath('Tom Brady 2021.png'),
    )
    expect(actionKeyFor('tsdb:thumb/0lob5a1593879029.jpg')).toBe(
      'tsdb:thumb/0lob5a1593879029.jpg',
    )
    expect(actionKeyFor('tsdb:cutout/abc.png')).toBe('tsdb:cutout/abc.png')
    for (const bad of [
      'tsdb:thumb/../x.jpg',
      'tsdb:other/abc.jpg',
      'tsdb:thumb/abc.gif',
      'x.svg',
    ])
      expect(actionKeyFor(bad)).toBe('')
    expect(
      actionKeyFor(
        'web:a.espncdn.com/photo/2019/1104/r621234_1296x729_16-9.jpg',
      ),
    ).toBe('web:a.espncdn.com/photo/2019/1104/r621234_1296x729_16-9.jpg')
    expect(
      actionKeyFor(
        'web:static.www.nfl.com/image/upload/f_auto,q_auto/league/x1',
      ),
    ).toBe('web:static.www.nfl.com/image/upload/f_auto,q_auto/league/x1')
  })
  it('actionKeyFor: a web image on any https host, or our own copy', () => {
    for (const ok of [
      'web:media.gettyimages.com/id/1/photo/tiki-barber.jpg?s=612x612',
      'web:www.tradingcarddb.com/Images/Cards/Football/1/1-123Fr.jpg',
      'local:nfl-barbti00-a.jpg',
    ])
      expect(actionKeyFor(ok)).toBe(ok)
    for (const bad of [
      'web:localhost/x.jpg',
      'web:x.com/a b.jpg',
      'web:https://x.com/a.jpg',
      'local:../x.jpg',
      'local:x.gif',
    ])
      expect(actionKeyFor(bad), bad).toBe('')
  })
  it('commonsPath turns a file name into its storage path', () => {
    expect(commonsPath('Tom Brady 2021.png')).toBe('cb/Tom_Brady_2021.png')
    expect(commonsPath('Logo.svg')).toBe('')
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

    // NBA.com serves a grey silhouette for many retired players
    // (data/nba-placeholder-heads.json): ESPN's headshot stands in…
    const heads = (espn, img = '') =>
      nbaCandidates(
        base.map((b) => ({ ...b, img })),
        teams,
        match,
        2026,
        [],
        { placeholders: new Set(['201142']), espn },
      ).records
    expect(heads({ 201142: '3202' })[0].head).toBe('espn:3202')
    // …or the Wikimedia photo alone…
    const photo =
      'http://commons.wikimedia.org/wiki/Special:FilePath/Kevin%20Durant.jpg'
    expect(heads({}, photo)[0]).toMatchObject({
      head: '',
      action: expect.stringContaining('Kevin_Durant.jpg'),
    })
    // …and with neither he is still a player, just one with no photo yet.
    expect(heads({})[0]).toMatchObject({ head: '', action: '' })
  })

  it('NBA: a listed preps-to-pros player is admitted with the High School answer', () => {
    const base = [
      {
        bbref: 'j/jamesle01',
        name: 'LeBron James',
        nbaid: '2544',
        img: '',
        links: '114',
        dob: '1984-12-30T00:00:00Z',
      },
      {
        bbref: 'x/obscure01',
        name: 'Obscure Prep',
        nbaid: '9',
        img: '',
        links: '2',
        dob: '1980-01-01T00:00:00Z',
      },
      {
        bbref: 'd/doncilu01',
        name: 'Luka Doncic',
        nbaid: '7',
        img: '',
        links: '90',
        dob: '1999-02-28T00:00:00Z',
      },
    ]
    const teams = [
      {
        bbref: 'j/jamesle01',
        teamLabel: 'Cleveland Cavaliers',
        league: NBA_LEAGUE,
        start: '2003-01-01T00:00:00Z',
        end: '',
      },
      {
        bbref: 'x/obscure01',
        teamLabel: 'Utah Jazz',
        league: NBA_LEAGUE,
        start: '1998-01-01T00:00:00Z',
        end: '1999-01-01T00:00:00Z',
      },
      {
        bbref: 'd/doncilu01',
        teamLabel: 'Dallas Mavericks',
        league: NBA_LEAGUE,
        start: '2018-01-01T00:00:00Z',
        end: '',
      },
    ]
    const preps = [
      { name: 'Lebron  JAMES', hs: 'St. Vincent–St. Mary', draft: 2003 }, // matched ignoring case/spacing
      { name: 'Obscure Prep', hs: 'Somewhere High', draft: 1998 }, // kept despite the fame/era filter
      { name: 'Not In Source', hs: 'Nowhere', draft: 2000 },
    ]
    const { records, missingPreps } = nbaCandidates(
      base,
      teams,
      match,
      2026,
      preps,
    )
    expect(records.map((r) => r.name).sort()).toEqual([
      'LeBron James',
      'Obscure Prep',
    ])
    expect(records.find((r) => r.name === 'LeBron James')).toMatchObject({
      schools: ['high-school'],
      year: 2002,
      hs: 'St. Vincent–St. Mary',
    })
    // An international with no college stint and not on the list stays out.
    expect(records.some((r) => r.name === 'Luka Doncic')).toBe(false)
    expect(missingPreps).toEqual(['Not In Source'])
  })

  it('NBA: a listed international is admitted with the International answer, as easy', () => {
    const base = [
      {
        bbref: 'd/doncilu01',
        name: 'Luka Dončić',
        nbaid: '7',
        img: '',
        links: '58',
        dob: '1999-02-28T00:00:00Z',
      },
      {
        bbref: 'x/euro01',
        name: 'Unlisted Euro',
        nbaid: '8',
        img: '',
        links: '40',
        dob: '1990-01-01T00:00:00Z',
      },
    ]
    const teams = [
      {
        bbref: 'd/doncilu01',
        teamLabel: 'Real Madrid Baloncesto',
        league: 'x',
        start: '2015-01-01T00:00:00Z',
        end: '2018-01-01T00:00:00Z',
      },
      {
        bbref: 'd/doncilu01',
        teamLabel: 'Dallas Mavericks',
        league: NBA_LEAGUE,
        start: '2018-01-01T00:00:00Z',
        end: '',
      },
      {
        bbref: 'x/euro01',
        teamLabel: 'Utah Jazz',
        league: NBA_LEAGUE,
        start: '2012-01-01T00:00:00Z',
        end: '2014-01-01T00:00:00Z',
      },
    ]
    const { records, missingIntl } = nbaCandidates(
      base,
      teams,
      match,
      2026,
      [],
      undefined,
      [
        { name: 'Luka Doncic' }, // accents and case ignored
        { name: 'Not In Source' },
      ],
    )
    expect(records.map((r) => r.name)).toEqual(['Luka Dončić'])
    expect(records[0]).toMatchObject({
      schools: [INTERNATIONAL_ID],
      year: 2017, // the fall before his NBA debut
      fixedTier: 'easy',
    })
    expect(missingIntl).toEqual(['Not In Source'])
  })

  it('tiers: hand-picked internationals are easy and do not move anyone else', () => {
    const make = () =>
      Array.from({ length: 50 }, (_, i) => ({
        id: `nba-${String(i).padStart(3, '0')}`,
        league: 'nba',
        fame: 100 - i,
        schools: [i % 2 ? 'kansas' : `solo-${i}`],
      }))
    const alone = assignTiers(make()).map((r) => r.tier)
    const withIntl = assignTiers([
      ...make(),
      {
        id: 'nba-intl1',
        league: 'nba',
        fame: 99.5,
        schools: [INTERNATIONAL_ID],
        fixedTier: 'easy',
      },
      {
        id: 'nba-intl2',
        league: 'nba',
        fame: 1,
        schools: [INTERNATIONAL_ID],
        fixedTier: 'easy',
      },
    ])
    expect(withIntl.slice(0, 50).map((r) => r.tier)).toEqual(alone)
    expect(withIntl.slice(50).map((r) => r.tier)).toEqual(['easy', 'easy'])
  })

  it("an international's decoys are top programs, like a prep player's", () => {
    const rec = {
      id: 'nba-doncilu01',
      league: 'nba',
      schools: [INTERNATIONAL_ID],
      year: 2017,
      conf: 'No college',
    }
    const top = ['kansas', 'texas', 'baylor', 'gonzaga']
    const d = pickDecoys(rec, schools, new Set(), top)
    expect(d).toHaveLength(3)
    for (const id of d) expect(top).toContain(id)
  })

  it("a prep player's decoys are top programs, never random schools", () => {
    const rec = {
      id: 'nba-jamesle01',
      league: 'nba',
      schools: ['high-school'],
      year: 2002,
      conf: 'No college',
    }
    const d = pickDecoys(rec, schools, new Set(['texas', 'kansas']), [
      'kansas',
      'texas',
      'baylor',
      'gonzaga',
    ])
    expect(d).toHaveLength(3)
    for (const id of d)
      expect(['kansas', 'texas', 'baylor', 'gonzaga']).toContain(id)
    expect(
      pickDecoys(rec, schools, new Set(), [
        'kansas',
        'texas',
        'baylor',
        'gonzaga',
      ]),
    ).toEqual(d)
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

  it('exclusions remove a player after tiers are set, and reject unknown ids', () => {
    const recs = [
      { id: 'nfl-a', tier: 'easy' },
      { id: 'nfl-b', tier: 'hard' },
    ]
    const ex = { _comment: 'x', 'nfl-b': 'never played a game' }
    expect(applyExclusions(recs, ex, {}).map((r) => r.id)).toEqual(['nfl-a'])
    expect(() => applyExclusions(recs, { 'nfl-zzz': 'x' }, {})).toThrow(
      /no player/,
    )
    expect(() => applyExclusions(recs, { 'nfl-a': '' }, {})).toThrow(/reason/)
    // Never one who has been drawn: removing him would re-roll days played.
    expect(() => applyExclusions(recs, ex, { 'nfl-b': 1 })).toThrow(/drawn/)
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

describe('applyTierMoves (data/nba-top-picks.json)', () => {
  const recs = () => [
    { id: 'nba-a', tier: 'medium' },
    { id: 'nba-b', tier: 'easy' },
    { id: 'nba-c', tier: 'hard' },
  ]
  it('a listed player is easy; his old tier is dated to the day of the move; nobody else moves', () => {
    const out = applyTierMoves(
      recs(),
      { 'nba-a': { name: 'A', was: 'medium' }, 'nba-b': { name: 'B' } },
      3,
    )
    expect(out).toEqual([
      { id: 'nba-a', tier: 'easy', tierWas: [3, 'medium'] },
      { id: 'nba-b', tier: 'easy' },
      { id: 'nba-c', tier: 'hard' },
    ])
  })
  it('`was` is the record: it survives a rebuild in which he is already easy', () => {
    const again = [{ id: 'nba-a', tier: 'easy' }]
    expect(applyTierMoves(again, { 'nba-a': { was: 'hard' } }, 3)).toEqual([
      { id: 'nba-a', tier: 'easy', tierWas: [3, 'hard'] },
    ])
  })
  it('throws on an unknown player, a bad old tier or a bad day', () => {
    expect(() => applyTierMoves(recs(), { 'nba-zzz': {} }, 3)).toThrow(
      /no player/,
    )
    expect(() =>
      applyTierMoves(recs(), { 'nba-a': { was: 'easy' } }, 3),
    ).toThrow(/was/)
    expect(() => applyTierMoves(recs(), {}, -1)).toThrow(/from/)
    expect(() => applyTierMoves(recs(), {}, NaN)).toThrow(/from/)
  })
})

describe('recent players admitted on their pro careers (`extended`)', () => {
  const schools = parseSchools(
    readFileSync(new URL('../../data/schools.psv', import.meta.url), 'utf8'),
  )
  const match = buildMatchers(schools)
  const nfl = (o) => ({
    display_name: 'Solid Starter',
    pfr_id: 'StarSo00',
    position: 'G',
    college_name: 'Iowa',
    rookie_season: '2019',
    last_season: '2025',
    latest_team: 'DET',
    draft_round: '4',
    draft_pick: '120',
    headshot: 'https://static.www.nfl.com/image/private/f_auto,q_auto/league/s',
    ...o,
  })
  const pick = (id, o) => ({
    pfr_player_id: id,
    round: '4',
    games: '80',
    w_av: '0',
    probowls: '0',
    allpro: '0',
    seasons_started: '0',
    ...o,
  })

  it('recentNfl: a rookie of the last ten years who has played and has a real career', () => {
    const y = RECENT_ROOKIE_YEAR
    const d = (o) => pick('x', o)
    expect(recentNfl(y, 'G', d({ round: '2' }))).toBe(true)
    expect(recentNfl(y, 'G', d({ probowls: '1' }))).toBe(true)
    expect(recentNfl(y, 'G', d({ seasons_started: '2' }))).toBe(true)
    expect(recentNfl(y, 'G', d({ w_av: '20' }))).toBe(true)
    expect(recentNfl(y, 'WR', d({ w_av: '8' }))).toBe(true)
    // Not enough: a lineman's AV 8, one season started, a late pick.
    expect(recentNfl(y, 'G', d({ w_av: '8' }))).toBe(false)
    expect(recentNfl(y, 'G', d({ seasons_started: '1' }))).toBe(false)
    expect(recentNfl(y, 'G', d({}))).toBe(false)
    // Never played a game (only real pros), or before the window.
    expect(recentNfl(y, 'G', d({ round: '1', games: '0' }))).toBe(false)
    expect(recentNfl(y - 1, 'G', d({ round: '1' }))).toBe(false)
    // Undrafted: no draft row, so nothing to go on.
    expect(recentNfl(y, 'RB', {})).toBe(false)
  })

  it('NFL: he is in, flagged extended, with his headshot and NO automatic playing photo', () => {
    const wd = [
      {
        pfr: 'S/StarSo00',
        links: '3',
        img: 'http://commons.wikimedia.org/wiki/Special:FilePath/Solid%20Starter.jpg',
      },
    ]
    const out = (d) =>
      nflCandidates([nfl({})], [pick('StarSo00', d)], wd, match).records
    expect(out({})).toEqual([])
    const [r] = out({ seasons_started: '4', w_av: '30' })
    expect(r).toMatchObject({
      id: 'nfl-StarSo00',
      schools: ['iowa'],
      extended: true,
      action: '',
    })
    expect(r.head).toBeTruthy()
  })

  it('NFL: a core player is unchanged by the rule and is never displaced by an extended namesake', () => {
    const famous = nfl({
      pfr_id: 'StarSo01',
      draft_round: '1',
      draft_pick: '3',
    })
    const wd = [
      { pfr: 'S/StarSo01', links: '40', img: '' },
      { pfr: 'S/StarSo00', links: '3', img: '' },
    ]
    const picks = [
      pick('StarSo01', { round: '1', w_av: '60' }),
      pick('StarSo00', { w_av: '90', seasons_started: '6' }),
    ]
    for (const rows of [
      [famous, nfl({})],
      [nfl({}), famous],
    ]) {
      const { records } = nflCandidates(rows, picks, wd, match)
      expect(records).toHaveLength(1)
      expect(records[0].id).toBe('nfl-StarSo01')
      expect(records[0].extended).toBeUndefined()
    }
  })

  it('assignTiers: extended players are placed against the ranking and move nobody', () => {
    const core = () =>
      Array.from({ length: 50 }, (_, i) => ({
        id: `nfl-c${String(i).padStart(2, '0')}`,
        league: 'nfl',
        schools: [i % 2 ? 'alabama' : `small-${i}`],
        fame: 100 - i,
      }))
    const alone = assignTiers(core()).map((r) => r.tier)
    const ext = [
      {
        id: 'nfl-x1',
        league: 'nfl',
        schools: ['alabama'],
        fame: 500,
        extended: true,
      },
      {
        id: 'nfl-x2',
        league: 'nfl',
        schools: ['alabama'],
        fame: 75.5,
        extended: true,
      },
      {
        id: 'nfl-x3',
        league: 'nfl',
        schools: ['nowhere'],
        fame: 1,
        extended: true,
      },
    ]
    const all = assignTiers([...ext, ...core()])
    expect(all.filter((r) => !r.extended).map((r) => r.tier)).toEqual(alone)
    const tier = (id) => all.find((r) => r.id === id).tier
    // Between two ranked players of his school: the tier they have.
    expect(tier('nfl-x2')).toBe(all.find((r) => r.id === 'nfl-c25').tier)
    expect(tier('nfl-x3')).toBe('hard')
    // Even the most famous extended player gets no top-6% free pass.
    expect(['easy', 'medium']).toContain(tier('nfl-x1'))
  })

  it('nbaClassOf: the incoming class, from the NBA.com id', () => {
    expect(nbaClassOf('1628368')).toBe(2017)
    expect(nbaClassOf('1630596')).toBe(2021)
    expect(nbaClassOf('1641706')).toBe(2023)
    expect(nbaClassOf('1642843')).toBe(2025)
    expect(nbaClassOf('201142')).toBe(0)
  })

  it('match.edu: Wikidata university labels', () => {
    const id = (l) => match.edu(l)?.id
    expect(id('University of Kentucky')).toBe('kentucky')
    expect(id('Gonzaga University')).toBe('gonzaga')
    expect(id('University of North Carolina at Chapel Hill')).toBe(
      'north-carolina',
    )
    expect(id('Miami University')).toBe('miami-oh')
    expect(id('University of Miami')).toBe('miami-fl')
    expect(id('Washington University in St. Louis')).toBeUndefined()
    expect(id('Cypress Lakes High School')).toBeUndefined()
  })

  const base = [
    // Core: NBA team and college team both listed.
    {
      bbref: 'c/coreco01',
      name: 'Core Guy',
      nbaid: '1628001',
      img: '',
      links: '30',
      dob: '1997-01-01T00:00:00Z',
    },
    // No NBA team listed; a college stint.
    {
      bbref: 'n/noteam01',
      name: 'No Team',
      nbaid: '1630596',
      img: 'http://commons.wikimedia.org/wiki/Special:FilePath/No%20Team.jpg',
      links: '25',
      dob: '2001-01-01T00:00:00Z',
    },
    // NBA team listed, but no college team: only where he went to school.
    {
      bbref: 'e/eduonl01',
      name: 'Edu Only',
      nbaid: '1628368',
      img: '',
      links: '28',
      dob: '1997-01-01T00:00:00Z',
    },
    // Same, but under the fame floor / from before the window / no school.
    {
      bbref: 'o/obscur01',
      name: 'Obscure',
      nbaid: '1630001',
      img: '',
      links: '5',
      dob: '2000-01-01T00:00:00Z',
    },
    {
      bbref: 'o/oldgu01',
      name: 'Old Guy',
      nbaid: '2544',
      img: '',
      links: '40',
      dob: '1984-01-01T00:00:00Z',
    },
    {
      bbref: 'h/hsonly01',
      name: 'Hs Only',
      nbaid: '1630163',
      img: '',
      links: '31',
      dob: '2001-01-01T00:00:00Z',
    },
    // Under the floor, but hand-listed.
    {
      bbref: 'h/handli01',
      name: 'Bob Handlisted',
      nbaid: '1642848',
      img: '',
      links: '11',
      dob: '2006-01-01T00:00:00Z',
    },
  ]
  const nbaTeam = (bbref, start) => ({
    bbref,
    teamLabel: 'Utah Jazz',
    league: NBA_LEAGUE,
    start: `${start}-01-01T00:00:00Z`,
    end: '',
  })
  const college = (bbref, teamLabel, end) => ({
    bbref,
    teamLabel,
    league: '',
    start: '',
    end: `${end}-01-01T00:00:00Z`,
  })
  const teams = [
    nbaTeam('c/coreco01', 2017),
    college('c/coreco01', "Duke Blue Devils men's basketball", 2017),
    college('n/noteam01', "Kentucky Wildcats men's basketball", 2021),
    nbaTeam('e/eduonl01', 2017),
    nbaTeam('o/obscur01', 2020),
    nbaTeam('o/oldgu01', 2003),
    nbaTeam('h/hsonly01', 2020),
    nbaTeam('h/handli01', 2025),
  ]
  const edu = [
    { bbref: 'e/eduonl01', eduLabel: 'Cypress Lakes High School', eduEnd: '' },
    { bbref: 'e/eduonl01', eduLabel: 'University of Kentucky', eduEnd: '' },
    { bbref: 'o/obscur01', eduLabel: 'University of Kentucky', eduEnd: '' },
    { bbref: 'o/oldgu01', eduLabel: 'University of Kentucky', eduEnd: '' },
    { bbref: 'h/hsonly01', eduLabel: 'Chino Hills High School', eduEnd: '' },
  ]
  const added = [
    { id: 'nba-handli01', name: 'Bobby Handlisted', s: ['texas'], y: 2024 },
    {
      id: 'nba-nowiki01',
      name: 'Not In Wikidata',
      s: ['duke'],
      y: 2025,
      nbaid: 1643000,
    },
  ]
  const run = (recent) =>
    nbaCandidates(base, teams, match, 2026, [], undefined, [], recent).records
  const full = { edu, added, matchEdu: match.edu }

  it('NBA: without the new tables nothing changes — only the core player', () => {
    expect(run(undefined).map((r) => r.id)).toEqual(['nba-coreco01'])
  })

  it('NBA: a recent player is picked up from his college stint or the school he attended', () => {
    const rs = run(full)
    const by = Object.fromEntries(rs.map((r) => [r.id, r]))
    expect(Object.keys(by).sort()).toEqual([
      'nba-coreco01',
      'nba-eduonl01',
      'nba-handli01',
      'nba-noteam01',
      'nba-nowiki01',
    ])
    // The core player's record is exactly what it is without them.
    expect(by['nba-coreco01']).toEqual(run(undefined)[0])
    expect(by['nba-coreco01'].extended).toBeUndefined()
    // College stint ending 2021: the 2020-21 season.
    expect(by['nba-noteam01']).toMatchObject({
      schools: ['kentucky'],
      year: 2020,
      extended: true,
      head: '1630596',
      // His Wikimedia photo is NOT taken: playing photos are hand-picked.
      action: '',
    })
    // No dates anywhere: the year before his NBA class (id 1628368 → 2017).
    expect(by['nba-eduonl01']).toMatchObject({
      schools: ['kentucky'],
      year: 2016,
      extended: true,
    })
    // Hand-listed: the list's school, year and name; and one Wikidata lacks.
    expect(by['nba-handli01']).toMatchObject({
      name: 'Bobby Handlisted',
      schools: ['texas'],
      year: 2024,
      extended: true,
    })
    expect(by['nba-nowiki01']).toMatchObject({
      name: 'Not In Wikidata',
      schools: ['duke'],
      year: 2025,
      head: '1643000',
      action: '',
      extended: true,
    })
  })
})
