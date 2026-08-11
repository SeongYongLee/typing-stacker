type MatchMode = 'shared' | 'duel'
type MatchModeChoice = MatchMode | 'roulette'

/** 함께 쌓기와 룰렛을 다시 열 때 이 목록과 세션 고정값을 함께 복구한다. */
const MATCH_MODES: readonly MatchMode[] = ['duel']
const ACTIVE_MATCH_MODE: MatchMode = 'duel'

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

function resolveMatchMode(_choice: MatchModeChoice, _seed: number): MatchMode {
  return ACTIVE_MATCH_MODE
}

export {
  MATCH_MODES,
  ACTIVE_MATCH_MODE,
  MATCH_MODE_LABELS,
  MATCH_MODE_CHOICE_LABELS,
  isMatchMode,
  isMatchModeChoice,
  resolveMatchMode,
}
export type { MatchMode, MatchModeChoice }
