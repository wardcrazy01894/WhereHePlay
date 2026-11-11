// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import type { League, Player, Tier } from './types'
import { App } from './App'
import { resolveDay } from './lib/day'

const players: Player[] = []
for (const l of ['nfl', 'nba'] as League[])
  for (const t of ['easy', 'medium', 'hard'] as Tier[])
    for (let i = 0; i < 4; i++)
      players.push({
        id: `${l}-${t}-${i}`,
        n: `Player ${l} ${t} ${i}`,
        l,
        s: ['a'],
        c: 'SEC',
        y: 2010,
        t,
        h: 'x',
        d: ['b', 'c', 'd'],
      })
const schools = ['a', 'b', 'c', 'd'].map((id) => ({
  id,
  name: `School ${id.toUpperCase()}`,
}))

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (String(url).includes('players') ? players : schools),
    })),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('home offers a daily and free play for each of the three modes', async () => {
    render(<App />)
    expect(
      await screen.findByRole('heading', { name: 'Grab Bag' }),
    ).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'NFL' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'NBA' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Play daily' })).toHaveLength(
      3,
    )
    expect(screen.getAllByRole('button', { name: 'Free play' })).toHaveLength(3)
  })

  it('the last line of the footer is the Spicy Al credit', async () => {
    const { container } = render(<App />)
    await screen.findByRole('heading', { name: 'NFL' })
    const footer = container.querySelector('footer')!
    expect(footer.lastElementChild!.textContent).toBe(
      'A Spicy Al Software Solution',
    )
  })

  it('a daily plays five questions and lands on the results with a share button', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'NFL' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Play daily' })[1])
    for (let i = 0; i < 5; i++) {
      expect(screen.getByText(new RegExp(`${i + 1} of 5`))).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'I don’t know' }))
      fireEvent.click(
        screen.getByRole('button', {
          name: i < 4 ? 'Next player' : 'See results',
        }),
      )
    }
    expect(screen.getByRole('button', { name: 'Share result' })).toBeTruthy()
    expect(screen.getByLabelText('Result by question').textContent).toBe(
      '⬛⬛⬛⬛⬛',
    )
    // Back home, the finished daily is locked in and the streak shows.
    fireEvent.click(screen.getByRole('button', { name: '← All games' }))
    expect(screen.getByRole('button', { name: 'Daily done · 0' })).toBeTruthy()
    expect(screen.getByText('🔥 1-day streak')).toBeTruthy()
  })

  it('free play keeps dealing players', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'NFL' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Free play' })[2])
    expect(screen.getByText('NBA free play')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'I don’t know' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next player' }))
    expect(screen.getByText(/1 played/)).toBeTruthy()
    expect(screen.getByRole('combobox')).toBeTruthy()
  })
})

describe('resolveDay (?date= practice days)', () => {
  const now = new Date(2026, 10, 20, 12) // local 2026-11-20
  it('defaults to today, official', () => {
    expect(resolveDay('', now)).toEqual({
      dateKey: '2026-11-20',
      official: true,
    })
    expect(resolveDay('?date=2026-11-20', now).official).toBe(true)
  })
  it('accepts days from puzzle #1 to a week ahead as practice', () => {
    expect(resolveDay('?date=2026-11-11', now)).toEqual({
      dateKey: '2026-11-11',
      official: false,
    })
    expect(resolveDay('?date=2026-11-27', now).dateKey).toBe('2026-11-27')
  })
  it('ignores far-future, pre-launch and impossible dates (a far date would hang the walk)', () => {
    for (const d of [
      '9999-12-31',
      '2026-11-28',
      '2026-11-10',
      '2026-02-30',
      'nope',
    ])
      expect(resolveDay(`?date=${d}`, now)).toEqual({
        dateKey: '2026-11-20',
        official: true,
      })
  })
})
