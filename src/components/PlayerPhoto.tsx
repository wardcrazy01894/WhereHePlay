import { useState } from 'react'
import type { Player } from '../types'
import { actionCreditUrl, actionUrl, headshotUrl } from '../lib/images'

interface Props {
  player: Player
  kind: 'headshot' | 'action'
  /** Whether the name may be shown (alt text + credit link reveal it). */
  revealed: boolean
}

/**
 * One photo of the player. An in-uniform ("action") photo falls back to the
 * headshot when he has none or it fails to load; a failed headshot falls back
 * to a silhouette, so a dead image link never blocks a question.
 */
export function PlayerPhoto({ player, kind, revealed }: Props) {
  const [failed, setFailed] = useState<Record<string, boolean>>({})
  // No real headshot on file → the in-uniform photo stands in for it.
  const wantAction = kind === 'action' || !player.h
  const action = wantAction && !failed.action ? actionUrl(player) : null
  const src = action ?? (failed.headshot ? null : headshotUrl(player))
  const credit = action && revealed ? actionCreditUrl(player) : null
  return (
    <figure className={`photo ${action ? 'photo-action' : 'photo-headshot'}`}>
      {src ? (
        <img
          src={src}
          alt={revealed ? player.n : 'Mystery player'}
          referrerPolicy="no-referrer"
          draggable={false}
          onError={() =>
            setFailed((f) => ({ ...f, [action ? 'action' : 'headshot']: true }))
          }
        />
      ) : (
        <div
          className="photo-missing"
          role="img"
          aria-label="No photo available"
        >
          ?
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
