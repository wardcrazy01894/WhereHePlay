/**
 * Pure builders for the player dataset: turn the raw source tables into
 * candidate records, score fame, assign difficulty tiers and pick
 * multiple-choice decoys. No I/O — scripts/build-players.mjs does that.
 * Rules are documented in docs/DATA.md; change them there in the same PR.
 */
import { createHash } from 'node:crypto'
import { conferenceAt } from './schools.mjs'

export const NBA_LEAGUE = 'http://www.wikidata.org/entity/Q155223'

/** First fall season we cover ("in college in 1994 until current day"). */
export const FIRST_COLLEGE_YEAR = 1994
/** "Mostly pros from 2008 onward": earlier careers need LEGEND_FAME. */
export const PRO_FOCUS_YEAR = 2008
export const MIN_FAME = { nfl: 12, nba: 12 }
export const LEGEND_FAME = 35

/**
 * "The last ten years": rookies from this NFL season on (and NBA players who
 * came into the league from about then) are also admitted on what they did as
 * pros, not only on fame — the owner's bar (2026-11-13): anyone you would ask
 * "where did he go to school?" about while watching a game. See recentNfl.
 */
export const RECENT_ROOKIE_YEAR = 2016

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

/** File types Wikimedia serves as-is in a thumbnail URL. */
const RASTER = /\.(jpe?g|png|webp|gif)$/i

/**
 * Wikimedia "Special:FilePath/<name>" URL → "<xy>/<File_name.jpg>", the
 * file's storage path on upload.wikimedia.org (xy = first two hex chars of
 * the MD5 of the underscored name). The client needs the direct path because
 * only upload.wikimedia.org sends CORS headers, and it must fetch the photo
 * as a blob to keep the name-bearing URL out of the page (docs/DATA.md
 * §Photos). '' when there is no image or it is not a plain raster file.
 */
export function commonsFile(url) {
  const m = /Special:FilePath\/(.+)$/.exec(url ?? '')
  if (!m) return ''
  try {
    return commonsPath(decodeURIComponent(m[1]))
  } catch {
    return ''
  }
}

/** Commons file name (spaces or underscores) → "<xy>/<File_name>" ('' if it
 *  is not a plain raster image). */
export function commonsPath(fileName) {
  const name = String(fileName).trim().replace(/ /g, '_')
  if (!RASTER.test(name)) return ''
  const md5 = createHash('md5').update(name).digest('hex')
  return `${md5.slice(0, 2)}/${name}`
}

/**
 * A hand-picked playing photo (data/photo-overrides.json) → the `a` key: the
 * Commons storage path for a file name, or a TheSportsDB image key
 * ("tsdb:<thumb|cutout|render|fanart>/<file>") as it is. '' if neither.
 */
export function actionKeyFor(value) {
  const v = String(value).trim()
  if (v.startsWith('tsdb:'))
    return /^tsdb:(thumb|cutout|render|fanart)\/[a-z0-9]+\.(jpg|png)$/.test(v)
      ? v
      : ''
  if (v.startsWith('web:')) return WEB_KEY.test(v) ? v : ''
  if (v.startsWith('local:')) return LOCAL_KEY.test(v) ? v : ''
  return commonsPath(v)
}

/**
 * "web:<host>/<path>": an image hotlinked from any https host. "local:<file>":
 * our own copy in public/photos/, for one that could not be hotlinked. Same
 * patterns as WEB and LOCAL in src/lib/images.ts.
 */
