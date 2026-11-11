import { useEffect, useState } from 'react'
import type { Player } from '../types'
import { actionCreditUrl, actionUrls, headshotUrl } from '../lib/images'

interface Props {
  player: Player
  kind: 'headshot' | 'action'
  /** Whether the name may be shown (alt text + credit link reveal it). */
  revealed: boolean
}

/**
 * Fetch the first URL that loads and expose it as an opaque `blob:` URL.
 * Commons URLs contain the file name — usually the player's name — so before
 * the name hint the page must never carry one in an `src` (it would show in
 * the DOM, on long-press and in "open image in new tab").
 * Returns undefined while loading, null when none loaded.
 */
function useBlobImage(urls: string[]): string | null | undefined {
  const key = urls.join('\n')
  const [state, setState] = useState<{
    key: string
    src: string | null
  } | null>(null)
  useEffect(() => {
    if (!key) return
    let live = true
    let made: string | null = null
    ;(async () => {
      for (const url of key.split('\n')) {
        try {
          const res = await fetch(url, { referrerPolicy: 'no-referrer' })
          if (!res.ok) continue
          const blob = await res.blob()
          if (!live) return
          made = URL.createObjectURL(blob)
          setState({ key, src: made })
          return
        } catch {
          // Try the next candidate.
        }
      }
      if (live) setState({ key, src: null })
    })()
    return () => {
      live = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [key])
  if (!key) return null
  return state?.key === key ? state.src : undefined
}

/**
 * One photo of the player. The in-uniform ("action") photo falls back to the
 * headshot when he has none or it fails to load; a failed headshot falls back
 * to a silhouette, so a dead image link never blocks a question.
 */
export function PlayerPhoto({ player, kind, revealed }: Props) {
  const [headshotFailed, setHeadshotFailed] = useState(false)
  // No real headshot on file → the in-uniform photo stands in for it.
  const wantAction = kind === 'action' || !player.h
  const action = useBlobImage(wantAction ? actionUrls(player) : [])
  const headshot = headshotFailed ? null : headshotUrl(player)
  const loading = wantAction && action === undefined
  const src = action ?? (loading ? null : headshot)
  const credit = action && revealed ? actionCreditUrl(player) : null
  return (
    <figure className={`photo ${action ? 'photo-action' : 'photo-headshot'}`}>
      {src ? (
        <img
          src={src}
          alt={revealed ? player.n : 'Mystery player'}
          referrerPolicy="no-referrer"
          draggable={false}
          onError={() => !action && setHeadshotFailed(true)}
        />
      ) : (
        <div
          className="photo-missing"
          role="img"
          aria-label={loading ? 'Loading photo' : 'No photo available'}
        >
          {loading ? '…' : '?'}
        </div>
      )}
      {credit && (
        <figcaption>
          <a href={credit} target="_blank" rel="noreferrer">
            Photo: Wikimedia Commons
          </a>
        </figcaption>
      )}
    </figure>
  )
}
