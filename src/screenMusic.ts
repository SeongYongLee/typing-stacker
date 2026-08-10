import type { BgmTrackName } from './audio/tracks.ts'
import type { Phase } from './game/systems/DayNight.ts'
import type { GamePhase } from './game/types/game.ts'
import type { TitleTheme } from './screens/titleTheme.ts'

/** 지금 어느 화면에 있는지. 싱글과 대전은 서로 다른 엔진을 쓴다 */
type Route = 'title' | 'solo' | 'lobby' | 'collection' | 'options' | 'name' | 'loopback'

interface MusicScene {
  readonly route: Route
  readonly titleTheme: TitleTheme
  readonly soloPhase: GamePhase | null
  readonly soloTimeOfDay: Phase | null
  readonly matchPhase: 'playing' | 'over' | null
}

/** 화면의 낮·Night Fever를 곡 이름으로 옮긴다. */
function soloTrackFor(phase: Phase | null): BgmTrackName {
  return phase === 'day' ? 'gameDay' : 'gameNight'
}

/**
 * 지금 흐를 곡.
 *
 * 낮·밤은 화면이 이미 쓰는 **같은 상태**에서 고른다. 스플래시는 진입 시각으로 고정한
 * 테마를, 혼자 하기는 `DayNight`의 국면을 따른다. 그림과 음악이 각자 시계를 보면
 * 경계에서 서로 다른 낮·밤을 말할 수 있으므로 선택은 이 함수 한 곳에서만 한다.
 *
 * 판이 끝나도 마지막 낮·밤 곡은 이어진다. 결과를 보고 바로 다시 시작하는 것이 보통
 * 흐름이라, 끝날 때마다 곡이 물러나면 짧은 사이가 매번 끊김으로 남는다. 일시정지만
 * 조용하다 — 그쪽은 멈췄다는 것 자체가 알려야 할 정보다.
 */
function musicFor(scene: MusicScene): BgmTrackName | null {
  const splashTrack = scene.titleTheme === 'day' ? 'splashDay' : 'splashNight'

  switch (scene.route) {
    case 'loopback':
      return null
    case 'collection':
      return 'collection'
    case 'options':
    case 'name':
    case 'title':
      return splashTrack
    case 'lobby':
      // 대전은 낮에 머문다. 판이 열리기 전만 대기방 곡이다
      return scene.matchPhase === null ? 'lobby' : 'gameDay'
    case 'solo':
      return scene.soloPhase === 'paused' ? null : soloTrackFor(scene.soloTimeOfDay)
  }
}

export { musicFor, soloTrackFor }
export type { MusicScene, Route }
