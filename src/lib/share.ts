/** Wordle-style share text — pure. */
import type { Mode } from '../types'
import { MODE_LABEL } from '../types'
import { type QuestionState, mark, totalPoints } from './game'
import { QUESTIONS_PER_DAY, puzzleNumber } from './daily'
import { MAX_QUESTION_POINTS } from './game'

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
): string {
  const max = QUESTIONS_PER_DAY * MAX_QUESTION_POINTS
  return [
    `WhereHePlay #${puzzleNumber(dateKey)} · ${MODE_LABEL[mode]}`,
    `${squares(marks(qs))} ${totalPoints(qs)}/${max}`,
    url,
  ].join('\n')
}
