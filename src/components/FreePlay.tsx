import { useState } from 'react'
import type { Mode, Player, School } from '../types'
import { MODE_LABEL } from '../types'
import { type QuestionState, newQuestion } from '../lib/game'
import { nextFreePlayer } from '../lib/freeplay'
import { type PhotoStyle, loadFreeBest, saveFreeBest } from '../lib/storage'
import { QuestionCard } from './QuestionCard'

interface Props {
  players: Player[]
  schools: School[]
  mode: Mode
  photoStyle: PhotoStyle
}

/** Endless practice: no clock, no leaderboard, just a running streak. */
export function FreePlay({ players, schools, mode, photoStyle }: Props) {
  const [recent, setRecent] = useState<string[]>([])
  const [player, setPlayer] = useState<Player>(() =>
    nextFreePlayer(players, mode, []),
  )
  const [state, setState] = useState<QuestionState>(newQuestion)
  const [run, setRun] = useState(0)
  const [points, setPoints] = useState(0)
  const [answered, setAnswered] = useState(0)
  const [best, setBest] = useState(() => loadFreeBest(mode).streak)

  const onChange = (next: QuestionState) => {
    setState(next)
    if (!next.done) return
    const newRun = next.correct ? run + 1 : 0
    setRun(newRun)
    setPoints((p) => p + next.points)
    setAnswered((n) => n + 1)
    if (newRun > best) {
      setBest(newRun)
      saveFreeBest(mode, { streak: newRun })
    }
  }

  const next = () => {
    const seen = [...recent, player.id]
    setRecent(seen)
    setPlayer(nextFreePlayer(players, mode, seen))
    setState(newQuestion())
  }

  return (
    <div className="daily">
      <div className="progress">
        <span>{MODE_LABEL[mode]} free play</span>
        <span>
          🔥 {run} <span className="muted">(best {best})</span>
        </span>
        <span>
          {points} pts · {answered} played
        </span>
      </div>
      <QuestionCard
        player={player}
        schools={schools}
        state={state}
        photoStyle={photoStyle}
        onChange={onChange}
      />
      {state.done && (
        <button type="button" className="primary next" autoFocus onClick={next}>
          Next player
        </button>
      )}
    </div>
  )
}
