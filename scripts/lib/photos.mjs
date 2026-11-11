/** Pure rules for scripts/audit-photos.mjs (see its header). */

/** College-only vocabulary (any "<Name> Bowl" is a college bowl once the
 *  Super Bowl and Pro Bowl are taken out). */
const COLLEGE_WORDS =
  /\b(ncaa|collegiate|college (football|basketball)|college career|in college|bowl game|[a-z]+ bowl|final four|march madness|big (ten|12|east) (tournament|championship|media)|(acc|sec|pac-1[02]) (tournament|championship|media)|pro day|freshman|sophomore|redshirt|spring game)\b/i

/** Pro events and venues whose names would trip the college rules. */
const PRO_NOISE = /\b(super bowl|pro bowl|university of phoenix stadium)\b/gi

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The first plausible 4-digit year in a free-text Commons date, or null. */
export function photoYear(date) {
  // The EARLIEST year: "23 April 2008 (original upload date) (Original text:
  // July 27, 2007)" was taken in 2007.
  const years = String(date ?? '').match(/\b(19[5-9]\d|20[0-4]\d)\b/g)
  return years ? Math.min(...years.map(Number)) : null
}

/**
 * Why this photo probably shows him in college, or '' if nothing says so.
 * @param photo  { file, date, desc, cats }
 * @param who    { year: fall of his final college season, schools: [{name, aliases, nfl, wd}] }
 */
export function photoFlag(photo, who) {
  const text = [photo.file.replace(/_/g, ' '), photo.desc, photo.cats].join(
    ' | ',
  )
  const clean = text.replace(PRO_NOISE, ' ')
  const y = photoYear(photo.date)
  // Commons often files a PRO-era photo under the player's college category
  // too ("Alabama Crimson Tide football players"), as biography. So for a
  // photo dated two or more years after college, the categories are not
  // searched for his school — only the file name and description are.
  const proEra = y !== null && y >= who.year + 2
  const own = [photo.file.replace(/_/g, ' '), photo.desc]
    .join(' | ')
    .replace(PRO_NOISE, ' ')
  const scope = proEra ? own : clean
  if (y !== null && y <= who.year)
    return `taken in ${y}, final college season ${who.year}`
  for (const s of who.schools) {
    // Team names ("Iowa State Cyclones") and unambiguous school names. Short
    // or generic names (Miami, Houston, Washington, Texas…) are also cities
    // or pro teams, so those only count together with the mascot.
    const strong = [
      ...s.wd,
      ...s.nfl.filter((n) => / (State|Tech|A&M|College)$| /.test(n)),
    ]
    const ambiguous = PRO_PLACES.has(s.name.replace(/ \(.+\)$/, ''))
    const names = ambiguous ? s.wd : [...strong, s.name.replace(/ \(.+\)$/, '')]
    // A city-like name still counts when written as a university.
    const base = s.name.replace(/ \(.+\)$/, '')
    if (ambiguous) names.push(`University of ${base}`, `${base} University`)
    for (const n of names) {
      if (n.length < 4) continue
      if (new RegExp(`\\b${escape(n)}\\b`, 'i').test(scope))
        return `mentions ${n}`
    }
  }
  const w = COLLEGE_WORDS.exec(clean)
  if (w) return `college wording: "${w[0]}"`
  // The spring of his last college season: ambiguous by date alone (he may
  // already be a pro by autumn), so only the two rules above decide.
  return ''
}

/**
 * Clear the in-uniform photo of every record whose photo is on the blocklist
 * (data/photo-blocklist.json) and return how many were cleared.
 *  - `manual` + `auto`, minus `allow`: photos in COLLEGE gear — they give the
 *    answer away.
 *  - `notPlaying`: not a photo of him playing for an NBA/NFL team at all (a
 *    suit, a press conference, a national-team or overseas-club shirt).
 *  - `weak`: pro gear, but not a game photo (warm-ups, a media-day pose) or
 *    plainly not the team he is known for.
 * A playing photo is a playing photo: none of these is used, even when it is
 * the only photo of him. He stays in the dataset and is simply not drawn
 * until a real one is found (eligibleSince).
 * @param records  [{ head, action: "<xy>/<File_name>" | '' }], mutated
 */
export function applyBlocklist(records, lists) {
  const allowed = new Set(lists.allow ?? [])
  const blocked = new Set([
    ...[...(lists.manual ?? []), ...(lists.auto ?? [])].filter(
      (f) => !allowed.has(f),
    ),
    ...(lists.notPlaying ?? []),
    ...(lists.weak ?? []),
  ])
  let cleared = 0
  for (const r of records) {
    if (!r.action) continue
    if (blocked.has(r.action.slice(r.action.indexOf('/') + 1))) {
      r.action = ''
      cleared++
    }
  }
  return cleared
}

