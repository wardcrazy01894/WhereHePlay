import { useMemo, useRef, useState } from 'react'
import type { School } from '../types'
import { searchSchools } from '../lib/search'

interface Props {
  schools: School[]
  /** School ids already guessed wrong — left out of the suggestions. */
  exclude: string[]
  onGuess: (schoolId: string) => void
}

/**
 * Typed answer with autocomplete. Picking a suggestion only FILLS the box; the
 * guess is sent by the Guess button (or Enter on a filled box), so a stray tap
 * in the list can't cost a hint stage.
 */
export function SchoolInput({ schools, exclude, onGuess }: Props) {
  const [text, setText] = useState('')
  const [picked, setPicked] = useState<School | null>(null)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const matches = useMemo(
    () =>
      picked
        ? []
        : searchSchools(
            schools.filter((s) => !exclude.includes(s.id)),
            text,
          ),
    [schools, exclude, text, picked],
  )

  const pick = (s: School) => {
    setPicked(s)
    setText(s.name)
    inputRef.current?.focus()
  }
  const submit = () => {
    if (!picked) return
    onGuess(picked.id)
    setPicked(null)
    setText('')
    setActive(0)
  }

  return (
    <div className="school-input">
      <div className="school-input-row">
        <input
          ref={inputRef}
          type="text"
          value={text}
          placeholder="Type a college…"
          aria-label="College"
          role="combobox"
          aria-expanded={matches.length > 0}
          aria-controls="school-options"
          aria-autocomplete="list"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value)
            setPicked(null)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(a + 1, matches.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(a - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              if (picked) submit()
              else if (matches[active]) pick(matches[active])
            }
          }}
        />
        <button
          type="button"
          className="primary"
          disabled={!picked}
          onClick={submit}
        >
          Guess
        </button>
      </div>
      {matches.length > 0 && (
        <ul id="school-options" role="listbox" className="school-options">
          {matches.map((s, i) => (
            <li
              key={s.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : undefined}
              // mousedown, not click: fires before the input loses focus.
              onMouseDown={(e) => {
                e.preventDefault()
                pick(s)
              }}
            >
              {s.name}
            </li>
          ))}
        </ul>
      )}
      {text.trim() !== '' && !picked && matches.length === 0 && (
        <div className="school-none">No college matches “{text.trim()}”.</div>
      )}
    </div>
  )
}
