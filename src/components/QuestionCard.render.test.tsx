// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import type { Player, School } from '../types'
import { type QuestionState, newQuestion } from '../lib/game'
import { CHOICE_ARM_MS, QuestionCard } from './QuestionCard'

afterEach(() => {
  cleanup()
  last = newQuestion()
})

const schools: School[] = [
  { id: 'auburn', name: 'Auburn' },
  { id: 'florida', name: 'Florida' },
  { id: 'alabama', name: 'Alabama', aliases: ['Bama'] },
  { id: 'tennessee', name: 'Tennessee' },
  { id: 'kentucky', name: 'Kentucky' },
]
const player: Player = {
  id: 'nfl-NewtCa00',
  n: 'Cam Newton',
  l: 'nfl',
  s: ['auburn', 'florida'],
  c: 'SEC',
  y: 2010,
  t: 'easy',
  h: 'private/x',
  d: ['alabama', 'tennessee', 'kentucky'],
  p: 'QB',
  a: 'ab/Cam_Newton_2015.jpg',
}

// The most recent state the card emitted (starts as a fresh question).
let last: QuestionState = newQuestion()
function Harness() {
  const [state, setState] = useState(newQuestion)
  return (
    <QuestionCard
      player={player}
      schools={schools}
      state={state}
      photoStyle="headshot"
      onChange={(next) => {
        last = next
        setState(next)
      }}
    />
  )
}
const type = (text: string) =>
  fireEvent.change(screen.getByRole('combobox'), { target: { value: text } })

