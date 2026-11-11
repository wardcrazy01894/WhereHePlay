// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import type { League, Player, Tier } from './types'
import { getDateKey } from './lib/daily'

// The API client reads its endpoint when the module loads, so it has to be
// set before App is imported.
vi.hoisted(() => {
  vi.stubEnv('VITE_API_ENDPOINT', 'https://api.test')
})
const { App } = await import('./App')

const players: Player[] = []
for (const l of ['nfl', 'nba'] as League[])
  for (const t of ['easy', 'medium', 'hard'] as Tier[])
    for (let i = 0; i < 8; i++)
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
const TOKEN = 'ab'.repeat(24)
const today = getDateKey()

/** What the account already holds, as `/me` reports it. */
let me: Record<string, unknown>
const posted: { path: string; body: Record<string, unknown> }[] = []

beforeEach(() => {
  localStorage.clear()
  posted.length = 0
  localStorage.setItem(
    'whp:v1:identity',
    JSON.stringify({ token: TOKEN, name: 'Al', username: 'al' }),
  )
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url)
      if (!u.startsWith('https://api.test'))
        return {
          ok: true,
          json: async () => (u.includes('players') ? players : schools),
        }
      const path = u.slice('https://api.test'.length)
      posted.push({ path, body: JSON.parse(String(init?.body ?? '{}')) })
      const body =
        path === '/me'
          ? me
          : path === '/score'
            ? { rank: 1, total: 1, streak: { current: 6, best: 6 } }
            : { total: 0, entries: [] }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, ...body }),
      }
    }),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('cross-device sync', () => {
  it('a daily finished on another device shows as done here, with the account’s streak', async () => {
    me = {
      name: 'Al',
      username: 'al',
      scores: [{ board: 'nfl', date: today, score: 250, marks: '43210' }],
      streaks: [{ board: 'nfl', current: 6, best: 6, last: today }],
    }
    render(<App />)
    await screen.findByRole('heading', { name: 'NFL' })
    const done = await screen.findByRole('button', { name: 'Daily done · 250' })
    expect(screen.getByText('🔥 6-day streak')).toBeTruthy()
    // The other two modes are still to play.
    expect(screen.getAllByRole('button', { name: 'Play daily' })).toHaveLength(
      2,
    )
    fireEvent.click(done)
    expect(screen.getByLabelText('Result by question').textContent).toBe(
      '🟩🟨🟧🟥⬛',
    )
    expect(screen.getByText(/Played on another device/)).toBeTruthy()
  })

  it('a daily finished here before signing in is handed to the account', async () => {
    // Play NFL while the account knows nothing about today…
    me = { name: 'Al', username: 'al', scores: [], streaks: [] }
    const first = render(<App />)
    await screen.findByRole('heading', { name: 'NFL' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Play daily' })[1])
    for (let i = 0; i < 5; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'I don’t know' }))
      fireEvent.click(
        screen.getByRole('button', {
          name: i < 4 ? 'Next player' : 'See results',
        }),
      )
    }
    first.unmount()
    // …then come back later: the home screen alone sends it.
    posted.length = 0
    render(<App />)
    await screen.findByRole('button', { name: 'Daily done · 0' })
    await vi.waitFor(() =>
      expect(posted.filter((p) => p.path === '/score')).toHaveLength(1),
    )
    expect(posted.find((p) => p.path === '/score')!.body).toMatchObject({
      token: TOKEN,
      board: 'nfl',
      date: today,
      score: 0,
      marks: '00000',
    })
    expect(await screen.findByText('🔥 6-day streak')).toBeTruthy()
  })

  it('a worker that predates sync changes nothing', async () => {
    me = { name: 'Al', username: 'al' }
    render(<App />)
    await screen.findByRole('heading', { name: 'NFL' })
    await vi.waitFor(() =>
      expect(posted.some((p) => p.path === '/me')).toBe(true),
    )
    expect(screen.getAllByRole('button', { name: 'Play daily' })).toHaveLength(
      3,
    )
    expect(posted.some((p) => p.path === '/score')).toBe(false)
  })
})
