/**
 * Fetch Wikimedia Commons metadata (capture date, description, categories)
 * for every in-uniform photo in public/players.json into
 * data/raw/commons-meta.json (gitignored cache). Input for
 * scripts/audit-photos.mjs. `npm run fetch-photo-meta`.
 * Uses the public Commons API, 50 files per request, one request at a time.
 */
import { readFile, writeFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const UA =
  'WhereHePlayDataBuild/0.1 (https://github.com/wardcrazy01894/WhereHePlay)'
const cacheUrl = new URL('data/raw/commons-meta.json', root)
const readJson = async (url, fallback) => {
  try {
    return JSON.parse(await readFile(url, 'utf8'))
  } catch {
    return fallback
  }
}
const strip = (html) =>
  String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const players = JSON.parse(
  await readFile(new URL('public/players.json', root), 'utf8'),
)
const files = [
  ...new Set(
    players.filter((p) => p.a).map((p) => p.a.slice(p.a.indexOf('/') + 1)),
  ),
]
const cache = await readJson(cacheUrl, {})
const todo = files.filter((f) => !(f in cache))
console.log(`${files.length} photos, ${todo.length} to fetch`)

for (let i = 0; i < todo.length; i += 50) {
  const batch = todo.slice(i, i + 50)
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2' +
    '&prop=imageinfo&iiprop=extmetadata&titles=' +
    encodeURIComponent(batch.map((f) => 'File:' + f).join('|'))
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`Commons API ${res.status}`)
  const data = await res.json()
  // The API normalises titles (underscores → spaces); map them back.
  const back = new Map(batch.map((f) => ['File:' + f.replace(/_/g, ' '), f]))
  for (const n of data.query?.normalized ?? []) {
    const orig = batch.find((f) => 'File:' + f === n.from)
    if (orig) back.set(n.to, orig)
  }
  for (const page of data.query?.pages ?? []) {
    const f = back.get(page.title)
    if (!f) continue
    const m = page.imageinfo?.[0]?.extmetadata ?? {}
    cache[f] = {
      date: strip(m.DateTimeOriginal?.value ?? m.DateTime?.value ?? ''),
      desc: strip(m.ImageDescription?.value).slice(0, 400),
      cats: strip(m.Categories?.value).slice(0, 600),
      missing: page.missing === true || !page.imageinfo,
    }
  }
  await writeFile(cacheUrl, JSON.stringify(cache))
  await new Promise((r) => setTimeout(r, 500))
}
console.log(`done: ${Object.keys(cache).length} cached`)