export const WEB_KEY = /^web:([a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s"'<>\\`]*)?)$/
export const LOCAL_KEY = /^local:([a-z0-9][a-z0-9._-]*\.(?:jpe?g|png|webp))$/

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

/**
 * A recent NFL player who played "to some real level" (draft table row `d`,
 * so drafted players only): he has played a game, and was a first- or
 * second-round pick, or made a Pro Bowl, or started for two seasons, or has
 * real career value (AV 8+ at a skill position, 20+ anywhere).
 */
export function recentNfl(rookie, position, d) {
  if (rookie < RECENT_ROOKIE_YEAR || num(d.games) <= 0) return false
  const round = num(d.round)
  const av = num(d.w_av)
  return (
    (round >= 1 && round <= 2) ||
    num(d.probowls) > 0 ||
    num(d.seasons_started) >= 2 ||
    av >= (SKILL.has(position) ? 8 : 20)
  )
}

/**
 * The tier of a recent NFL player admitted by recentNfl, from what he did as
 * a pro (his fame score is low by construction, so the ranking would call
 * every one of them hard): easy for a star, medium for a name a fan knows.
 * assignTiers then makes it one step harder at a school with few pros.
 */
export function recentNflTier(position, d) {
  const av = num(d.w_av)
  const round = num(d.round)
  const skill = SKILL.has(position)
  if (
    num(d.probowls) >= 2 ||
    num(d.allpro) >= 1 ||
    (skill && av >= 45) ||
    (position === 'QB' && round === 1 && av >= 20)
  )
    return 'easy'
  if (
    num(d.probowls) >= 1 ||
    round === 1 ||
    (skill && (av >= 15 || round === 2)) ||
    av >= 35
  )
    return 'medium'
  return 'hard'
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
  espnHeads = {},
  notHeadshots = new Set(),
  added = {},
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
    // …unless ESPN has a real headshot for him (data/nfl-espn-heads.json).
    // A league image that is a photo of him but not a headshot (an action
    // cut-out — data/nfl-not-headshots.json) gives way to ESPN's too. With no
    // ESPN headshot either he has no headshot yet: a headshot is a headshot.
    // He is still a player — membership never depends on photos; only
    // players with both photos are DRAWN (eligibleSince in ./photos.mjs).
    const espn = espnHeads[rawHead] ? `espn:${espnHeads[rawHead]}` : ''
    const head =
      placeholders.has(rawHead) || notHeadshots.has(rawHead) ? espn : rawHead
    const action = commonsFile(w.img)
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
    // Admitted on fame (the launch rule: `core`), or as a recent player who
    // really played (`extended`: see assignTiers and the photo rule below).
    const extended = !passesEra(fame, lastPro, 'nfl')
    // …or by hand (data/nfl-added.json): undrafted, so no draft row to go on.
    const hand = added[`nfl-${p.pfr_id}`]
    if (extended && !hand && !recentNfl(rookie, p.position, d)) continue
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
      // An extended player's playing photo is only ever hand-picked
      // (data/photo-overrides.json): the automatic Wikimedia one has not
      // been through the by-eye review the launch pool got, so he waits —
      // in the dataset, not drawn — until someone has looked.
      action: extended ? '' : action,
      lastPro,
      ...(extended
        ? {
            extended: true,
            tierHint: hand?.t ?? recentNflTier(p.position, d),
          }
        : {}),
    }
    const key = `${rec.name}|${schools[0]}`
    const prev = best.get(key)
    // A core player is never displaced by an extended namesake.
    if (
      !prev ||
      (prev.extended && !rec.extended) ||
      (!!prev.extended === !!rec.extended && prev.fame < fame)
    )
      best.set(key, rec)
  }
  return { records: [...best.values()], unmapped }
}

/** @returns candidate records for the NBA from the Wikidata tables. */
/** The pseudo-school that is the answer for a preps-to-pros player. */
export const HIGH_SCHOOL_ID = 'high-school'

/** The pseudo-school that is the answer for an international who skipped college. */
export const INTERNATIONAL_ID = 'international'

/** Name key for matching the preps-to-pros list: letters only, lowercased. */
export const nameKey = (name) =>
  String(name)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z]/g, '')

/**
 * @param preps  data/preps-to-pros.json `players` — NBA players who skipped
 *   college. They have no college stint, so they are admitted by this list:
 *   their answer is HIGH_SCHOOL_ID and the real high school rides along for
 *   the reveal. Returns `missingPreps`: listed names not found in the source.
 * @param heads  `placeholders`: NBA.com ids whose headshot is the generic
 *   grey silhouette (data/nba-placeholder-heads.json); `espn`: NBA.com id →
 *   ESPN id for those ESPN has a real headshot of (data/nba-espn-heads.json).
 *   A player left with no headshot and no Wikimedia photo is still returned:
 *   membership never depends on photos (see eligibleSince in ./photos.mjs).
 * @param intl  data/international.json `players` — hand-picked easy NBA
 *   players who turned pro outside the US instead of playing college ball.
 *   Their answer is INTERNATIONAL_ID and their tier is fixed at easy
 *   (`fixedTier`, see assignTiers). Returns `missingIntl` like missingPreps.
 */
