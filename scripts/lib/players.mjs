/**
 * Pure builders for the player dataset: turn the raw source tables into
 * candidate records, score fame, assign difficulty tiers and pick
 * multiple-choice decoys. No I/O — scripts/build-players.mjs does that.
 * Rules are documented in docs/DATA.md; change them there in the same PR.
 */
import { conferenceAt } from './schools.mjs'

export const NBA_LEAGUE = 'http://www.wikidata.org/entity/Q155223'

/** First fall season we cover ("in college in 1994 until current day"). */
export const FIRST_COLLEGE_YEAR = 1994
/** "Mostly pros from 2008 onward": earlier careers need LEGEND_FAME. */
export const PRO_FOCUS_YEAR = 2008
export const MIN_FAME = { nfl: 12, nba: 12 }
export const LEGEND_FAME = 35

const SKILL = new Set(['QB', 'RB', 'WR', 'TE'])
const num = (s) => {
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}
const year = (iso) => (iso ? Number(String(iso).slice(0, 4)) || null : null)

/** cyrb53-style 32-bit string hash (same family as the client's). */
export function hash(str) {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return ((h2 >>> 0) ^ (h1 >>> 0)) >>> 0
}

/** Wikimedia "Special:FilePath/<name>" URL → decoded file name ('' if none). */
export function commonsFile(url) {
  const m = /Special:FilePath\/(.+)$/.exec(url ?? '')
  if (!m) return ''
  try {
    return decodeURIComponent(m[1])
  } catch {
    return ''
  }
}

/** nflverse headshot URL → the path after ".../image/" ('' if unexpected). */
export function nflHeadKey(url) {
  const m = /^https:\/\/static\.www\.nfl\.com\/image\/(.+)$/.exec(url ?? '')
  return m ? m[1] : ''
}

/**
 * NFL fame: Wikipedia language count (position-neutral popularity) plus
 * honours, plus career value — halved for non-skill positions, where a long
 * solid career does not make a household name — plus a first-round bonus.
 */
export function nflFame({
  links,
  probowls,
  allpro,
  av,
  position,
  round,
  pick,
}) {
  const avWeight = SKILL.has(position) ? 8 : 16
  // A first-round pick was a known name in college before he played a down.
  const draft = round === 1 ? (pick > 0 && pick <= 10 ? 8 : 4) : 0
  return links + 4 * probowls + 6 * allpro + av / avWeight + draft
}

function passesEra(fame, lastPro, league) {
  if (fame < MIN_FAME[league]) return false
  return lastPro >= PRO_FOCUS_YEAR || fame >= LEGEND_FAME
}

/** @returns candidate records for the NFL (deduped by name+school). */
export function nflCandidates(
  players,
  draftPicks,
  wdRows,
  match,
  placeholders = new Set(),
) {
  const draft = new Map(
    draftPicks.filter((d) => d.pfr_player_id).map((d) => [d.pfr_player_id, d]),
  )
  const wd = new Map(wdRows.map((w) => [w.pfr, w]))
  const best = new Map()
  const unmapped = new Map()
  for (const p of players) {
    const rookie = num(p.rookie_season)
    if (!rookie || rookie - 1 < FIRST_COLLEGE_YEAR) continue
    if (!p.college_name || !p.pfr_id) continue
    const d = draft.get(p.pfr_id) ?? {}
    const w = wd.get(`${p.pfr_id[0]}/${p.pfr_id}`) ?? {}
    // The league serves a generic helmet for many retired players; those
    // fall back to the Wikimedia photo, and need one to be askable at all.
    const rawHead = nflHeadKey(p.headshot)
    const head = placeholders.has(rawHead) ? '' : rawHead
    const action = commonsFile(w.img)
    if (!head && !action) continue
    const fame = nflFame({
      links: num(w.links),
      probowls: num(d.probowls),
      allpro: num(d.allpro),
      av: num(d.w_av),
      position: p.position,
      round: num(p.draft_round),
      pick: num(p.draft_pick),
    })
    const lastPro = num(p.last_season)
    if (!passesEra(fame, lastPro, 'nfl')) continue
    const names = p.college_name.split(';').map((s) => s.trim())
    const schools = []
    for (const n of names) {
      const s = match.nfl(n)
      if (s) {
        if (!schools.includes(s.id)) schools.push(s.id)
      } else unmapped.set(n, (unmapped.get(n) ?? 0) + 1)
    }
    // The FIRST listed college is the one he finished at; if that one is not
    // in the table (a JUCO-only or unmapped finish) we can't ask the question.
    if (!schools.length || !match.nfl(names[0])) continue
    const rec = {
      id: `nfl-${p.pfr_id}`,
      name: p.display_name,
      league: 'nfl',
      schools,
      year: rookie - 1,
      fame,
      pos: p.position,
      team: p.latest_team || '',
      head,
      action,
      lastPro,
    }
    const key = `${rec.name}|${schools[0]}`
    if (!best.has(key) || best.get(key).fame < fame) best.set(key, rec)
  }
  return { records: [...best.values()], unmapped }
}

