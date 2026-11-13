/** Wordle-style share text — pure. */
import type { Mode, Variant } from '../types'
import { gameLabel } from '../types'
import { type QuestionState, mark, totalPoints } from './game'
import { QUESTIONS_PER_DAY, puzzleNumber } from './daily'
import { MAX_QUESTION_POINTS } from './game'

import { type PhotoStyle } from './storage'

/** How the first-photo choice reads on the share card and the picker. */
export const PHOTO_LABEL: Record<PhotoStyle, string> = {
  headshot: 'headshot',
  action: 'in action',
}

/** 🟩 photo only · 🟨 with name · 🟧 with conference · 🟥 multiple choice · ⬛ missed */
const SQUARES: Record<string, string> = {
  '4': '🟩',
  '3': '🟨',
  '2': '🟧',
  '1': '🟥',
  '0': '⬛',
}

export function marks(qs: QuestionState[]): string {
  return qs.map(mark).join('')
}
export function squares(markString: string): string {
  return [...markString].map((m) => SQUARES[m] ?? '⬛').join('')
}

export function shareText(
  mode: Mode,
  dateKey: string,
  qs: QuestionState[],
  url: string,
  photo: PhotoStyle = 'headshot',
  variant: Variant = 'standard',
): string {
  const max = QUESTIONS_PER_DAY * MAX_QUESTION_POINTS
  return [
    `WhereHePlay #${puzzleNumber(dateKey)} · ${gameLabel(mode, variant, dateKey)} (${PHOTO_LABEL[photo]})`,
    `${squares(marks(qs))} ${totalPoints(qs)}/${max}`,
    url,
  ].join('\n')
}