export function nbaCandidates(
  baseRows,
  teamRows,
  match,
  nowYear,
  preps = [],
  heads = { placeholders: new Set(), espn: {} },
  intl = [],
  recent = null,
) {
  // `recent` off (tests of the launch rule): nobody but core players.
  const useRecent = !!recent
  recent ??= { edu: [], added: [], matchEdu: () => undefined }
  const eduBy = new Map()
  for (const e of recent.edu) {
    if (!eduBy.has(e.bbref)) eduBy.set(e.bbref, [])
    eduBy.get(e.bbref).push(e)
  }
  const addedById = new Map(recent.added.map((a) => [a.id, a]))
  const foundAdded = new Set()
  const prepByName = new Map(preps.map((p) => [nameKey(p.name), p]))
  const foundPreps = new Set()
  const intlNames = new Set(intl.map((p) => nameKey(p.name)))
  const foundIntl = new Set()
  const base = new Map()
  for (const b of baseRows) if (!base.has(b.bbref)) base.set(b.bbref, b)
  const teams = new Map()
  for (const t of teamRows) {
    if (!teams.has(t.bbref)) teams.set(t.bbref, [])
    teams.get(t.bbref).push(t)
  }
  const records = []
  const later = []
  const unmapped = new Map()
  const seen = new Set()
  for (const [bbref, b] of base) {
    const ts = teams.get(bbref) ?? []
    const nba = ts.filter((t) => t.league === NBA_LEAGUE)
    if (!b.nbaid || !/^\d+$/.test(b.nbaid)) continue
    const fame = num(b.links)
    // Wikidata has no NBA team and/or no college team for most players who
    // came into the league since ~2019. They are picked up afterwards, from
    // where they went to school (recentNba) — as `extended` players.
    const hand = addedById.get(`nba-${bbref.split('/').pop()}`)
    if (hand || !nba.length) {
      later.push({ bbref, b, ts, fame, hand })
      continue
    }
    const college = ts.filter(
      (t) =>
        t.league !== NBA_LEAGUE &&
        /basketball$/.test(t.teamLabel) &&
        !/national/.test(t.teamLabel),
    )
    const prep = prepByName.get(nameKey(b.name))
    const abroad = !prep && intlNames.has(nameKey(b.name))
    if (!college.length && !prep && !abroad) {
      later.push({ bbref, b, ts, fame, hand })
      continue
    }
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
    if (!prep && !abroad && (!schools.length || !firstMapped)) continue
    if (abroad) {
      // Turned pro abroad instead: that is the one accepted answer.
      schools.length = 0
      schools.push(INTERNATIONAL_ID)
      foundIntl.add(nameKey(b.name))
    }
    if (prep) {
      // Straight from high school: that is the one accepted answer, whatever
      // stray college rows the source may carry.
      schools.length = 0
      schools.push(HIGH_SCHOOL_ID)
      foundPreps.add(nameKey(prep.name))
    }
    const nbaStarts = nba.map((t) => year(t.start)).filter(Boolean)
    const lastCollege = prep ? prep.draft : abroad ? 0 : (stints[0]?.when ?? 0)
    // Fall year of the final college season: a stint "ending 2009" was the
    // 2008-09 season (for a prep: his senior year, the fall before the draft). Fallbacks: the year before the NBA debut, then age 21.
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
    // The preps list is hand-picked, so it is not second-guessed by the
    // fame / era filter.
    if (!prep && !abroad && !passesEra(fame, lastPro, 'nba')) continue
    const head = !heads.placeholders.has(b.nbaid)
      ? b.nbaid
      : heads.espn[b.nbaid]
        ? `espn:${heads.espn[b.nbaid]}`
        : ''
    const action = commonsFile(b.img)
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
      head,
      action,
      lastPro,
      ...(prep ? { hs: prep.hs } : {}),
      ...(abroad ? { fixedTier: 'easy' } : {}),
    })
  }
  // Recent players the pass above could not place (extended). Added after
  // it, so one of them can never take a name+school key from a core player.
  for (const { bbref, b, ts, fame, hand } of useRecent ? later : []) {
    const rec = recentNba(b, ts, fame, hand, eduBy.get(bbref) ?? [], {
      info: recent.info?.[bbref],
      match,
      matchEdu: recent.matchEdu,
      nowYear,
    })
    if (!rec) continue
    if (hand) foundAdded.add(hand.id)
    const key = `${rec.name}|${rec.schools[0]}`
    if (seen.has(key)) continue
    seen.add(key)
    records.push({ id: `nba-${bbref.split('/').pop()}`, ...rec })
  }
  // Hand-listed players Wikidata does not have at all.
  const haveIds = new Set(records.map((r) => r.id))
  for (const a of recent.added) {
    if (foundAdded.has(a.id) || haveIds.has(a.id)) continue
    records.push({
      id: a.id,
      name: a.name,
      league: 'nba',
      schools: [...a.s],
      year: a.y,
      fame: 0,
      pos: '',
      team: '',
      head: a.nbaid ? String(a.nbaid) : '',
      action: '',
      lastPro: nowYear,
      extended: true,
    })
  }
  const missingPreps = preps
    .filter((p) => !foundPreps.has(nameKey(p.name)))
    .map((p) => p.name)
  const missingIntl = intl
    .filter((p) => !foundIntl.has(nameKey(p.name)))
    .map((p) => p.name)
  return { records, unmapped, missingPreps, missingIntl }
}

