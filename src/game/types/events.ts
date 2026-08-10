/**
 * 게임이 "무슨 일이 일어났는지"만 말하는 통로.
 *
 * 엔진은 소리를 모른다. 렌더러와 같은 관계다 — 엔진은 상태와 사건을 내놓고,
 * 그것을 화면으로 그릴지 소리로 낼지는 바깥이 정한다. 그래서 이 파일에는
 * DOM도 WebAudio도 들어오지 않고, node에서 그대로 테스트가 돈다.
 *
 * 값을 함께 싣는 이벤트가 있는 이유는 **세기가 곧 소리**이기 때문이다.
 * 가벼운 것이 톡 닿는 것과 비행기가 쿵 떨어지는 것이 같은 소리를 내면
 * 화면과 귀가 어긋난다.
 */
import type { Material } from './game.ts'

type GameEvent =
  /** 판이 시작됐다 */
  | { readonly kind: 'runStart' }
  /** 낙하 중인 단어를 맞췄다. combo는 이 입력으로 올라간 뒤의 값이다 */
  | { readonly kind: 'wordHit'; readonly combo: number }
  /** 아무 단어와도 맞지 않았다 */
  | { readonly kind: 'wordMiss' }
  /**
   * 물건이 손을 떠났다.
   *
   * 무엇이 떨어지는지가 **닿기 전에** 들려야 한다. 이 게임에서 물건의 정체는 Enter를
   * 친 순간 처음 공개되는데, 그때 눈은 다음 단어를 쫓고 있어서 화면을 못 볼 때가 많다.
   */
  | {
      readonly kind: 'drop'
      /** 타이핑으로 놓은 물건인가, Night Fever가 직접 내린 재료인가 */
      readonly source: 'input' | 'fever'
      readonly hidden: boolean
      readonly material: Material
      readonly tone: number
    }
  /**
   * 물건이 무언가에 부딪혔다.
   *
   * strength(0~1)는 부딪힌 세기, mass는 물리 세계에서 잰 실제 질량, size는 그린 크기의
   * 큰 변(월드 단위)이다. material은 무엇으로 만들어졌는가, tone·grain(0~1)은 같은
   * 재질 안에서 이 물건을 가르는 두 축이다(음높이와 울림). 이것들이 모여야
   * "무엇이 얼마나 세게 얹혔는지"가 소리만으로 들린다.
   */
  | {
      readonly kind: 'impact'
      readonly strength: number
      readonly mass: number
      readonly size: number
      readonly material: Material
      readonly tone: number
      readonly grain: number
    }
  /** 무겁고 큰 물건이 부딪혀 화면이 흔들린다. strength는 0~1 */
  | { readonly kind: 'quake'; readonly strength: number }
  /** 재료가 합쳐져 새 물건이 됐다 */
  | { readonly kind: 'merge' }
  /** 물건이 받침대를 벗어나 목숨이 깎였다 */
  | { readonly kind: 'lifeLost'; readonly livesLeft: number }
  /** 목숨을 다 잃어 탑이 무너지기 시작했다 */
  | { readonly kind: 'collapse' }
  /** 판이 끝났다. won은 대전에서만 의미가 있고 싱글은 null이다 */
  | { readonly kind: 'gameOver'; readonly won: boolean | null }
  /** 글자 하나가 입력칸에 들어오거나 지워졌다 */
  | { readonly kind: 'typed' }
  /** 메뉴에서 고른 항목이 옮겨졌다 */
  | { readonly kind: 'menuMove' }
  /** 메뉴 항목으로 들어갔다 */
  | { readonly kind: 'menuSelect' }
  /** 대전: 내 차례가 됐다 */
  | { readonly kind: 'turn' }
  /**
   * 누가 한마디 했다. `mine`이면 내가 한 말이다.
   *
   * 내 말과 남의 말을 가르는 이유는 **남의 말만 알림이기 때문이다.** 내가 친 것은
   * 이미 알고 있어서 같은 소리를 내면 타자음 위에 한 번 더 겹칠 뿐이다.
   */
  | { readonly kind: 'chat'; readonly mine: boolean }

/** 이벤트를 받아가는 쪽. 엔진은 이 함수의 정체를 모른다 */
type GameEventSink = (event: GameEvent) => void

export type { GameEvent, GameEventSink }
