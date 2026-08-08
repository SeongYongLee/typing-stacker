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
type GameEvent =
  /** 판이 시작됐다 */
  | { readonly kind: 'runStart' }
  /** 낙하 중인 단어를 맞췄다. combo는 이 입력으로 올라간 뒤의 값이다 */
  | { readonly kind: 'wordHit'; readonly combo: number }
  /** 아무 단어와도 맞지 않았다 */
  | { readonly kind: 'wordMiss' }
  /** 물건이 손을 떠났다 */
  | { readonly kind: 'drop'; readonly hidden: boolean }
  /**
   * 물건이 무언가에 부딪혔다.
   * strength(0~1)는 부딪힌 세기, size는 그린 크기의 큰 변(월드 단위)이다 —
   * 큰 물건일수록 낮게 울려야 한다.
   */
  | { readonly kind: 'impact'; readonly strength: number; readonly size: number }
  /** 무겁고 큰 물건이 부딪혀 화면이 흔들린다. strength는 0~1 */
  | { readonly kind: 'quake'; readonly strength: number }
  /** 재료가 합쳐져 새 물건이 됐다 */
  | { readonly kind: 'merge' }
  /** 히든이 모습을 드러냈다 */
  | { readonly kind: 'reveal' }
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
  /** 대전: 상대가 단어를 지목했다 */
  | { readonly kind: 'suggested' }

/** 이벤트를 받아가는 쪽. 엔진은 이 함수의 정체를 모른다 */
type GameEventSink = (event: GameEvent) => void

export type { GameEvent, GameEventSink }
