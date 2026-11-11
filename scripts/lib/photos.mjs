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
  const m = /\b(19[5-9]\d|20[0-4]\d)\b/.exec(String(date ?? ''))
  return m ? Number(m[1]) : null
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
    for (const n of names) {
      if (n.length < 4) continue
      if (new RegExp(`\\b${escape(n)}\\b`, 'i').test(clean))
        return `mentions ${n}`
    }
  }
  const w = COLLEGE_WORDS.exec(clean)
  if (w) return `college wording: "${w[0]}"`
  // The spring of his last college season: ambiguous by date alone (he may
  // already be a pro by autumn), so only the two rules above decide.
  return ''
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
