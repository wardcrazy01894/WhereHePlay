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
  return {
    /** nflverse `college_name` entry → school | undefined */
    nfl: (name) => byNfl.get(name.trim().toLowerCase()),
    /** Wikidata team label ("Duke Blue Devils men's basketball") → school */
    wd: (label) => {
      const l = label.toLowerCase()
      return prefixes.find(([p]) => l === p || l.startsWith(p + ' '))?.[1]
    },
  }
}
