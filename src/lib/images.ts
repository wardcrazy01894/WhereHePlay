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
  // "espn:<id>": the league's own image is a placeholder (or, for a few NFL
  // legends, an action cut-out) and ESPN has a real headshot.
  if (p.h.startsWith('espn:'))
    return `https://a.espncdn.com/i/headshots/${p.l}/players/full/${p.h.slice(5)}.png`
  // "bbr:<id>": a hand-checked headshot on Basketball-Reference, for players
  // NBA.com shows a silhouette for and ESPN does not have.
  if (p.h.startsWith('bbr:'))
    return `https://www.basketball-reference.com/req/202106291/images/headshots/${p.h.slice(4)}.jpg`
  // "pfr:<file>": the same, for NFL players the league and ESPN lack, on
  // Pro-Football-Reference (its
  // file names carry a year: "DaviTe00_USAT_1996").
  if (p.h.startsWith('pfr:'))
    return `https://www.pro-football-reference.com/req/20230307/images/headshots/${p.h.slice(4)}.jpg`
  // "clubs:<path>": a hand-picked image on the NFL clubs' image server.
  if (p.h.startsWith('clubs:'))
    return `https://static.clubs.nfl.com/image/${p.h.slice(6)}`
  return p.l === 'nba'
    ? `https://cdn.nba.com/headshots/nba/latest/260x190/${p.h}.png`
    : `https://static.www.nfl.com/image/${p.h}`
}

/** "tsdb:<kind>/<file>": a playing photo hosted by TheSportsDB. */
const TSDB = /^tsdb:((?:thumb|cutout|render|fanart)\/[a-z0-9]+\.(?:jpg|png))$/

/**
 * The playing photo as a plain image URL, when it has one that is safe to
 * put in the page: TheSportsDB names its files with opaque ids, so the URL
 * does not give the player away (and its host sends no CORS headers, so it
 * could not be fetched into a blob anyway). Null for a Commons photo — see
 * actionUrls — and for no photo.
 */
export function actionDirectUrl(p: Player): string | null {
  const m = TSDB.exec(p.a ?? '')
  return m ? `https://r2.thesportsdb.com/images/media/player/${m[1]}` : null
}

/** `a` is "<xy>/<File_name.jpg>" — the file's storage path on Commons. */
function commonsPath(p: Player): { dir: string; file: string } | null {
  if (!p.a || p.a.startsWith('tsdb:')) return null
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
