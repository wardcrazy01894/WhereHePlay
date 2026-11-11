/**
 * Photo URLs. Nothing is stored in the repo — images are hotlinked:
 *  - headshots from the leagues' own CDNs (official, copyrighted; see
 *    docs/APP.md for why an app-store build must not use them), and
 *  - in-uniform "action" photos from Wikimedia Commons (freely licensed;
 *    the card links to the file page for attribution).
 *
 * A Commons URL contains the file name, which is usually the player's name.
 * PlayerPhoto therefore never puts one in the page before the name hint: it
 * fetches the image and shows it from an opaque blob: URL instead.
 */
import type { Player } from '../types'

export function headshotUrl(p: Player): string | null {
  if (!p.h) return null
  // "espn:<id>": the NFL's own image is a placeholder, ESPN has a real one.
  if (p.h.startsWith('espn:'))
    return `https://a.espncdn.com/i/headshots/nfl/players/full/${p.h.slice(5)}.png`
  return p.l === 'nba'
    ? `https://cdn.nba.com/headshots/nba/latest/260x190/${p.h}.png`
    : `https://static.www.nfl.com/image/${p.h}`
}

/** `a` is "<xy>/<File_name.jpg>" — the file's storage path on Commons. */
function commonsPath(p: Player): { dir: string; file: string } | null {
  if (!p.a) return null
  const slash = p.a.indexOf('/')
  const hash = p.a.slice(0, slash)
  return {
    dir: `${hash[0]}/${hash}`,
    file: encodeURIComponent(p.a.slice(slash + 1)),
  }
}

const COMMONS = 'https://upload.wikimedia.org/wikipedia/commons'

/**
 * URLs to try, in order, for the in-uniform photo: a 500px thumbnail, then
 * the original (Commons refuses to scale an image UP, so a small original
 * has no 500px thumbnail). Empty when he has none. upload.wikimedia.org
 * sends `Access-Control-Allow-Origin: *`, which PlayerPhoto relies on.
 */
export function actionUrls(p: Player): string[] {
  const c = commonsPath(p)
  if (!c) return []
  return [
    `${COMMONS}/thumb/${c.dir}/${c.file}/500px-${c.file}`,
    `${COMMONS}/${c.dir}/${c.file}`,
  ]
}

/** The Commons file page (author + licence) for the attribution link. */
export function actionCreditUrl(p: Player): string | null {
  const c = commonsPath(p)
  return c ? `https://commons.wikimedia.org/wiki/File:${c.file}` : null
}
