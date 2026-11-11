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
  applyOverrides,
  commonsPath,
  HIGH_SCHOOL_ID,
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
  JSON.parse(await read('data/nfl-espn-heads.json').catch(() => '{}')),
)
const nba = nbaCandidates(
  await csv('data/raw/wd_nba.csv'),
  await csv('data/raw/wd_nba_teams.csv'),
  match,
  new Date().getUTCFullYear(),
  JSON.parse(await read('data/preps-to-pros.json')).players,
)

// Wikimedia photos that show the player in college (data/photo-blocklist.json,
// from `npm run audit-photos` plus hand-added bug reports) are never used. A
// player left with no photo at all cannot be asked.
const blockedPhotos = JSON.parse(await read('data/photo-blocklist.json'))
// "allow" lists photos a person has looked at and cleared: the audit flagged
// them only for biography text ("formerly with the University of Miami").
const allowed = new Set(blockedPhotos.allow ?? [])
const blocked = new Set(
  [...blockedPhotos.manual, ...blockedPhotos.auto].filter(
    (f) => !allowed.has(f),
  ),
)
// Hand-picked replacement photos (data/photo-overrides.json): player id →
// Commons file name, for players whose only listed photo is a college one.
const photoOverrides = JSON.parse(await read('data/photo-overrides.json'))
for (const r of [...nfl.records, ...nba.records]) {
  const file = photoOverrides[r.id]
  if (!file) continue
  const path = commonsPath(file)
  if (!path)
    throw new Error(`photo-overrides.json: bad file "${file}" for ${r.id}`)
  r.action = path
}
const knownIds = new Set([...nfl.records, ...nba.records].map((r) => r.id))
for (const id of Object.keys(photoOverrides))
  if (!id.startsWith('_') && !knownIds.has(id))
    throw new Error(`photo-overrides.json: no candidate player "${id}"`)
// Every candidate photo BEFORE the blocklist is applied, for the audit: it
// must see blocked photos too, or re-running it would forget them.
await writeFile(
  new URL('data/raw/photo-candidates.json', root),
  JSON.stringify(
    [...nfl.records, ...nba.records]
      .filter((r) => r.action)
      .map((r) => ({ n: r.name, y: r.year, s: r.schools, a: r.action })),
  ),
)
let photosDropped = 0
const withPhotos = [...nfl.records, ...nba.records].filter((r) => {
  if (r.action && blocked.has(r.action.slice(r.action.indexOf('/') + 1))) {
    r.action = ''
    photosDropped++
  }
  return r.head || r.action
})
const records = applyOverrides(
  assignTiers(withPhotos),
  JSON.parse(await read('data/overrides.json')),
  new Set(schools.map((s) => s.id)),
)
for (const r of records)
  r.conf = conferenceAt(byId.get(r.schools[0]), r.league, r.year)
for (const league of ['nfl', 'nba']) {
  const pool = new Set(
    records.filter((r) => r.league === league).map((r) => r.schools[0]),
  )
  // The dozen schools with the most players in this league's pool.
  const counts = new Map()
  for (const r of records)
    if (r.league === league && r.schools[0] !== HIGH_SCHOOL_ID)
      counts.set(r.schools[0], (counts.get(r.schools[0]) ?? 0) + 1)
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 12)
    .map(([id]) => id)
  for (const r of records)
    if (r.league === league) r.decoys = pickDecoys(r, schools, pool, top)
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
  ...(r.hs ? { hs: r.hs } : {}),
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
console.log(
  `photos: ${photosDropped} college-era Wikimedia photos withheld; ${nfl.records.length + nba.records.length - withPhotos.length} players dropped for having no other photo`,
)
const prepsIn = records.filter((r) => r.hs).length
console.log(`preps to pros: ${prepsIn} in the pool`)
if (nba.missingPreps.length)
  console.log(
    `  listed but not in the pool source (name mismatch?): ${nba.missingPreps.join(', ')}`,
  )
if (process.argv.includes('--report')) {
  const show = (m) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')
  console.log('\nUnmapped NFL colleges:\n' + show(nfl.unmapped))
  console.log('\nUnmapped NBA college teams:\n' + show(nba.unmapped))
}
