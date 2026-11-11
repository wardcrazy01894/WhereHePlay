/**
 * Photo URLs. Nothing is stored in the repo — images are hotlinked:
 *  - headshots from the leagues' own CDNs (official, copyrighted; see
 *    docs/APP.md for why an app-store build must not use them), and
 *  - in-uniform "action" photos from Wikimedia Commons (freely licensed;
 *    the card links to the file page for attribution).
 */
import type { Player } from '../types'

export function headshotUrl(p: Player): string | null {
  if (!p.h) return null
  return p.l === 'nba'
    ? `https://cdn.nba.com/headshots/nba/latest/260x190/${p.h}.png`
    : `https://static.www.nfl.com/image/${p.h}`
}

/** Commons thumbnail for the in-uniform photo, or null when he has none. */
export function actionUrl(p: Player, width = 480): string | null {
  if (!p.a) return null
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(p.a)}?width=${width}`
}

/** The Commons file page (author + licence) for the attribution link. */
export function actionCreditUrl(p: Player): string | null {
  if (!p.a) return null
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(p.a.replace(/ /g, '_'))}`
}