/**
 * The season a player came into the NBA, from his NBA.com id: the league
 * hands them out in order, a block per incoming class. Only a fallback for
 * the final college season (draft year − 1) of a recent player Wikidata
 * gives no dates for; 0 for an id from before 2015. A player who signed late
 * (undrafted, two-way) reads a year or two late — the hand list
 * (data/nba-added.json) and data/overrides.json correct those.
 */
export function nbaClassOf(nbaid) {
  const n = Number(nbaid)
  const from = [
    [1642800, 2025],
    [1642200, 2024],
    [1641600, 2023],
    [1631000, 2022],
    [1630500, 2021],
    [1630100, 2020],
    [1629600, 2019],
    [1628960, 2018],
    [1628000, 2017],
    [1627700, 2016],
    [1626100, 2015],
  ]
  return from.find(([id]) => n >= id)?.[1] ?? 0
}

/**
 * An `extended` NBA record for a recent player the main pass could not place,
 * or null. He needs a college — a hand entry (`hand`: school ids and year),
 * a college team stint, or a school he attended (P69) that is in the schools
 * table — and to be recent: an NBA.com id from the 2015 class on.
 * The fame floor is the usual one unless he is hand-listed.
 */
function recentNba(b, ts, fame, hand, edu, { info, match, matchEdu, nowYear }) {
  const cls = nbaClassOf(b.nbaid)
  if (!hand && (!cls || fame < MIN_FAME.nba)) return null
  let schools = []
  let yr
  if (hand) {
    schools = [...hand.s]
    yr = hand.y
  } else if (info?.colleges.some((c) => match.wd(c.team) ?? matchEdu(c.team))) {
    // His Wikipedia infobox: every college with its years — the best source
    // there is for a recent player. Last attended first; one written without
    // years keeps its place in the list (the last written is the latest).
    const list = info.colleges
      .map((c, i, all) => ({
        s: match.wd(c.team) ?? matchEdu(c.team),
        when: c.end || (i === all.length - 1 ? 9999 : 0),
        end: c.end,
      }))
      .sort((a, c) => c.when - a.when)
    // The school he finished at must be one of ours (as for everyone).
    if (!list[0].s) return null
    for (const c of list)
      if (c.s && !schools.includes(c.s.id)) schools.push(c.s.id)
    yr = (list[0].end || info.draft || info.start || cls) - 1
  } else {
    const stints = ts
      .filter(
        (t) =>
          t.league !== NBA_LEAGUE &&
          /basketball$/.test(t.teamLabel) &&
          !/national/.test(t.teamLabel),
      )
      .map((t) => ({ t, when: year(t.end) ?? year(t.start) ?? 0 }))
      .sort((a, c) => c.when - a.when)
    for (const { t } of stints) {
      const s = match.wd(t.teamLabel)
      if (s && !schools.includes(s.id)) schools.push(s.id)
    }
    // No team stint: the schools he attended, last one first when dated.
    const went = edu
      .map((e) => ({ s: matchEdu(e.eduLabel), when: year(e.eduEnd) ?? 0 }))
      .filter((e) => e.s)
      .sort((a, c) => c.when - a.when)
    if (!schools.length)
      for (const e of went) if (!schools.includes(e.s.id)) schools.push(e.s.id)
    if (!schools.length) return null
    const end = stints[0]?.when || went[0]?.when || 0
    yr = (end || cls) - 1
  }
  if (yr < FIRST_COLLEGE_YEAR) return null
  return {
    name: hand?.name ?? b.name,
    league: 'nba',
    schools,
    year: yr,
    fame,
    pos: '',
    team: '',
    head: b.nbaid,
    // Hand-picked only, like every extended player's (see nflCandidates).
    action: '',
    lastPro: nowYear,
    extended: true,
  }
}

