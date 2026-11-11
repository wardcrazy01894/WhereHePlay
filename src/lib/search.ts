/** School autocomplete — pure. */
import type { School } from '../types'

/** Lowercase, strip accents and punctuation, collapse spaces. Apostrophes and
 *  periods vanish ("St. John's" → "st johns") so they never have to be typed. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’.]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Schools matching `query`, best first: exact name/alias, then a name that
 * starts with it, then an alias or a later word that starts with it, then any
 * substring. Ties alphabetical. Empty query → [].
 */
export function searchSchools(
  schools: School[],
  query: string,
  limit = 8,
): School[] {
  const q = normalize(query)
  if (!q) return []
  const scored: { school: School; score: number }[] = []
  for (const school of schools) {
    const name = normalize(school.name)
    const aliases = (school.aliases ?? []).map(normalize)
    let score = -1
    if (name === q || aliases.includes(q)) score = 0
    else if (name.startsWith(q)) score = 1
    else if (aliases.some((a) => a.startsWith(q))) score = 2
    else if (
      [name, ...aliases].some(
        (t) => t.split(' ').some((w) => w.startsWith(q)) || t.includes(' ' + q),
      )
    )
      score = 3
    else if ([name, ...aliases].some((t) => t.includes(q))) score = 4
    if (score >= 0) scored.push({ school, score })
  }
  return scored
    .sort(
      (a, b) => a.score - b.score || a.school.name.localeCompare(b.school.name),
    )
    .slice(0, limit)
    .map((s) => s.school)
}
