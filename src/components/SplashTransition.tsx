type SplashTransitionPhase = 'idle' | 'darkening' | 'covered' | 'revealing'

/**
 * 문이 열리는 동안 스플래시를 가리고, 완전히 검을 때 화면을 바꾼 뒤 새 화면을 연다.
 *
 * 열림 효과음의 가장 긴 마찰이 0.55초라서 `darkening + covered`를 0.6초로 맞췄다.
 * 그보다 먼저 바꾸면 쿵 닫히기 전에 플레이 화면이 비쳐 소리와 화면이 서로 다른
 * 순간을 말한다.
 */
const SPLASH_DARKEN_MS = 260
const SPLASH_COVERED_MS = 340
const SPLASH_REVEAL_MS = 220

function SplashTransition({ phase }: { phase: SplashTransitionPhase }) {
  return (
    <div
      className="splash-transition"
      data-phase={phase}
      data-splash-transition={phase}
      aria-hidden="true"
    />
  )
}

export {
  SplashTransition,
  SPLASH_DARKEN_MS,
  SPLASH_COVERED_MS,
  SPLASH_REVEAL_MS,
}
export type { SplashTransitionPhase }
