/**
 * Fetch the infobox of each recent NBA player's English Wikipedia article
 * into data/raw/nba-infobox.json: where he played in college, with years
 * (the infobox is far better kept than Wikidata's team history for players
 * since ~2015), his draft and his first pro season. `npm run fetch-nba-infobox`
 * after `npm run fetch-raw -- --only=wd_nba_enwiki.csv`. Used only for
 * `extended` players (docs/DATA.md §Recent players).
 * The MediaWiki API takes 50 titles a request; we send a descriptive
 * User-Agent and space the requests.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { parseCsv } from './lib/csv.mjs'
import { nbaClassOf, parseInfobox } from './lib/players.mjs'

const root = new URL('../', import.meta.url)
const csv = async (p) => parseCsv(await readFile(new URL(p, root), 'utf8'))
const UA =
  'WhereHePlayDataBuild/0.1 (https://github.com/wardcrazy01894/WhereHePlay)'

const recent = new Set(
  (await csv('data/raw/wd_nba.csv'))
    .filter((b) => /^\d+$/.test(b.nbaid) && nbaClassOf(b.nbaid))
    .map((b) => b.bbref),
)
const titles = new Map()
for (const r of await csv('data/raw/wd_nba_enwiki.csv'))
  if (recent.has(r.bbref) && !titles.has(r.title)) titles.set(r.title, r.bbref)

const out = {}
const all = [...titles.keys()]
for (let i = 0; i < all.length; i += 50) {
  const batch = all.slice(i, i + 50)
  const url =
    'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1&prop=revisions&rvprop=content&rvslots=main&rvsection=0&titles=' +
    encodeURIComponent(batch.join('|'))
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`${res.status} for batch ${i}`)
  const { query } = await res.json()
  // Titles may come back normalized or redirected: map them home.
  const home = new Map(batch.map((t) => [t, t]))
  for (const n of [...(query.normalized ?? []), ...(query.redirects ?? [])])
    if (home.has(n.from)) home.set(n.to, home.get(n.from))
  for (const page of query.pages ?? []) {
    const text = page.revisions?.[0]?.slots?.main?.content
    const bbref = titles.get(home.get(page.title) ?? page.title)
    if (text && bbref) out[bbref] = parseInfobox(text)
  }
  console.log(`${Math.min(i + 50, all.length)} / ${all.length}`)
  await new Promise((r) => setTimeout(r, 1000))
}
await writeFile(
  new URL('data/raw/nba-infobox.json', root),
  JSON.stringify(out, null, 1),
)
console.log(
  `infoboxes: ${Object.keys(out).length}; with a college: ${Object.values(out).filter((o) => o.colleges.length).length}`,
)