/** Puzzle #1 — must equal EPOCH_DATE_KEY in src/lib/daily.ts (a test checks). */
export const EPOCH_DATE_KEY = '2026-11-11'

/**
 * Who may be drawn, and when. Only a player with BOTH a real headshot and a
 * real playing photo is put in a daily lineup or free play; everyone else
 * waits in the dataset. `prev` is data/eligible-since.json: player id → the
 * day his window opened (days since the epoch), or a flat list of window
 * edges `[from, until, from, …]` (until is exclusive; an odd length means the
 * last window is still open).
 *
 * Nothing already written ever changes: a player with an open window keeps
 * it; a newly eligible one opens a window at `newDay`; one who lost a photo
 * (or left the dataset) has his window closed at `newDay`, and a new photo
 * later opens another. `newDay` is never in the past (firstNewDay), so no
 * build can change which players were eligible on a day already played.
 */
export function eligibleSince(prev, records, newDay) {
  const both = new Set(
    records.filter((r) => r.head && r.action).map((r) => r.id),
  )
  const next = {}
  for (const id of new Set([...Object.keys(prev), ...both])) {
    const edges = [prev[id] ?? []].flat()
    const open = edges.length % 2 === 1
    if (both.has(id) !== open) {
      // Opened and closed (or closed and reopened) before that day began:
      // the edge never took effect, so it is simply taken back.
      if (edges.at(-1) === newDay) edges.pop()
      else edges.push(newDay)
    }
    if (edges.length) next[id] = edges.length === 1 ? edges[0] : edges
  }
  return next
}

/**
 * The first day a player whose photos land `now` may be drawn: the day after
 * the latest calendar day anyone on Earth is in (UTC+14), as days since the
 * epoch. The puzzle day is the player's local day, so nobody is in it yet.
 */
export function firstNewDay(now, epochDateKey) {
  const farEast = new Date(now.getTime() + 14 * 3_600_000)
  const today = Date.UTC(
    farEast.getUTCFullYear(),
    farEast.getUTCMonth(),
    farEast.getUTCDate(),
  )
  const epoch = Date.parse(epochDateKey + 'T00:00:00Z')
  return Math.max(0, Math.round((today - epoch) / 86_400_000) + 1)
}

/** School names that are also NFL/NBA cities or states used in team names. */
export const PRO_PLACES = new Set([
  'Miami',
  'Houston',
  'Washington',
  'Minnesota',
  'Indiana',
  'Utah',
  'Arizona',
  'Colorado',
  'Tennessee',
  'Cincinnati',
  'Pittsburgh',
  'Buffalo',
  'Memphis',
  'Charlotte',
  'Denver',
  'Portland',
  'San Francisco',
  'San Diego',
  'Detroit',
  'Milwaukee',
  'Cleveland',
  'Oklahoma',
  'Carolina',
  'New Orleans',
  'Sacramento',
  'Toledo',
  'Akron',
  'Dayton',
  'Boston',
  'Brooklyn',
  'Seattle',
  'Jacksonville',
  'Texas',
  'California',
  'Florida',
  'Georgia',
  'Michigan',
  'Ohio',
  'Oregon',
  'Louisville',
  'Kentucky',
  'Kansas',
  'Missouri',
  'Iowa',
  'Illinois',
  'Wisconsin',
  'Nebraska',
  'Alabama',
  'Arkansas',
  'Virginia',
  'Maryland',
  'Louisiana',
  'Nevada',
  'Hawaii',
  'Idaho',
  'Wyoming',
  'Montana',
  'Delaware',
  'Vermont',
  'Maine',
  'Richmond',
  'Princeton',
  'Columbia',
  'Brown',
  'American',
  'Pacific',
  'Southern',
  'Army',
  'Navy',
  'Rice',
  'Temple',
  'Marshall',
  'Troy',
  'Liberty',
  'Drake',
  'Butler',
  'Howard',
  'Lane',
  'Lewis',
  'Williams',
  'Penn',
  'Duke',
  'Tulsa',
  'Albany',
  'Hampton',
  'Marist',
  'Siena',
  'Iona',
  'Rider',
  'Bradley',
  'Xavier',
  'Davidson',
  'Furman',
  'Wagner',
  'Mercer',
  'Samford',
  'Auburn',
  'Clemson',
  'Baylor',
  'Stanford',
  'Syracuse',
  'Purdue',
])
