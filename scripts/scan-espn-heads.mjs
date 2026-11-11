/**
 * For NFL players whose league "headshot" is the generic placeholder
 * (data/nfl-placeholder-heads.json), look for a real one on ESPN's image
 * server, keyed by the ESPN id that nflverse carries. ESPN answers 404 when
 * it has none. Writes data/nfl-espn-heads.json: { "<nfl image key>": "<espn id>" }
 * (committed). build-players then uses the ESPN headshot for those players.
 * `npm run scan-espn-heads`.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { parseCsv } from './lib/csv.mjs'
import { nflHeadKey } from './lib/players.mjs'

const root = new URL('../', import.meta.url)
const read = (p) => readFile(new URL(p, root), 'utf8')
const placeholders = new Set(
  JSON.parse(await read('data/nfl-placeholder-heads.json')),
)
const outUrl = new URL('data/nfl-espn-heads.json', root)
const found = JSON.parse(
  await read('data/nfl-espn-heads.json').catch(() => '{}'),
)

const todo = parseCsv(await read('data/raw/nfl_players.csv'))
  .map((p) => ({ key: nflHeadKey(p.headshot), espn: p.espn_id }))
  .filter(
    (p) => placeholders.has(p.key) && /^\d+$/.test(p.espn) && !(p.key in found),
  )

let failed = 0
let missing = 0
async function worker() {
  for (let p = todo.pop(); p; p = todo.pop()) {
    try {
      const res = await fetch(
        `https://a.espncdn.com/i/headshots/nfl/players/full/${p.espn}.png`,
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
await writeFile(outUrl, JSON.stringify(sorted, null, 2) + '\n')
console.log(
  `${placeholders.size} placeholder players: ${Object.keys(found).length} have an ESPN headshot, ${missing} do not, ${failed} failed`,
)
if (failed) process.exitCode = 1