/**
 * Difficulty per league. "Easy" = a famous player at a school that produces
 * lots of pros; "hard" = a lesser-known player and/or a school with few. The
 * very top of the fame list is easy wherever he went (Curry → Davidson).
 */
export function assignTiers(records) {
  // A hand-picked tier (internationals) is kept, and those players are left
  // out of the ranking, so adding one never moves anyone else's tier.
  for (const r of records) if (r.fixedTier) r.tier = r.fixedTier
  // `extended` players (admitted after launch on what they did as pros) are
  // left out of the ranking too, and placed against it afterwards — so
  // admitting more of them never moves the tier of anyone already in.
  for (const league of ['nfl', 'nba']) {
    const ranked = (r) => r.league === league && !r.fixedTier
    const rs = records
      .filter((r) => ranked(r) && !r.extended)
      .sort((a, b) => b.fame - a.fame || (a.id < b.id ? -1 : 1))
    const perSchool = new Map()
    for (const r of rs)
      perSchool.set(r.schools[0], (perSchool.get(r.schools[0]) ?? 0) + 1)
    const tierAt = (pct, school) => {
      const n = perSchool.get(school) ?? 0
      const schoolPenalty = n >= 15 ? 0 : n >= 8 ? 10 : n >= 4 ? 22 : 35
      const diff = pct * 100 + schoolPenalty
      return pct <= 0.06 || diff < 32 ? 'easy' : diff >= 82 ? 'hard' : 'medium'
    }
    rs.forEach((r, i) => {
      r.tier = tierAt(i / Math.max(1, rs.length - 1), r.schools[0])
    })
    // Where he would stand in that ranking: the share of it more famous
    // than he is. Never the top-6% free pass — that is for the ranked.
    const harder = { easy: 'medium', medium: 'hard', hard: 'hard' }
    for (const r of records.filter((x) => ranked(x) && x.extended)) {
      if (r.tierHint) {
        // A tier from his pro career (recentNflTier, or a hand list): one
        // step harder at a school with fewer than four pros in the ranking.
        const few = (perSchool.get(r.schools[0]) ?? 0) < 4
        r.tier = few ? harder[r.tierHint] : r.tierHint
        continue
      }
      const above = rs.filter((x) => x.fame > r.fame).length
      const pct = Math.max(0.0601, above / Math.max(1, rs.length - 1))
      r.tier = tierAt(Math.min(1, pct), r.schools[0])
    }
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
export function pickDecoys(rec, schools, poolSchoolIds, topPrograms = []) {
  // A player who skipped college has no conference mates. His wrong answers
  // are the programs that produce the most pros — where you'd guess a star
  // went — not three random schools.
  if (
    rec.schools[0] === HIGH_SCHOOL_ID ||
    rec.schools[0] === INTERNATIONAL_ID
  ) {
    const rankTop = (id) => hash(`${rec.id}|${id}`)
    return [...topPrograms]
      .filter((id) => !rec.schools.includes(id))
      .sort((a, b) => rankTop(a) - rankTop(b))
      .slice(0, 3)
  }
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

/**
 * Apply data/overrides.json — hand corrections keyed by player id:
 *   { "nba-pricero01": { "s": ["utah-valley", "nicholls"], "y": 2004, "t": "hard" } }
 * `s` replaces the accepted schools (finishing school first), `y` the fall
 * year of his final college season (the conference hint is looked up for
 * that year, so a changed finishing school usually needs it), `t` the tier.
 * Throws on an unknown player, school or tier so a typo can't pass silently.
 */
/**
 * Remove players listed in data/excluded.json — player id → why (e.g. he never
 * played a regular-season or playoff game, owner's rule 2026-11-12). Applied
 * after tiers and decoys are set, so a removal never moves anyone else's tier.
 * Throws on an unknown id, a missing reason, or a player who has already been
 * drawn on some day (`history`: the eligible-since entries): removing him
 * would change the pool for days already played.
 */
export function applyExclusions(records, excluded, history = {}) {
  const ids = new Set(records.map((r) => r.id))
  const drop = new Set()
  for (const [id, why] of Object.entries(excluded)) {
    if (id.startsWith('_')) continue
    if (!ids.has(id)) throw new Error(`excluded.json: no player "${id}"`)
    if (!String(why ?? '').trim())
      throw new Error(`excluded.json: give a reason for ${id}`)
    if (id in history)
      throw new Error(
        `excluded.json: ${id} has been drawn (data/eligible-since.json); removing him would re-roll days already played`,
      )
    drop.add(id)
  }
  return records.filter((r) => !drop.has(r.id))
}

export function applyOverrides(records, overrides, schoolIds) {
  const byId = new Map(records.map((r) => [r.id, r]))
  for (const [id, o] of Object.entries(overrides)) {
    if (id.startsWith('_')) continue
    const r = byId.get(id)
    if (!r) throw new Error(`overrides.json: no player "${id}" in the pool`)
    if (o.s) {
      for (const sid of o.s)
        if (!schoolIds.has(sid))
          throw new Error(`overrides.json: unknown school "${sid}" for ${id}`)
      r.schools = [...o.s]
    }
    if (o.y !== undefined) {
      if (!Number.isInteger(o.y) || o.y < FIRST_COLLEGE_YEAR || o.y > 2100)
        throw new Error(`overrides.json: bad year "${o.y}" for ${id}`)
      r.year = o.y
    }
    if (o.t) {
      if (!['easy', 'medium', 'hard'].includes(o.t))
        throw new Error(`overrides.json: bad tier "${o.t}" for ${id}`)
      r.tier = o.t
    }
  }
  return records
}

/**
 * Apply data/nba-top-picks.json — a hand-kept list of players who are all
 * easy from day `fromDay` (days after puzzle #1). A listed player whose tier
 * was something else (`was`) gets `tierWas: [fromDay, was]` — the `tw` field
 * of players.json — so days before the move are still drawn with his old
 * tier and no lineup already played changes. Runs after assignTiers and
 * applyOverrides, so nobody else's tier moves. Throws on an unknown player
 * or tier.
 */
export function applyTierMoves(records, players, fromDay) {
  if (!Number.isInteger(fromDay) || fromDay < 0)
    throw new Error(`nba-top-picks.json: bad "from" day ${fromDay}`)
  const byId = new Map(records.map((r) => [r.id, r]))
  for (const [id, o] of Object.entries(players)) {
    const r = byId.get(id)
    if (!r) throw new Error(`nba-top-picks.json: no player "${id}" in the pool`)
    if (o.was !== undefined && !['medium', 'hard'].includes(o.was))
      throw new Error(`nba-top-picks.json: bad "was" tier for ${id}`)
    r.tier = 'easy'
    if (o.was) r.tierWas = [fromDay, o.was]
  }
  return records
}

/**
 * The parts of a Wikipedia basketball infobox we use: `colleges` — each
 * `[[target|label]] (start–end)` of the `college` field, in the order
 * written — and the numbers `draft_year`, `draft_pick` and `career_start`
 * (0 when absent). A college written without years gets start = end = 0.
 */
export function parseInfobox(wikitext) {
  const field = (name) => {
    const m = new RegExp(
      `\\n\\s*\\|\\s*${name}\\s*=([\\s\\S]*?)(?=\\n\\s*\\|\\s*[a-z_0-9]+\\s*=|\\n\\}\\})`,
      'i',
    ).exec(wikitext)
    return m ? m[1] : ''
  }
  const n = (name) => Number(/\d{4}|\d+/.exec(field(name))?.[0] ?? 0)
  const colleges = []
  const re =
    /\[\[([^\]|]+)(?:\|[^\]]*)?\]\](?:\s*\((\d{4})(?:\s*[–-]\s*(\d{4}|present))?\))?/g
  for (const m of field('college').matchAll(re)) {
    const start = Number(m[2] ?? 0)
    const end = m[3] === 'present' ? 0 : Number(m[3] ?? m[2] ?? 0)
    colleges.push({ team: m[1].trim(), start, end })
  }
  return {
    colleges,
    draft: n('draft_year'),
    pick: n('draft_pick'),
    start: n('career_start'),
  }
}
