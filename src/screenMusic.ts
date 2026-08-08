import type { BgmTrackName } from './audio/tracks.ts'
import type { GamePhase } from './game/types/game.ts'

/** 지금 어느 화면에 있는지. 싱글과 대전은 서로 다른 엔진을 쓴다 */
type Route = 'title' | 'solo' | 'lobby' | 'collection' | 'options' | 'name' | 'loopback'

/**
 * 지금 흐를 곡.
 *
 * **판이 끝나도 게임 곡은 이어진다.** 한 판이 끝났을 뿐 아직 판을 떠난 것이 아니라서다 —
 * 결과를 보고 바로 다시 시작하는 것이 이 게임의 보통 흐름인데, 끝날 때마다 곡이
 * 물러났다가 다시 시작할 때 처음부터 들어오면 그 짧은 사이가 매번 끊김으로 남는다.
 * 게임오버 소리도 조용한 배경 위에 홀로 떨어지는 것보다 흐르는 곡 위에 얹히는 편이 낫다.
 *
 * 일시정지는 다르다. 그쪽은 **멈췄다는 것 자체가 알려야 할 것**이라 곡이 물러난다.
 * 판을 떠나면(타이틀·도감·옵션) 그 화면의 곡으로 넘어간다.
 *
 * 옵션이 타이틀 곡을 쓰는 이유는, 소리 설정을 만지는 자리에서 음악이 끊기면
 * 방금 바꾼 것 때문인지 원래 그런 것인지 알 수 없기 때문이다.
 */
function musicFor(
  route: Route,
  soloPhase: GamePhase | null,
  matchPhase: 'playing' | 'over' | null,
): BgmTrackName | null {
  switch (route) {
    case 'loopback':
      return null
    case 'collection':
      return 'collection'
    case 'options':
    case 'name':
      return 'title'
    case 'title':
      return 'title'
    case 'lobby':
      // 판이 시작되기 전(방 만들기·준비)에는 대기방 곡이 흐른다. 끝난 뒤에도 판 곡을 이어간다
      return matchPhase === null ? 'lobby' : 'game'
    case 'solo':
      // 멈춘 것(일시정지)만 조용하다. 끝난 것은 아직 판 안이다
      return soloPhase === 'paused' ? null : 'game'
  }
}


export { musicFor }
export type { Route }
