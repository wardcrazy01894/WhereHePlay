import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { parseCsv } from './lib/csv.mjs'
const [, , S] = process.argv
const UA =
  'WhereHePlayDataBuild/0.1 (https://github.com/wardcrazy01894/WhereHePlay)'
const D = {
  ARI: 'azcardinals.com',
  ATL: 'atlantafalcons.com',
  BAL: 'baltimoreravens.com',
  BUF: 'buffalobills.com',
  CAR: 'panthers.com',
  CHI: 'chicagobears.com',
  CIN: 'bengals.com',
  CLE: 'clevelandbrowns.com',
  DAL: 'dallascowboys.com',
  DEN: 'denverbroncos.com',
  DET: 'detroitlions.com',
  GB: 'packers.com',
  HOU: 'houstontexans.com',
  IND: 'colts.com',
  JAX: 'jaguars.com',
  KC: 'chiefs.com',
  LV: 'raiders.com',
  OAK: 'raiders.com',
  LAC: 'chargers.com',
  SD: 'chargers.com',
  LA: 'therams.com',
  STL: 'therams.com',
  MIA: 'miamidolphins.com',
  MIN: 'vikings.com',
  NE: 'patriots.com',
  NO: 'neworleanssaints.com',
  NYG: 'giants.com',
  NYJ: 'newyorkjets.com',
  PHI: 'philadelphiaeagles.com',
  PIT: 'steelers.com',
  SF: '49ers.com',
  SEA: 'seahawks.com',
  TB: 'buccaneers.com',
  TEN: 'tennesseetitans.com',
  WAS: 'commanders.com',
}
const ap = new Set([
  ...Object.keys(JSON.parse(readFileSync(S + '/p2/approved.json', 'utf8'))),
  ...Object.keys(JSON.parse(readFileSync(S + '/p3/approved.json', 'utf8'))),
])
const ps = JSON.parse(readFileSync('public/players.json', 'utf8')).filter(
  (p) => p.e === undefined && p.l === 'nfl' && !ap.has(p.id),
)
const pl = new Map(
  parseCsv(readFileSync('data/raw/nfl_players.csv', 'utf8')).map((p) => [
    p.pfr_id,
    p,
  ]),
)
const dp = new Map(
  parseCsv(readFileSync('data/raw/nfl_draft_picks.csv', 'utf8'))
    .filter((d) => d.pfr_player_id)
    .map((d) => [d.pfr_player_id, d]),
)
const outP = S + '/p5/clubs.json'
const out = existsSync(outP) ? JSON.parse(readFileSync(outP, 'utf8')) : {}
const slug = (n) =>
  n
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
const jobs = ps.filter((p) => !(p.id in out))
let k = 0
async function worker() {
  for (let p = jobs[k++]; p; p = jobs[k++]) {
    const x = pl.get(p.id.slice(4)) ?? {}
    const teams = [
      ...new Set(
        [x.latest_team, dp.get(p.id.slice(4))?.team].filter((t) => t && D[t]),
      ),
    ]
    const base = slug(p.n)
    const slugs = [...new Set([base, base.replace(/-(jr|ii|iii|iv|sr)$/, '')])]
    let hit = null
    for (const t of teams)
      for (const s of slugs) {
        if (hit) break
        const url = `https://www.${D[t]}/team/players-roster/${s}/`
        const r = await fetch(url, {
          headers: { 'User-Agent': UA },
          redirect: 'follow',
        }).catch(() => null)
        if (!r || !r.ok) continue
        const html = await r.text()
        const title = /<title>([^<]*)/.exec(html)?.[1] ?? ''
        const last = p.n
          .replace(/ (Jr\.|II|III|IV|Sr\.)$/, '')
          .split(' ')
          .pop()
        if (!title.toLowerCase().includes(last.toLowerCase())) continue
        const m =
          /og:image" content="https:\/\/static\.clubs\.nfl\.com\/image\/(upload|private)\/[a-z0-9_,]+\/(v\d+\/)?([a-z0-9_-]+)\/([a-z0-9]+)/.exec(
            html,
          )
        if (m)
          hit = {
            team: t,
            page: url,
            key: `static.clubs.nfl.com/image/${m[1]}/t_editorial_landscape_12_desktop/${m[2] ?? ''}${m[3]}/${m[4]}`,
          }
      }
    out[p.id] = hit ?? { none: teams.join(',') }
    writeFileSync(outP, JSON.stringify(out))
    await new Promise((r) => setTimeout(r, 300))
  }
}
await Promise.all([worker(), worker(), worker(), worker()])
const v = Object.values(out)
console.log(
  'nfl checked',
  v.length,
  'with actionshot',
  v.filter((h) => h.key).length,
)
