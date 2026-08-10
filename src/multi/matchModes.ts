import { createRng } from '../game/systems/Rng.ts'

type MatchMode = 'shared' | 'duel'
type MatchModeChoice = MatchMode | 'roulette'

const MATCH_MODES: readonly MatchMode[] = ['shared', 'duel']

const MATCH_MODE_LABELS: Record<MatchMode, string> = {
  shared: '함께 쌓기',
  duel: '대결',
}

const MATCH_MODE_CHOICE_LABELS: Record<MatchModeChoice, string> = {
  roulette: '룰렛',
  ...MATCH_MODE_LABELS,
}

function isMatchMode(value: unknown): value is MatchMode {
  return value === 'shared' || value === 'duel'
}

function isMatchModeChoice(value: unknown): value is MatchModeChoice {
  return value === 'roulette' || isMatchMode(value)
}

function resolveMatchMode(choice: MatchModeChoice, seed: number): MatchMode {
  if (choice !== 'roulette') {
    return choice
  }
  const index = Math.floor(createRng(seed).next() * MATCH_MODES.length) % MATCH_MODES.length
  return MATCH_MODES[index] ?? 'shared'
}

export {
  MATCH_MODES,
  MATCH_MODE_LABELS,
  MATCH_MODE_CHOICE_LABELS,
  isMatchMode,
  isMatchModeChoice,
  resolveMatchMode,
}
export type { MatchMode, MatchModeChoice }
