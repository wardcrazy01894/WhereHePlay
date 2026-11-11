// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type { Player } from '../types'
import { PlayerPhoto } from './PlayerPhoto'

const player: Player = {
  id: 'nfl-RomoTo00',
  n: 'Tony Romo',
  l: 'nfl',
  s: ['eastern-illinois'],
  c: 'OVC',
  y: 2002,
  t: 'medium',
  d: ['a', 'b', 'c'],
  h: 'private/f_auto/league/opaque123',
  a: '5a/Tony_Romo_2008.jpg',
}

let fetched: string[]
beforeEach(() => {
  fetched = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      fetched.push(url)
      // The 500px thumbnail does not exist for this (small) file; the original does.
      return url.includes('/thumb/')
        ? { ok: false }
        : { ok: true, blob: async () => new Blob(['x']) }
    }),
  )
  URL.createObjectURL = vi.fn(() => 'blob:opaque-1')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('PlayerPhoto', () => {
  it('headshot: the league URL (an opaque key), no fetch, nothing naming him', () => {
    const { container } = render(
      <PlayerPhoto player={player} kind="headshot" revealed={false} />,
    )
    expect(screen.getByAltText('Mystery player').getAttribute('src')).toBe(
      'https://static.www.nfl.com/image/private/f_auto/league/opaque123',
    )
    expect(fetched).toEqual([])
    expect(container.innerHTML).not.toMatch(/Romo/i)
  })

  it('in-uniform photo before the name hint: shown from a blob URL, never the named file', async () => {
    const { container } = render(
      <PlayerPhoto player={player} kind="action" revealed={false} />,
    )
    // While loading there is no image at all — not the headshot, not the URL.
    expect(container.querySelector('img')).toBeNull()
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull())
    expect(container.querySelector('img')!.getAttribute('src')).toBe(
      'blob:opaque-1',
    )
    // Thumbnail failed → the original was tried next.
    expect(fetched).toHaveLength(2)
    expect(container.innerHTML).not.toMatch(/Romo/i)
    expect(container.querySelector('a')).toBeNull() // no credit link yet
  })

  it('once revealed, the photo is credited with a link to its Commons page', async () => {
    render(<PlayerPhoto player={player} kind="action" revealed />)
    const link = await screen.findByRole('link', {
      name: 'Photo: Wikimedia Commons',
    })
    expect(link.getAttribute('href')).toBe(
      'https://commons.wikimedia.org/wiki/File:Tony_Romo_2008.jpg',
    )
    expect(screen.getByAltText('Tony Romo')).toBeTruthy()
  })

  it('a player with no league headshot uses the in-uniform photo even in headshot mode', async () => {
    const { container } = render(
      <PlayerPhoto
        player={{ ...player, h: undefined }}
        kind="headshot"
        revealed={false}
      />,
    )
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull())
    expect(container.querySelector('img')!.getAttribute('src')).toBe(
      'blob:opaque-1',
    )
    expect(container.innerHTML).not.toMatch(/Romo/i)
  })

  it('falls back to the headshot when the in-uniform photo cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false })),
    )
    const { container } = render(
      <PlayerPhoto player={player} kind="action" revealed={false} />,
    )
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull())
    expect(container.querySelector('img')!.getAttribute('src')).toContain(
      'static.www.nfl.com',
    )
  })
  it('a TheSportsDB playing photo is shown straight from its opaque URL, with no fetch', () => {
    const tsdb = { ...player, a: 'tsdb:thumb/abc123.jpg' }
    render(<PlayerPhoto player={tsdb} kind="action" revealed={false} />)
    const img = screen.getByAltText('Mystery player') as HTMLImageElement
    expect(img.src).toBe(
      'https://r2.thesportsdb.com/images/media/player/thumb/abc123.jpg',
    )
    expect(fetched).toEqual([])
    // Nothing in the page names him before the name hint.
    expect(document.body.innerHTML).not.toMatch(/Romo/i)
  })
  it('…and if the headshot fails too, a placeholder — a dead link never blocks a question', () => {
    const tsdb = { ...player, a: 'tsdb:thumb/abc123.jpg' }
    render(<PlayerPhoto player={tsdb} kind="action" revealed={false} />)
    fireEvent.error(screen.getByAltText('Mystery player'))
    fireEvent.error(screen.getByAltText('Mystery player'))
    expect(screen.getByRole('img', { name: 'No photo available' })).toBeTruthy()
  })
  it('…and falls back to the headshot if it fails to load', () => {
    const tsdb = { ...player, a: 'tsdb:thumb/abc123.jpg' }
    render(<PlayerPhoto player={tsdb} kind="action" revealed={false} />)
    fireEvent.error(screen.getByAltText('Mystery player'))
    expect(
      (screen.getByAltText('Mystery player') as HTMLImageElement).src,
    ).toBe('https://static.www.nfl.com/image/private/f_auto/league/opaque123')
  })
})