/** @returns candidate records for the NBA from the Wikidata tables. */
export function nbaCandidates(baseRows, teamRows, match, nowYear) {
  const base = new Map()
  for (const b of baseRows) if (!base.has(b.bbref)) base.set(b.bbref, b)
  const teams = new Map()
  for (const t of teamRows) {
    if (!teams.has(t.bbref)) teams.set(t.bbref, [])
    teams.get(t.bbref).push(t)
  }
  const records = []
  const unmapped = new Map()
  const seen = new Set()
  for (const [bbref, b] of base) {
    const ts = teams.get(bbref) ?? []
    const nba = ts.filter((t) => t.league === NBA_LEAGUE)
    if (!nba.length || !b.nbaid || !/^\d+$/.test(b.nbaid)) continue
    const fame = num(b.links)
    const college = ts.filter(
      (t) =>
        t.league !== NBA_LEAGUE &&
        /basketball$/.test(t.teamLabel) &&
        !/national/.test(t.teamLabel),
    )
    if (!college.length) continue
    const dob = year(b.dob)
    // Last attended first: order by the stint's end (then start) year, desc.
    const stints = college
      .map((t) => ({ t, when: year(t.end) ?? year(t.start) ?? 0 }))
      .sort((a, c) => c.when - a.when)
    const schools = []
    let firstMapped = true
    stints.forEach(({ t }, i) => {
      const s = match.wd(t.teamLabel)
      if (s) {
        if (!schools.includes(s.id)) schools.push(s.id)
      } else {
        if (i === 0) firstMapped = false
        if (fame >= MIN_FAME.nba)
          unmapped.set(t.teamLabel, (unmapped.get(t.teamLabel) ?? 0) + 1)
      }
    })
    if (!schools.length || !firstMapped) continue
    const nbaStarts = nba.map((t) => year(t.start)).filter(Boolean)
    const lastCollege = stints[0].when
    // Fall year of the final college season: a stint "ending 2009" was the
    // 2008-09 season. Fallbacks: the year before the NBA debut, then age 21.
    const yr = lastCollege
      ? lastCollege - 1
      : nbaStarts.length
        ? Math.min(...nbaStarts) - 1
        : dob
          ? dob + 21
          : 0
    if (yr < FIRST_COLLEGE_YEAR) continue
    const open = nba.some((t) => t.start && !t.end)
    const ends = nba.map((t) => year(t.end) ?? year(t.start)).filter(Boolean)
    // Unknown career dates: assume a career of ~8 seasons after college.
    const lastPro = open ? nowYear : ends.length ? Math.max(...ends) : yr + 9
    if (!passesEra(fame, lastPro, 'nba')) continue
    const key = `${b.name}|${schools[0]}`
    if (seen.has(key)) continue
    seen.add(key)
    records.push({
      id: `nba-${bbref.split('/').pop()}`,
      name: b.name,
      league: 'nba',
      schools,
      year: yr,
      fame,
      pos: '',
      team: '',
      head: b.nbaid,
      action: commonsFile(b.img),
      lastPro,
    })
  }
  return { records, unmapped }
}

/**
 * Difficulty per league. "Easy" = a famous player at a school that produces
 * lots of pros; "hard" = a lesser-known player and/or a school with few. The
 * very top of the fame list is easy wherever he went (Curry → Davidson).
 */
export function assignTiers(records) {
  for (const league of ['nfl', 'nba']) {
    const rs = records
      .filter((r) => r.league === league)
      .sort((a, b) => b.fame - a.fame || (a.id < b.id ? -1 : 1))
    const perSchool = new Map()
    for (const r of rs)
      perSchool.set(r.schools[0], (perSchool.get(r.schools[0]) ?? 0) + 1)
    rs.forEach((r, i) => {
      const pct = i / Math.max(1, rs.length - 1)
      const n = perSchool.get(r.schools[0])
      const schoolPenalty = n >= 15 ? 0 : n >= 8 ? 10 : n >= 4 ? 22 : 35
      const diff = pct * 100 + schoolPenalty
      r.tier =
        pct <= 0.06 || diff < 32 ? 'easy' : diff >= 82 ? 'hard' : 'medium'
    })
  }
  return records
}

/**
 * Three wrong answers for the multiple-choice stage: schools that were in the
 * SAME conference that season (the conference hint has already been shown, so
 * anything else would be a giveaway), preferring schools that actually appear
 * in this league's pool. Deterministic per player. Tops up from other pool
 * schools when the conference is too small (independents).
 */
export function pickDecoys(rec, schools, poolSchoolIds) {
  const conf = rec.conf
  const mine = new Set(rec.schools)
  const rank = (s) => hash(`${rec.id}|${s.id}`)
  const eligible = schools.filter((s) => !mine.has(s.id))
  const sameConf = eligible
    .filter((s) => conferenceAt(s, rec.league, rec.year) === conf)
    .sort(
      (a, b) =>
        Number(poolSchoolIds.has(b.id)) - Number(poolSchoolIds.has(a.id)) ||
        rank(a) - rank(b),
    )
  const rest = eligible
    .filter((s) => poolSchoolIds.has(s.id) && !sameConf.includes(s))
    .sort((a, b) => rank(a) - rank(b))
  return [...sameConf, ...rest].slice(0, 3).map((s) => s.id)
}
