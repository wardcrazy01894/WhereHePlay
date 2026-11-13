// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react'
import type { League, Player, Tier } from './types'
import { App } from './App'
import { resolveDay } from './lib/day'

const players: Player[] = []
for (const l of ['nfl', 'nba'] as League[])
  for (const t of ['easy', 'medium', 'hard'] as Tier[])
    // Eight per cell: the five-easy daily needs five easy players besides
    // the three Sicko Mode holds back.
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
        a: 'ab/x.jpg',
        e: 0,
        d: ['b', 'c', 'd'],
      })
const schools = ['a', 'b', 'c', 'd'].map((id) => ({
  id,
  name: `School ${id.toUpperCase()}`,
}))

beforeEach(() => {
  // A fixed day after the swap of 2026-11-14 (only Date is faked: timers run).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-20T17:00:00Z'))
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
  vi.useRealTimers()
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

  it('the tagline does not give away the difficulty mix', async () => {
    const { container } = render(<App />)
    await screen.findByRole('heading', { name: 'NFL' })
    const tagline = container.querySelector('.tagline')!.textContent!
    expect(tagline).toContain('Five players a day')
    expect(tagline).not.toMatch(/easy|medium|hard/i)
  })

  it('the photo choice and "How it works" sit above the games, on every screen', async () => {
    const { container } = render(<App />)
    await screen.findByRole('heading', { name: 'NFL' })
    const setup = container.querySelector('.home > .home-setup')!
    // The rules first, then the photo choice.
    expect([...setup.children].map((c) => c.tagName)).toEqual([
      'DETAILS',
      'FIELDSET',
    ])
    expect(setup.querySelector('fieldset.photo-choice')).toBeTruthy()
    expect(setup.querySelector('details.how')).toBeTruthy()
    // Document order (no CSS reordering): intro, setup, then the games —
    // the same on a phone and on a desktop, and the same for keyboard users.
    const home = container.querySelector('.home')!
    const at = (cls: string) =>
      [...home.children].findIndex((c) => c.classList.contains(cls))
    expect(at('home-intro')).toBe(0)
    expect(at('home-setup')).toBe(1)
    expect(at('modes')).toBe(2)
  })

  it('"Report a bug" is reachable from the header on every screen, and from the footer', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'NFL' })
    // Header icon + footer link.
    expect(
      screen.getAllByRole('button', { name: /Report a bug/ }),
    ).toHaveLength(2)
    // Mid-game the footer may be off screen; the header button is still there.
    fireEvent.click(screen.getAllByRole('button', { name: 'Free play' })[0])
    const header = document.querySelector('header')!
    fireEvent.click(header.querySelector('button[aria-label="Report a bug"]')!)
    expect(screen.getByRole('dialog', { name: 'Report a bug' })).toBeTruthy()
  })

  it('player search: finds a player without showing his college, and offers a one-tap request for a missing one', async () => {
    const posted: string[] = []
    render(<App />)
    await screen.findByRole('heading', { name: 'NFL' })
    fireEvent.click(screen.getByRole('button', { name: /Is he in the game/ }))
    const dialog = screen.getByRole('dialog', { name: 'Is he in the game?' })
    const box = dialog.querySelector('input')!
    fireEvent.change(box, { target: { value: 'Player nfl easy 0' } })
    expect(dialog.textContent).toContain('Player nfl easy 0 is in the game')
    expect(dialog.textContent).not.toContain('School')
    expect(screen.queryByRole('button', { name: /^Request/ })).toBeNull()
    // A name that is not in the dataset → one tap files the request.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        posted.push(`${url} ${String(init?.body ?? '')}`)
        return { ok: false, status: 503, json: async () => ({}) }
      }),
    )
    fireEvent.change(box, { target: { value: 'Kurt Warner' } })
    fireEvent.click(
      screen.getByRole('button', { name: 'Request “Kurt Warner”' }),
    )
    // No API configured in tests → the prefilled GitHub request link.
    const link = await screen.findByRole('link', { name: /prefilled request/ })
    expect(decodeURIComponent(link.getAttribute('href')!)).toContain(
      '[player request] Please add "Kurt Warner" to the game.',
    )
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
      // The player's tier is internal: the progress bar never names it.
      expect(document.querySelector('.tier')).toBeNull()
      expect(document.querySelector('.progress')!.textContent).not.toMatch(
        /easy|medium|hard/i,
      )
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

  it('each mode has Sicko Mode (three easy, a medium, a hard) under the second daily’s id: its own save, streak and share card', async () => {
    const writeText = vi.fn(async (text: string) => void text)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    render(<App />)
    await screen.findByRole('heading', { name: 'NFL' })
    const buttons = screen.getAllByRole('button', { name: 'Sicko Mode' })
    expect(buttons).toHaveLength(3)
    fireEvent.click(buttons[1])
    for (let i = 0; i < 5; i++) {
      expect(
        screen.getByText(new RegExp(`NFL Sicko Mode daily · ${i + 1} of 5`)),
      ).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'I don’t know' }))
      fireEvent.click(
        screen.getByRole('button', {
          name: i < 4 ? 'Next player' : 'See results',
        }),
      )
    }
    expect(
      screen.getByRole('heading', { name: /NFL Sicko Mode #\d+/ }),
    ).toBeTruthy()
    // Saved under the key it has always had, with the 3-1-1 lineup…
    const key = Object.keys(localStorage).find((k) =>
      k.startsWith('whp:v2:daily:nfl-beginner:'),
    )!
    const saved = JSON.parse(localStorage.getItem(key)!)
    expect(saved.variant).toBe('beginner')
    expect(saved.lineup).toHaveLength(5)
    expect(saved.lineup.map((id: string) => id.split('-')[1])).toEqual([
      'easy',
      'easy',
      'easy',
      'medium',
      'hard',
    ])
    expect(localStorage.getItem('whp:v2:stats:nfl-beginner')).toBeTruthy()
    // …and the card names it.
    fireEvent.click(screen.getByRole('button', { name: 'Share result' }))
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(String(writeText.mock.calls[0][0]).split('\n')[0]).toMatch(
      /^WhereHePlay #\d+ · NFL Sicko Mode \(headshot\)$/,
    )
    // Home: Sicko Mode is done, the standard one is untouched.
    fireEvent.click(screen.getByRole('button', { name: '← All games' }))
    expect(
      screen.getByRole('button', { name: 'Sicko Mode done · 0' }),
    ).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Play daily' })).toHaveLength(
      3,
    )
    expect(localStorage.getItem('whp:v2:stats:nfl')).toBeNull()
  })

  it('the daily is five easy players from 2026-11-14', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'NFL' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Play daily' })[1])
    fireEvent.click(screen.getByRole('button', { name: 'I don’t know' }))
    const key = Object.keys(localStorage).find((k) =>
      k.startsWith('whp:v2:daily:nfl:'),
    )!
    const saved = JSON.parse(localStorage.getItem(key)!)
    expect(saved.variant).toBeUndefined()
    for (const id of saved.lineup) expect(id).toMatch(/^nfl-easy-/)
  })

  it('through 2026-11-13 the second daily is still the beginner daily: five easy players', async () => {
    // Midday UTC: 2026-11-13 in every zone from UTC-11 to UTC+11.
    vi.setSystemTime(new Date('2026-11-13T12:00:00Z'))
    render(<App />)
    await screen.findByRole('heading', { name: 'NFL' })
    expect(screen.queryByRole('button', { name: 'Sicko Mode' })).toBeNull()
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Beginner daily' })[1],
    )
    expect(screen.getByText(/NFL Beginner daily · 1 of 5/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'I don’t know' }))
    const key = Object.keys(localStorage).find((k) =>
      k.startsWith('whp:v2:daily:nfl-beginner:'),
    )!
    for (const id of JSON.parse(localStorage.getItem(key)!).lineup)
      expect(id).toMatch(/^nfl-easy-/)
  })

  it('first photo: two radio choices; the pick is remembered and stamped on the day that starts', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'NFL' })
    const headshot = screen.getByRole('radio', {
      name: /Headshot/,
    }) as HTMLInputElement
    const action = screen.getByRole('radio', {
      name: /In action/,
    }) as HTMLInputElement
    expect(headshot.checked).toBe(true)
    expect(action.checked).toBe(false)
    fireEvent.click(action)
    expect(action.checked).toBe(true)
    expect(JSON.parse(localStorage.getItem('whp:v2:photo')!)).toBe('action')
    // Start a daily: it records the choice it was started with…
    fireEvent.click(screen.getAllByRole('button', { name: 'Play daily' })[1])
    fireEvent.click(screen.getByRole('button', { name: 'I don’t know' }))
    const key = Object.keys(localStorage).find((k) =>
      k.startsWith('whp:v2:daily:nfl:'),
    )!
    expect(JSON.parse(localStorage.getItem(key)!).photo).toBe('action')
    // …and keeps it even if the setting is changed back afterwards.
    fireEvent.click(screen.getByRole('button', { name: '← All games' }))
    fireEvent.click(screen.getByRole('radio', { name: /Headshot/ }))
    // (Resumes on the next unanswered question.)
    fireEvent.click(screen.getByRole('button', { name: 'Continue daily' }))
    fireEvent.click(screen.getByRole('button', { name: 'I don’t know' }))
    expect(JSON.parse(localStorage.getItem(key)!).photo).toBe('action')
  })

  it('a player still waiting for a photo is in the search but is never dealt, and a saved lineup that has him starts over', async () => {
    // One famous player with a headshot but no playing photo yet.
    const waiting: Player = {
      ...players[0],
      id: 'nfl-waiting',
      n: 'Waiting Forphoto',
      a: undefined,
      e: undefined,
    }
    players.push(waiting)
    try {
      // A game saved before the rule, with him in it.
      const day = resolveDay('', new Date()).dateKey
      localStorage.setItem(
        `whp:v2:daily:nfl:${day}`,
        JSON.stringify({
          mode: 'nfl',
          dateKey: day,
          lineup: [waiting.id, ...players.slice(0, 4).map((p) => p.id)],
          questions: Array.from({ length: 5 }, () => ({
            stage: 0,
            wrong: [],
            done: true,
            correct: false,
            gaveUp: true,
            points: 0,
          })),
        }),
      )
      render(<App />)
      await screen.findByRole('heading', { name: 'NFL' })
      fireEvent.click(screen.getByRole('button', { name: /Is he in the game/ }))
      const dialog = screen.getByRole('dialog', { name: 'Is he in the game?' })
      fireEvent.change(dialog.querySelector('input')!, {
        target: { value: 'Waiting Forphoto' },
      })
      expect(dialog.textContent).toContain('Waiting Forphoto is in the game')
      fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
      // Opening the daily: the old lineup is not resumed, it starts at 1 of 5.
      fireEvent.click(screen.getAllByRole('button', { name: /daily/i })[1])
      expect(screen.getByText(/NFL daily · 1 of 5/)).toBeTruthy()
      const saved = () =>
        JSON.parse(localStorage.getItem(`whp:v2:daily:nfl:${day}`)!)
      fireEvent.click(screen.getByRole('button', { name: 'I don’t know' }))
      expect(saved().lineup).not.toContain(waiting.id)
      // Free play: forty draws, never him.
      fireEvent.click(screen.getByRole('button', { name: '← All games' }))
      fireEvent.click(screen.getAllByRole('button', { name: 'Free play' })[1])
      for (let i = 0; i < 40; i++) {
        fireEvent.click(screen.getByRole('button', { name: 'I don’t know' }))
        expect(document.body.textContent).not.toContain('Waiting Forphoto')
        fireEvent.click(screen.getByRole('button', { name: 'Next player' }))
      }
    } finally {
      players.pop()
    }
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

describe('auto-update', () => {
  const reload = vi.fn()
  const realLocation = window.location
  /** Serve the dataset as usual, and `hash` as the deployed version. */
  const deploy = (hash: string) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () =>
          String(url).includes('version.json')
            ? { hash }
            : String(url).includes('players')
              ? players
              : schools,
      })),
    )
  beforeEach(() => {
    reload.mockClear()
    sessionStorage.clear()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...realLocation,
        search: '',
        origin: realLocation.origin,
        reload,
      },
    })
  })
  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: realLocation,
    })
  })

  it('reloads from the home screen when a different build is live — once', async () => {
    deploy('some-newer-build')
    const first = render(<App />)
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    // The "reloaded" page still runs this (old) build, e.g. a lagging CDN: no loop.
    first.unmount()
    render(<App />)
    await screen.findByRole('heading', { name: 'NFL' })
    await new Promise((r) => setTimeout(r, 20))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload when the live build is the one running', async () => {
    deploy(import.meta.env.VITE_BUILD_HASH ?? 'dev')
    render(<App />)
    await screen.findByRole('heading', { name: 'NFL' })
    await new Promise((r) => setTimeout(r, 20))
    expect(reload).not.toHaveBeenCalled()
  })

  it('waits for the home screen instead of interrupting a game', async () => {
    // Up to date at load…
    deploy(import.meta.env.VITE_BUILD_HASH ?? 'dev')
    render(<App />)
    await screen.findByRole('heading', { name: 'NFL' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Free play' })[1])
    // …then a deploy lands while a question is on screen.
    deploy('some-newer-build')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(await screen.findByText(/A new version is ready/)).toBeTruthy()
    expect(reload).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '← All games' }))
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
  })

  it('does not wipe a half-filled profile dialog: waits until it is closed', async () => {
    deploy(import.meta.env.VITE_BUILD_HASH ?? 'dev')
    render(<App />)
    await screen.findByRole('heading', { name: 'NFL' })
    fireEvent.click(screen.getByRole('button', { name: /Set name/ }))
    fireEvent.change(screen.getByPlaceholderText('Anonymous'), {
      target: { value: 'Half typ' },
    })
    deploy('some-newer-build')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(
      await screen.findByText(/loads when you close this dialog/),
    ).toBeTruthy()
    expect(reload).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
  })
})
