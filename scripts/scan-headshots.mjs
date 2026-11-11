/**
 * Find NFL "headshots" that are really the league's generic helmet
 * placeholder (retired players such as Tony Romo get one, each under its own
 * URL). `npm run scan-headshots` HEADs every NFL photo in public/players.json
 * and records the keys whose ETag is the placeholder's in
 * data/nfl-placeholder-heads.json (committed, cumulative). build-players then
 * shows those players' Wikimedia photo instead, or drops them if they have
 * none. Run order: build-players → scan-headshots → build-players.
 */
import { readFile, writeFile } from 'node:fs/promises'

/** ETag of the placeholder image (verified 2026-11-11 on six retired QBs). */
const PLACEHOLDER_ETAG = 'f63433b569d11ff35f8fe048849e34a1'
const CONCURRENCY = 8
const root = new URL('../', import.meta.url)
const listUrl = new URL('data/nfl-placeholder-heads.json', root)
const cacheUrl = new URL('data/raw/nfl_head_etags.json', root)
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
const keys = players.filter((p) => p.l === 'nfl' && p.h).map((p) => p.h)
const cache = await readJson(cacheUrl, {})
const todo = keys.filter((k) => !(k in cache))
let failed = 0
async function worker() {
  for (let k = todo.pop(); k; k = todo.pop()) {
    try {
      const res = await fetch('https://static.www.nfl.com/image/' + k, {
        method: 'HEAD',
      })
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
  if (etag === PLACEHOLDER_ETAG) known.add(k)
await writeFile(listUrl, JSON.stringify([...known].sort(), null, 2) + '\n')
console.log(
  `checked ${keys.length} NFL photos; ${known.size} placeholders; ${failed} failed`,
)
if (failed) process.exitCode = 1
