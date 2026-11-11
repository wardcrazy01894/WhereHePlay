/**
 * For players whose league "headshot" is not one, look for a real headshot on
 * ESPN's image server (it answers 404 when it has none):
 *  - NFL: the generic placeholders (data/nfl-placeholder-heads.json) and the
 *    hand-kept list of league images that are action cut-outs or the wrong
 *    person (data/nfl-not-headshots.json), by the ESPN id nflverse carries
 *    → data/nfl-espn-heads.json: { "<nfl image key>": "<espn id>" }
 *  - NBA: the grey silhouettes (data/nba-placeholder-heads.json), by the ESPN
 *    id from Wikidata (data/raw/wd_nba_espn.csv, P3685)
 *    → data/nba-espn-heads.json: { "<NBA.com id>": "<espn id>" }
 * Both outputs are committed and cumulative; build-players uses them.
 * `npm run scan-espn-heads`.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { parseCsv } from './lib/csv.mjs'
import { nflHeadKey } from './lib/players.mjs'

const root = new URL('../', import.meta.url)
const read = (p) => readFile(new URL(p, root), 'utf8')
const json = async (p, fallback) => {
  try {
    return JSON.parse(await read(p))
  } catch {
    return fallback
  }
}
const withoutNotes = (o) => Object.keys(o).filter((k) => !k.startsWith('_'))

const nflWanted = new Set([
  ...(await json('data/nfl-placeholder-heads.json', [])),
  ...withoutNotes(await json('data/nfl-not-headshots.json', {})),
])
const nbaWanted = new Set(await json('data/nba-placeholder-heads.json', []))
// bbref id → ESPN id, then NBA.com id → ESPN id through the base table.
// A required input: without it the NBA scan would find nothing and look fine.
const espnCsv = await read('data/raw/wd_nba_espn.csv').catch(() => {
  throw new Error(
    'data/raw/wd_nba_espn.csv is missing — run `npm run fetch-raw` first',
  )
})
// (When Wikidata lists several ESPN ids for a player, the first is kept.)
const espnByBbref = new Map()
for (const r of parseCsv(espnCsv))
  if (/^\d+$/.test(r.espn) && !espnByBbref.has(r.bbref))
    espnByBbref.set(r.bbref, r.espn)

const LEAGUES = [
  {
    name: 'NFL',
    sport: 'nfl',
    out: 'data/nfl-espn-heads.json',
    wanted: nflWanted,
    rows: parseCsv(await read('data/raw/nfl_players.csv')).map((p) => ({
      key: nflHeadKey(p.headshot),
      espn: p.espn_id,
    })),
  },
  {
    name: 'NBA',
    sport: 'nba',
    out: 'data/nba-espn-heads.json',
    wanted: nbaWanted,
    rows: parseCsv(await read('data/raw/wd_nba.csv')).map((b) => ({
      key: b.nbaid,
      espn: espnByBbref.get(b.bbref) ?? '',
    })),
  },
]

let anyFailed = false
for (const league of LEAGUES) {
  const found = await json(league.out, {})
  const todo = league.rows.filter(
    (p) =>
      league.wanted.has(p.key) && /^\d+$/.test(p.espn) && !(p.key in found),
  )
  let failed = 0
  let missing = 0
  async function worker() {
    for (let p = todo.pop(); p; p = todo.pop()) {
      try {
        const res = await fetch(
          `https://a.espncdn.com/i/headshots/${league.sport}/players/full/${p.espn}.png`,
          { method: 'HEAD' },
        )
        if (
          res.ok &&
          (res.headers.get('content-type') ?? '').startsWith('image/')
        )
          found[p.key] = p.espn
        else if (res.status === 404) missing++
        else failed++
      } catch {
        failed++
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  const sorted = Object.fromEntries(Object.entries(found).sort())
  await writeFile(
    new URL(league.out, root),
    JSON.stringify(sorted, null, 2) + '\n',
  )
  console.log(
    `${league.name}: ${league.wanted.size} league images that are not real headshots: ${Object.keys(found).length} have an ESPN one, ${missing} do not, ${failed} failed`,
  )
  if (failed) anyFailed = true
}
if (anyFailed) process.exitCode = 1
