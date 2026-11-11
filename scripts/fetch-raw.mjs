/**
 * Download the raw source tables into data/raw/ (gitignored). Run rarely —
 * `npm run fetch-raw` — then `npm run build-players`. Sources (docs/DATA.md):
 *   - nflverse-data releases (players, draft_picks): CC-BY 4.0
 *   - Wikidata Query Service (CC0): NBA players by Basketball-Reference id
 *     (P2685) with team history (P54), NFL fame/photo by PFR id (P3561)
 * Labels fall back to Wikidata's language-neutral "mul" label: some of the
 * biggest names (Stephen Curry, Kevin Durant) have no separate English one.
 * Wikidata asks for a descriptive User-Agent; we send one and space requests.
 */
import { mkdir, writeFile } from 'node:fs/promises'

const OUT = new URL('../data/raw/', import.meta.url)
const UA =
  'WhereHePlayDataBuild/0.1 (https://github.com/wardcrazy01894/WhereHePlay)'

const NFLVERSE = 'https://github.com/nflverse/nflverse-data/releases/download'
const FILES = {
  'nfl_players.csv': `${NFLVERSE}/players/players.csv`,
  'nfl_draft_picks.csv': `${NFLVERSE}/draft_picks/draft_picks.csv`,
}

const SPARQL = {
  'wd_nfl.csv': `SELECT ?pfr ?img ?links WHERE {
    ?item wdt:P3561 ?pfr . ?item wikibase:sitelinks ?links .
    OPTIONAL { ?item wdt:P18 ?img } }`,
  'wd_nba.csv': `SELECT ?bbref ?name ?nbaid ?img ?links ?dob WHERE {
    ?item wdt:P2685 ?bbref . ?item wikibase:sitelinks ?links .
    OPTIONAL { ?item rdfs:label ?en FILTER(LANG(?en)="en") }
    OPTIONAL { ?item rdfs:label ?mul FILTER(LANG(?mul)="mul") }
    BIND(COALESCE(?en, ?mul) AS ?name) FILTER(BOUND(?name))
    OPTIONAL { ?item wdt:P3647 ?nbaid } OPTIONAL { ?item wdt:P18 ?img }
    OPTIONAL { ?item wdt:P569 ?dob } }`,
  'wd_nba_teams.csv': `SELECT ?bbref ?teamLabel ?league ?start ?end WHERE {
    ?item wdt:P2685 ?bbref . ?item p:P54 ?st . ?st ps:P54 ?team .
    OPTIONAL { ?team wdt:P118 ?league } OPTIONAL { ?st pq:P580 ?start }
    OPTIONAL { ?st pq:P582 ?end }
    OPTIONAL { ?team rdfs:label ?en FILTER(LANG(?en)="en") }
    OPTIONAL { ?team rdfs:label ?mul FILTER(LANG(?mul)="mul") }
    BIND(COALESCE(?en, ?mul) AS ?teamLabel) FILTER(BOUND(?teamLabel)) }`,
}

async function get(url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers } })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return res.text()
}

await mkdir(OUT, { recursive: true })
for (const [name, url] of Object.entries(FILES)) {
  const text = await get(url)
  await writeFile(new URL(name, OUT), text)
  console.log(`${name}: ${text.length} bytes`)
}
for (const [name, query] of Object.entries(SPARQL)) {
  const url =
    'https://query.wikidata.org/sparql?query=' + encodeURIComponent(query)
  const text = await get(url, { Accept: 'text/csv' })
  await writeFile(new URL(name, OUT), text)
  console.log(`${name}: ${text.split('\n').length - 1} rows`)
  await new Promise((r) => setTimeout(r, 2000))
}
