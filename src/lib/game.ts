/**
 * The question state machine — pure, no DOM.
 *
 * A question climbs a hint ladder; the earlier you answer, the more it is
 * worth:
 *   stage 0  photo only                 100
 *   stage 1  + his name                  75
 *   stage 2  + his college conference    50
 *   stage 3  multiple choice (4 taps)    25
 * A wrong typed guess costs the stage (it advances the ladder); a wrong
 * multiple-choice pick, or "I don't know" at any stage, ends it with 0.
 * Any school he played for counts as correct, not just the last one.
 */
import type { Player } from '../types'
import { hashString } from './daily'

export const STAGE_POINTS = [100, 75, 50, 25] as const
export const LAST_STAGE = 3
export const MAX_QUESTION_POINTS = STAGE_POINTS[0]

export type Stage = 0 | 1 | 2 | 3

export interface QuestionState {
  stage: Stage
  /** School ids guessed wrong so far, in order. */
  wrong: string[]
  done: boolean
  correct: boolean
  gaveUp: boolean
  points: number
}

export function newQuestion(): QuestionState {
  return {
    stage: 0,
    wrong: [],
    done: false,
    correct: false,
    gaveUp: false,
    points: 0,
  }
}

export function isCorrect(player: Player, schoolId: string): boolean {
  return player.s.includes(schoolId)
}

/** Submit an answer (typed at stages 0–2, tapped at stage 3). */
export function guess(
  q: QuestionState,
  player: Player,
  schoolId: string,
): QuestionState {
  if (q.done) return q
  if (isCorrect(player, schoolId))
    return { ...q, done: true, correct: true, points: STAGE_POINTS[q.stage] }
  const wrong = [...q.wrong, schoolId]
  if (q.stage === LAST_STAGE) return { ...q, wrong, done: true }
  return { ...q, wrong, stage: (q.stage + 1) as Stage }
}

/** Ask for the next hint without guessing. No-op at the last stage. */
export function takeHint(q: QuestionState): QuestionState {
  if (q.done || q.stage === LAST_STAGE) return q
  return { ...q, stage: (q.stage + 1) as Stage }
}

/** "I don't know" — reveal the answer for 0. */
export function giveUp(q: QuestionState): QuestionState {
  if (q.done) return q
  return { ...q, done: true, gaveUp: true }
}

/**
 * The four multiple-choice options: where he finished plus the three decoys,
 * in an order that is fixed per player (so a reload can't reshuffle them).
 */
export function choices(player: Player): string[] {
  return [player.s[0], ...player.d].sort(
    (a, b) =>
      hashString(`${player.id}|${a}`) - hashString(`${player.id}|${b}`) ||
      (a < b ? -1 : 1),
  )
}

export function totalPoints(qs: QuestionState[]): number {
  return qs.reduce((sum, q) => sum + q.points, 0)
}

/**
 * One character per question for the share card / leaderboard:
 * '4' photo only … '1' multiple choice, '0' missed.
 */
export function mark(q: QuestionState): string {
  return q.correct ? String(4 - q.stage) : '0'
}
