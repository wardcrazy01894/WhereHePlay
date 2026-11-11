/**
 * Build public/players.json + public/schools.json from data/raw/* (see
 * scripts/fetch-raw.mjs) and data/schools.psv. `npm run build-players`.
 * `-- --report` also prints the unmapped college names worth adding.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { parseCsv } from './lib/csv.mjs'
import { parseSchools, buildMatchers, conferenceAt } from './lib/schools.mjs'
import {
  nflCandidates,
  nbaCandidates,
  assignTiers,
  pickDecoys,
} from './lib/players.mjs'

const root = new URL('../', import.meta.url)
const read = (p) => readFile(new URL(p, root), 'utf8')
const csv = async (p) => parseCsv(await read(p))

const schools = parseSchools(await read('data/schools.psv'))
const match = buildMatchers(schools)
const byId = new Map(schools.map((s) => [s.id, s]))

const placeholders = new Set(
  JSON.parse(await read('data/nfl-placeholder-heads.json').catch(() => '[]')),
)
const nfl = nflCandidates(
  await csv('data/raw/nfl_players.csv'),
  await csv('data/raw/nfl_draft_picks.csv'),
  await csv('data/raw/wd_nfl.csv'),
  match,
  placeholders,
)
const nba = nbaCandidates(
  await csv('data/raw/wd_nba.csv'),
  await csv('data/raw/wd_nba_teams.csv'),
  match,
  new Date().getUTCFullYear(),
)

const records = assignTiers([...nfl.records, ...nba.records])
for (const r of records)
  r.conf = conferenceAt(byId.get(r.schools[0]), r.league, r.year)
for (const league of ['nfl', 'nba']) {
  const pool = new Set(
    records.filter((r) => r.league === league).map((r) => r.schools[0]),
  )
  for (const r of records)
    if (r.league === league) r.decoys = pickDecoys(r, schools, pool)
}

records.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
const out = records.map((r) => ({
  id: r.id,
  n: r.name,
  l: r.league,
  s: r.schools,
  c: r.conf,
  y: r.year,
  t: r.tier,
  d: r.decoys,
  ...(r.head ? { h: r.head } : {}),
  ...(r.pos ? { p: r.pos } : {}),
  ...(r.action ? { a: r.action } : {}),
}))
await writeFile(
  new URL('public/players.json', root),
  '[\n' + out.map((o) => JSON.stringify(o)).join(',\n') + '\n]\n',
)
await writeFile(
  new URL('public/schools.json', root),
  '[\n' +
    schools
      .map((s) =>
        JSON.stringify({
          id: s.id,
          name: s.name,
          ...(s.aliases.length ? { aliases: s.aliases } : {}),
        }),
      )
      .join(',\n') +
    '\n]\n',
)

const count = (l, t) =>
  records.filter((r) => r.league === l && (!t || r.tier === t)).length
for (const l of ['nfl', 'nba'])
  console.log(
    `${l}: ${count(l)} players (easy ${count(l, 'easy')} / medium ${count(l, 'medium')} / hard ${count(l, 'hard')})`,
  )
console.log(`schools: ${schools.length}`)
if (process.argv.includes('--report')) {
  const show = (m) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')
  console.log('\nUnmapped NFL colleges:\n' + show(nfl.unmapped))
  console.log('\nUnmapped NBA college teams:\n' + show(nba.unmapped))
}