describe('QuestionCard', () => {
  it('starts with only an anonymous photo — no name, conference or second photo', () => {
    render(<Harness />)
    expect(screen.getAllByRole('img')).toHaveLength(1)
    expect(screen.getByAltText('Mystery player')).toBeTruthy()
    expect(screen.queryByText(/Cam Newton/)).toBeNull()
    expect(screen.queryByText(/SEC/)).toBeNull()
    expect(document.body.innerHTML).not.toContain('Cam')
  })

  it('autocomplete: picking fills the box, Guess submits; a right answer scores 100', () => {
    render(<Harness />)
    expect(
      (screen.getByRole('button', { name: 'Guess' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    type('aub')
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Auburn' }))
    expect(last.done).toBe(false) // picking alone is not a guess
    fireEvent.click(screen.getByRole('button', { name: 'Guess' }))
    expect(last).toMatchObject({ done: true, correct: true, points: 100 })
    expect(screen.getByRole('status').textContent).toContain('Auburn')
    expect(screen.getByRole('status').textContent).toContain('Also: Florida')
  })

  it('a wrong guess reveals the name and in-uniform photo, and leaves the suggestions', () => {
    render(<Harness />)
    type('bama')
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' }) // pick
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' }) // submit
    expect(last).toMatchObject({ stage: 1, wrong: ['alabama'] })
    expect(screen.getByText('Cam Newton · QB')).toBeTruthy()
    expect(screen.getAllByRole('img')).toHaveLength(2)
    expect(screen.getByText('✗ Alabama')).toBeTruthy()
    type('ala')
    expect(screen.queryByRole('option', { name: 'Alabama' })).toBeNull()
  })

  it('hints climb name → conference → four tappable choices', () => {
    vi.useFakeTimers()
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /Show his name/ }))
    fireEvent.click(screen.getByRole('button', { name: /Show his conference/ }))
    expect(screen.getByText('SEC (2010 season)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Show 4 choices/ }))
    expect(screen.queryByRole('combobox')).toBeNull()
    const names = ['Auburn', 'Alabama', 'Tennessee', 'Kentucky']
    for (const n of names)
      expect(screen.getByRole('button', { name: n })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Show/ })).toBeNull()
    // A double-tap on the hint button must not answer: taps are ignored at first.
    fireEvent.click(screen.getByRole('button', { name: 'Alabama' }))
    expect(last.done).toBe(false)
    act(() => {
      vi.advanceTimersByTime(CHOICE_ARM_MS)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Auburn' }))
    expect(last).toMatchObject({ done: true, correct: true, points: 25 })
    vi.useRealTimers()
  })

  it('"I don\'t know" is offered at every stage and reveals the answer for 0', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /Show his name/ }))
    fireEvent.click(screen.getByRole('button', { name: 'I don’t know' }))
    expect(last).toMatchObject({ done: true, gaveUp: true, points: 0 })
    expect(screen.getByRole('status').textContent).toContain('❌')
    expect(screen.getByRole('status').textContent).toContain('Auburn')
  })

  describe('an international who skipped college', () => {
    const intl: Player = {
      id: 'nba-doncilu01',
      n: 'Luka Dončić',
      l: 'nba',
      s: ['international'],
      c: 'No college',
      y: 2017,
      t: 'easy',
      h: '1629029',
      d: ['auburn', 'alabama', 'kentucky'],
    }
    const all: School[] = [
      ...schools,
      {
        id: 'international',
        name: 'International (no college)',
        aliases: ['International', 'Overseas'],
      },
    ]
    function IntlHarness() {
      const [state, setState] = useState(newQuestion)
      return (
        <QuestionCard
          player={intl}
          schools={all}
          state={state}
          photoStyle="headshot"
          onChange={(next) => {
            last = next
            setState(next)
          }}
        />
      )
    }
    it('typing "international" is right; the reveal says he went pro overseas', () => {
      render(<IntlHarness />)
      type('international')
      fireEvent.mouseDown(
        screen.getByRole('option', { name: 'International (no college)' }),
      )
      fireEvent.click(screen.getByRole('button', { name: 'Guess' }))
      expect(last).toMatchObject({ done: true, correct: true, points: 100 })
      const reveal = screen.getByRole('status').textContent!
      expect(reveal).toContain('skipped college')
      expect(reveal).toContain('overseas')
    })
    it('the conference hint refuses to say', () => {
      render(<IntlHarness />)
      fireEvent.click(screen.getByRole('button', { name: /Show his name/ }))
      fireEvent.click(
        screen.getByRole('button', { name: /Show his conference/ }),
      )
      expect(
        screen.getByText('Wouldn’t you like to know weather boy'),
      ).toBeTruthy()
    })
  })

  describe('a player who skipped college', () => {
    const prep: Player = {
      id: 'nba-jamesle01',
      n: 'LeBron James',
      l: 'nba',
      s: ['high-school'],
      c: 'No college',
      y: 2002,
      t: 'easy',
      h: '2544',
      d: ['auburn', 'alabama', 'kentucky'],
      hs: 'St. Vincent–St. Mary High School (Akron)',
    }
    const all: School[] = [
      ...schools,
      {
        id: 'high-school',
        name: 'High School (no college)',
        aliases: ['High School', 'HS'],
      },
    ]
    function PrepHarness() {
      const [state, setState] = useState(newQuestion)
      return (
        <QuestionCard
          player={prep}
          schools={all}
          state={state}
          photoStyle="headshot"
          onChange={(next) => {
            last = next
            setState(next)
          }}
        />
      )
    }

    it('typing "high school" is the right answer, and the reveal names the school', () => {
      render(<PrepHarness />)
      type('high school')
      fireEvent.mouseDown(
        screen.getByRole('option', { name: 'High School (no college)' }),
      )
      fireEvent.click(screen.getByRole('button', { name: 'Guess' }))
      expect(last).toMatchObject({ done: true, correct: true, points: 100 })
      const reveal = screen.getByRole('status').textContent!
      expect(reveal).toContain('skipped college')
      expect(reveal).toContain('St. Vincent–St. Mary High School (Akron)')
    })

    it('the conference hint refuses to say, and High School is one of the four choices', () => {
      vi.useFakeTimers()
      render(<PrepHarness />)
      fireEvent.click(screen.getByRole('button', { name: /Show his name/ }))
      fireEvent.click(
        screen.getByRole('button', { name: /Show his conference/ }),
      )
      expect(
        screen.getByText('Wouldn’t you like to know weather boy'),
      ).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: /Show 4 choices/ }))
      act(() => {
        vi.advanceTimersByTime(CHOICE_ARM_MS)
      })
      fireEvent.click(
        screen.getByRole('button', { name: 'High School (no college)' }),
      )
      expect(last).toMatchObject({ done: true, correct: true, points: 25 })
      vi.useRealTimers()
    })
  })
})
