/**
 * Find league "headshots" that are really a generic placeholder. Both leagues
 * serve one for many retired players, each under the player's own URL:
 *  - NFL: a helmet (Tony Romo gets one) → data/nfl-placeholder-heads.json
 *    (image keys);
 *  - NBA: a grey silhouette → data/nba-placeholder-heads.json (NBA.com ids).
 * `npm run scan-headshots` HEADs every league photo in public/players.json
 * and records the ones whose ETag is the placeholder's. Both lists are
 * committed and cumulative. build-players then uses ESPN's headshot for those
 * players (scan-espn-heads), else their Wikimedia photo, else drops them.
 * Run order: build-players → scan-headshots → scan-espn-heads → build-players.
 */
import { readFile, writeFile } from 'node:fs/promises'

const CONCURRENCY = 8
const root = new URL('../', import.meta.url)
const readJson = async (url, fallback) => {
  try {
    return JSON.parse(await readFile(url, 'utf8'))
  } catch {
    return fallback
  }
}
const players = JSON.parse(
  await readFile(new URL('public/players.json', root), 'utf8'),
)
/** A league's own image keys: not ESPN's, not a hand-picked one (espn:, clubs:,
 *  bbr:, pfr:, web:, local: — those are not league ids, and the NBA CDN answers
 *  an unknown id with the silhouette, so they would be misread as one). */
const own = (league) =>
  players
    .filter(
      (p) =>
        p.l === league && p.h && !/^(espn|clubs|bbr|pfr|web|local):/.test(p.h),
    )
    .map((p) => p.h)

const LEAGUES = [
  {
    name: 'NFL',
    keys: own('nfl'),
    url: (k) => 'https://static.www.nfl.com/image/' + k,
    /** Verified 2026-11-11 on six retired QBs. */
    etag: 'f63433b569d11ff35f8fe048849e34a1',
    list: 'data/nfl-placeholder-heads.json',
    cache: 'data/raw/nfl_head_etags.json',
  },
  {
    name: 'NBA',
    keys: own('nba'),
    url: (k) => `https://cdn.nba.com/headshots/nba/latest/260x190/${k}.png`,
    /** Verified 2026-11-11: 227 byte-identical 4,937-byte silhouettes. */
    etag: '7475ba9619305909d7998dd9dba02481',
    list: 'data/nba-placeholder-heads.json',
    cache: 'data/raw/nba_head_etags.json',
  },
]

let anyFailed = false
for (const league of LEAGUES) {
  const cacheUrl = new URL(league.cache, root)
  const listUrl = new URL(league.list, root)
  const cache = await readJson(cacheUrl, {})
  const todo = league.keys.filter((k) => !(k in cache))
  let failed = 0
  async function worker() {
    for (let k = todo.pop(); k; k = todo.pop()) {
      try {
        const res = await fetch(league.url(k), { method: 'HEAD' })
        if (res.ok) cache[k] = (res.headers.get('etag') ?? '').replace(/"/g, '')
        else failed++
      } catch {
        failed++
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  await writeFile(cacheUrl, JSON.stringify(cache))

  const known = new Set(await readJson(listUrl, []))
  for (const [k, etag] of Object.entries(cache))
    if (etag === league.etag) known.add(k)
  await writeFile(listUrl, JSON.stringify([...known].sort(), null, 2) + '\n')
  console.log(
    `checked ${league.keys.length} ${league.name} photos; ${known.size} placeholders; ${failed} failed`,
  )
  if (failed) anyFailed = true
}
if (anyFailed) process.exitCode = 1
