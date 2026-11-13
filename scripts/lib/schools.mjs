/**
 * Parse + query data/schools.psv — the hand-curated schools table (names,
 * source-name mappings, search aliases, conference timelines). Pure; the
 * format is documented at the top of the .psv and in docs/DATA.md.
 */

const list = (s) =>
  (s ?? '')
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean)

/** "SEC" | "1994:Big Eight,1996:Big 12" → [[year, conf], …] ascending. */
export function parseTimeline(raw, where = '') {
  const s = (raw ?? '').trim()
  if (!s) return []
  if (!s.includes(':')) return [[0, s]]
  const out = s.split(',').map((part) => {
    const m = /^(\d{4}):(.+)$/.exec(part.trim())
    if (!m) throw new Error(`Bad timeline segment "${part}" ${where}`)
    return [Number(m[1]), m[2].trim()]
  })
  for (let i = 1; i < out.length; i++)
    if (out[i][0] <= out[i - 1][0])
      throw new Error(`Timeline years not ascending: "${raw}" ${where}`)
  return out
}

export function parseSchools(text) {
  const schools = []
  const ids = new Set()
  text.split('\n').forEach((line, i) => {
    const t = line.trim()
    if (!t || t.startsWith('#')) return
    const f = line.split('|')
    const where = `(schools.psv line ${i + 1})`
    if (f.length !== 7)
      throw new Error(`Expected 7 fields, got ${f.length} ${where}`)
    const [id, name, nfl, wd, aliases, fb, bb] = f.map((x) => x.trim())
    if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`Bad id "${id}" ${where}`)
    if (ids.has(id)) throw new Error(`Duplicate id "${id}" ${where}`)
    ids.add(id)
    if (!name) throw new Error(`Missing name ${where}`)
    const school = {
      id,
      name,
      nfl: list(nfl),
      wd: list(wd),
      aliases: list(aliases),
      fb: parseTimeline(fb, where),
      bb: parseTimeline(bb, where),
    }
    if (!school.fb.length && !school.bb.length)
      throw new Error(`No conference timeline for "${id}" ${where}`)
    schools.push(school)
  })
  return schools
}

/**
 * The school's conference for `sport` ('nfl' → football, 'nba' → basketball)
 * in the season that STARTED in the fall of `year`. Basketball falls back to
 * the football/default column and vice versa. A year before the first entry
 * returns the first entry (programs that started later).
 */
export function conferenceAt(school, sport, year) {
  const own = sport === 'nba' ? school.bb : school.fb
  const tl = own.length ? own : sport === 'nba' ? school.fb : school.bb
  let conf = tl[0][1]
  for (const [from, c] of tl) if (year >= from) conf = c
  return conf
}

/** Lookup maps for the two source vocabularies. */
const eduKey = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9& ]/g, ' ')
    .replace(/\b(the|university|of|at|college)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
/** Wikidata university labels the generic rule gets wrong or cannot reach
 *  (label → school id; '' = not a school of ours, whatever the rule says). */
const EDU_LABELS = {
  'Miami University': 'miami-oh',
  'University of Miami': 'miami-fl',
  'Washington University in St. Louis': '',
  // "Boston" alone would be Boston College.
  'Boston University': 'boston-university',
  'Pennsylvania State University': 'penn-state',
  'University of Maryland, College Park': 'maryland',
  'University of North Carolina at Chapel Hill': 'north-carolina',
  'University of Texas at Austin': 'texas',
  'University of Illinois Urbana-Champaign': 'illinois',
  'University of California, Los Angeles': 'ucla',
  'University of Wisconsin–Madison': 'wisconsin',
  'University of Colorado Boulder': 'colorado',
  'University of Nebraska–Lincoln': 'nebraska',
  'University of California, Santa Barbara': 'uc-santa-barbara',
  'California State University, Fresno': 'fresno-state',
  "Saint Mary's College of California": 'saint-marys',
  'California Polytechnic State University': 'cal-poly',
}

export function buildMatchers(schools) {
  const byNfl = new Map()
  for (const s of schools)
    for (const n of [s.name, ...s.nfl]) {
      const k = n.toLowerCase()
      if (!byNfl.has(k)) byNfl.set(k, s)
    }
  // Longest prefix first so "Miami RedHawks" never matches a shorter "Miami".
  const prefixes = schools
    .flatMap((s) => s.wd.map((p) => [p.toLowerCase(), s]))
    .sort((a, b) => b[0].length - a[0].length)
  // University names as Wikidata labels them ("University of Kentucky",
  // "Gonzaga University"): the school's own names with the generic words
  // dropped, plus the few a rule cannot get right.
  const byEdu = new Map()
  for (const s of schools)
    for (const n of [s.name, ...s.nfl, ...s.aliases]) {
      const k = eduKey(n)
      if (k && !byEdu.has(k)) byEdu.set(k, s)
    }
  const byId = new Map(schools.map((s) => [s.id, s]))
  return {
    /** Wikidata "educated at" label → school | undefined */
    edu: (label) =>
      label in EDU_LABELS
        ? byId.get(EDU_LABELS[label])
        : byEdu.get(eduKey(label)),
    /** nflverse `college_name` entry → school | undefined */
    nfl: (name) => byNfl.get(name.trim().toLowerCase()),
    /** Wikidata team label ("Duke Blue Devils men's basketball") → school */
    wd: (label) => {
      const l = label.toLowerCase()
      return prefixes.find(([p]) => l === p || l.startsWith(p + ' '))?.[1]
    },
  }
}
