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
  a: 'Cam Newton 2015.jpg',
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
})
