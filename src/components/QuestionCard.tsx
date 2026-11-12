import { useEffect, useState } from 'react'
import type { Player, School } from '../types'
import { HIGH_SCHOOL_ID, INTERNATIONAL_ID } from '../types'
import {
  type QuestionState,
  LAST_STAGE,
  STAGE_POINTS,
  choices,
  giveUp,
  guess,
  takeHint,
} from '../lib/game'
import type { PhotoStyle } from '../lib/storage'
import { PlayerPhoto } from './PlayerPhoto'
import { SchoolInput } from './SchoolInput'

interface Props {
  player: Player
  schools: School[]
  state: QuestionState
  photoStyle: PhotoStyle
  onChange: (next: QuestionState) => void
}

const NEXT_HINT = ['Show his name', 'Show his conference', 'Show 4 choices']

/** One question: photo, the hint ladder, the answer box and the reveal. */
export function QuestionCard({
  player,
  schools,
  state,
  photoStyle,
  onChange,
}: Props) {
  const name = (id: string) => schools.find((s) => s.id === id)?.name ?? id
  const showName = state.stage >= 1 || state.done
  const showConf = state.stage >= 2 || state.done
  const worth = STAGE_POINTS[state.stage]

  return (
    <div className="question">
      <div className="photos">
        <PlayerPhoto
          // key: a new player must not inherit the last one's load-failure state.
          key={player.id + photoStyle}
          player={player}
          kind={photoStyle}
          revealed={showName}
        />
        {/* Hint 1 also brings the in-uniform shot when the first photo was the headshot. */}
        {showName && photoStyle === 'headshot' && player.h && player.a && (
          <PlayerPhoto
            key={player.id + 'second'}
            player={player}
            kind="action"
            revealed
          />
        )}
      </div>

      <ul className="hints">
        <li className={showName ? 'on' : 'off'}>
          <span className="hint-label">Name</span>
          <span className="hint-value">
            {showName ? `${player.n}${player.p ? ` · ${player.p}` : ''}` : '—'}
          </span>
        </li>
        <li className={showConf ? 'on' : 'off'}>
          <span className="hint-label">Conference</span>
          <span className="hint-value">
            {!showConf
              ? '—'
              : player.s[0] === HIGH_SCHOOL_ID ||
                  player.s[0] === INTERNATIONAL_ID
                ? 'Wouldn’t you like to know weather boy'
                : `${player.c} (${player.y} season)`}
          </span>
        </li>
      </ul>

      {state.wrong.length > 0 && (
        <div className="wrong" aria-label="Wrong guesses">
          {state.wrong.map((id) => (
            <span key={id} className="chip">
              ✗ {name(id)}
            </span>
          ))}
        </div>
      )}

      {state.done ? (
        <div
          className={`reveal ${state.correct ? 'right' : 'miss'}`}
          role="status"
        >
          <div className="reveal-line">
            {state.correct ? '✅' : '❌'}{' '}
            {player.s[0] === INTERNATIONAL_ID ? (
              <>
                {player.n} skipped college — he went pro{' '}
                <strong>overseas</strong> before the NBA
              </>
            ) : player.s[0] === HIGH_SCHOOL_ID ? (
              <>
                {player.n} skipped college — straight to the NBA from{' '}
                <strong>{player.hs ?? 'high school'}</strong>
              </>
            ) : (
              <>
                {player.n} played at <strong>{name(player.s[0])}</strong>
              </>
            )}
          </div>
          {player.s.length > 1 && (
            <div className="reveal-also">
              Also: {player.s.slice(1).map(name).join(', ')}
            </div>
          )}
          <div className="reveal-points">+{state.points}</div>
        </div>
      ) : (
        <>
          <div className="worth">
            Where did he play in college? <strong>{worth} pts</strong>
          </div>
          {state.stage === LAST_STAGE ? (
            <Choices
              options={choices(player).map((id) => ({ id, label: name(id) }))}
              onPick={(id) => onChange(guess(state, player, id))}
            />
          ) : (
            <SchoolInput
              key={player.id}
              schools={schools}
              exclude={state.wrong}
              onGuess={(id) => onChange(guess(state, player, id))}
            />
          )}
          <div className="actions">
            {state.stage < LAST_STAGE && (
              <button type="button" onClick={() => onChange(takeHint(state))}>
                💡 {NEXT_HINT[state.stage]} ({STAGE_POINTS[state.stage + 1]}{' '}
                pts)
              </button>
            )}
            <button
              type="button"
              className="quiet"
              onClick={() => onChange(giveUp(state))}
            >
              I don’t know
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/** How long the choice buttons ignore taps after they appear. */
export const CHOICE_ARM_MS = 400

/**
 * The four multiple-choice buttons. They appear exactly where the hint button
 * was, so a double-tap on "Show 4 choices" would land on an answer: taps are
 * ignored for a beat after mounting.
 */
function Choices(props: {
  options: { id: string; label: string }[]
  onPick: (id: string) => void
}) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setArmed(true), CHOICE_ARM_MS)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="choices">
      {props.options.map((o) => (
        <button
          key={o.id}
          type="button"
          className="choice"
          onClick={() => armed && props.onPick(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
