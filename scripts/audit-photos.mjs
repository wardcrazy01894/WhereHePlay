/**
 * Flag in-uniform (Wikimedia) photos that probably show the player in
 * COLLEGE — which would give the answer away — using the Commons metadata
 * fetched by scripts/fetch-photo-meta.mjs. Writes the flagged file names to
 * data/photo-blocklist.json under "auto" (the "manual" list in that file is
 * hand-kept and preserved). build-players never uses a blocklisted photo.
 * Run order: build-players → fetch-photo-meta → audit-photos → build-players.
 * `npm run audit-photos` (add `-- --report` to print each reason).
 *
 * A photo is flagged when:
 *  - it was taken in or before the fall of his final college season, or
 *  - its file name, description or categories name his school (or its team),
 *    or use college-only words (NCAA, a bowl game, "college football"…).
 * Deliberately trigger-happy: a wrongly dropped photo costs nothing (the
 * league headshot is still there); a missed one spoils a question.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { parseSchools } from './lib/schools.mjs'
import { photoFlag } from './lib/photos.mjs'

const root = new URL('../', import.meta.url)
const read = async (p) => readFile(new URL(p, root), 'utf8')
// The pre-blocklist candidate list written by build-players (NOT
// public/players.json, which no longer contains the photos already blocked).
const players = JSON.parse(await read('data/raw/photo-candidates.json'))
const schools = new Map(
  parseSchools(await read('data/schools.psv')).map((s) => [s.id, s]),
)
const meta = JSON.parse(await read('data/raw/commons-meta.json'))
const listUrl = new URL('data/photo-blocklist.json', root)
const existing = JSON.parse(
  await read('data/photo-blocklist.json').catch(() => '{}'),
)

const flagged = new Map()
let checked = 0
for (const p of players) {
  if (!p.a) continue
  const file = p.a.slice(p.a.indexOf('/') + 1)
  const m = meta[file]
  if (!m) continue
  checked++
  const reason = photoFlag(
    { file, ...m },
    { year: p.y, schools: p.s.map((id) => schools.get(id)).filter(Boolean) },
  )
  if (reason) flagged.set(file, `${p.n}: ${reason}`)
}
const manual = existing.manual ?? []
await writeFile(
  listUrl,
  JSON.stringify(
    {
      _comment:
        'Wikimedia photos never to use (they show the player in college gear). "auto" is rewritten by `npm run audit-photos`; "manual" (caught by eye or reported) and "allow" (auto-flagged but checked by eye and fine) are hand-kept and preserved. See docs/DATA.md §Photos.',
      manual,
      allow: existing.allow ?? [],
      auto: [...flagged.keys()].sort(),
    },
    null,
    2,
  ) + '\n',
)
console.log(
  `checked ${checked} photos: ${flagged.size} flagged, ${manual.length} manual`,
)
if (process.argv.includes('--report'))
  for (const [f, why] of [...flagged].sort()) console.log(`${f}\t${why}`)
