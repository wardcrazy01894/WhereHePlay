import { describe, it, expect } from 'vitest'
import type { Player } from '../types'
import {
  STAGE_POINTS,
  choices,
  giveUp,
  guess,
  mark,
  newQuestion,
  takeHint,
  totalPoints,
} from './game'

const player: Player = {
  id: 'nfl-NewtCa00',
  n: 'Cam Newton',
  l: 'nfl',
  s: ['auburn', 'florida'],
  c: 'SEC',
  y: 2010,
  t: 'easy',
  h: 'x',
  d: ['alabama', 'tennessee', 'kentucky'],
}

describe('question ladder', () => {
  it('a right answer is worth the current stage', () => {
    expect(guess(newQuestion(), player, 'auburn')).toMatchObject({
      done: true,
      correct: true,
      points: 100,
    })
    const afterHints = takeHint(takeHint(newQuestion()))
    expect(guess(afterHints, player, 'auburn').points).toBe(50)
  })
  it('any school he played for counts', () => {
    expect(guess(newQuestion(), player, 'florida').correct).toBe(true)
  })
  it('a wrong typed guess costs a stage and is remembered', () => {
    const q = guess(newQuestion(), player, 'alabama')
    expect(q).toMatchObject({ stage: 1, done: false, wrong: ['alabama'] })
    expect(guess(q, player, 'auburn').points).toBe(75)
  })
  it('a wrong multiple-choice pick ends the question with 0', () => {
    const last = takeHint(takeHint(takeHint(newQuestion())))
    expect(last.stage).toBe(3)
    expect(takeHint(last)).toBe(last)
    expect(guess(last, player, 'alabama')).toMatchObject({
      done: true,
      correct: false,
      points: 0,
    })
    expect(guess(last, player, 'auburn').points).toBe(25)
  })
  it('"I don\'t know" ends it for 0 at any stage', () => {
    expect(giveUp(newQuestion())).toMatchObject({
      done: true,
      gaveUp: true,
      points: 0,
    })
    expect(giveUp(takeHint(newQuestion())).points).toBe(0)
  })
  it('nothing changes once a question is done', () => {
    const done = guess(newQuestion(), player, 'auburn')
    expect(guess(done, player, 'alabama')).toBe(done)
    expect(takeHint(done)).toBe(done)
    expect(giveUp(done)).toBe(done)
  })
  it('marks and totals', () => {
    const a = guess(newQuestion(), player, 'auburn')
    const b = guess(takeHint(newQuestion()), player, 'auburn')
    const c = giveUp(newQuestion())
    expect([a, b, c].map(mark).join('')).toBe('430')
    expect(totalPoints([a, b, c])).toBe(175)
    expect(STAGE_POINTS).toEqual([100, 75, 50, 25])
  })
})

describe('choices', () => {
  it('is the finishing school plus the three decoys, in a stable order', () => {
    const c = choices(player)
    expect([...c].sort()).toEqual([
      'alabama',
      'auburn',
      'kentucky',
      'tennessee',
    ])
    expect(choices({ ...player, d: [...player.d].reverse() })).toEqual(c)
  })
  it('does not always put the answer in the same slot', () => {
    const slots = new Set<number>()
    for (let i = 0; i < 40; i++)
      slots.add(choices({ ...player, id: `p${i}` }).indexOf('auburn'))
    expect(slots.size).toBeGreaterThan(2)
  })
})
