/**
 * 물건을 놓치면 고양이가 뛰어들어 물어 간다.
 *
 * 목숨이 깎이는 순간은 이 게임에서 가장 중요한 사건인데, 예전에는 물건이 테두리 밖으로
 * 조용히 날아가는 것이 전부였다 — 화면 구석에서 일어나고 그때 눈은 다음 단어를 쫓고
 * 있어서, **무엇을 잃었는지도 잃었다는 것도 잘 안 보였다.** 고양이가 가로질러 지나가면
 * 그 순간이 화면 가운데를 한 번 지난다.
 *
 * ## 왜 `systems/`인가
 *
 * 캔버스도 DOM도 모른다. 받는 것은 "무엇이 어디서 떨어졌는가"이고 내놓는 것은
 * **지금 고양이가 어디에 있는가**다. 어떻게 그릴지는 `renderer/`가 정한다 —
 * 색번짐에서 `LandingGlow`와 `glow.ts`를 나눈 것과 같은 경계다.
 *
 * ## 판의 난수를 쓰지 않는다
 *
 * 어느 고양이가 나올지는 자기 난수로 정한다. 판의 난수열에 끼어들면 **고양이 한 마리
 * 때문에 같은 시드가 같은 판을 못 만든다** — 부스러기(`TrailField`)와 같은 이유다.
 */
import type { ItemVariant } from '../types/game.ts'

/** 고양이 네 마리. 나올 때마다 무작위로 고른다 */
const KINDS = ['cheese', 'american-shorthair', 'tabby', 'tuxedo'] as const

type CatKind = (typeof KINDS)[number]

/**
 * 뛰어드는 데 걸리는 시간(초).
 *
 * 짧으면 무엇이 지나갔는지 못 읽고, 길면 다음 물건을 놓는 손을 막는다. 목숨을 잃은
 * 뒤에는 무적이 2초 이어지므로 그 안에서 끝나야 다음 이탈과 겹치지 않는다.
 */
const DURATION = 1.1

/** 물건을 무는 지점(0~1). 이때 물건이 고양이 손에 붙는다 */
const GRAB_AT = 0.45

interface CatView {
  readonly kind: CatKind
  /** 어느 쪽에서 뛰어드는가. 물건이 떨어진 쪽에서 들어온다 */
  readonly from: 'left' | 'right'
  /** 물어 갈 물건 */
  readonly variant: ItemVariant
  /** 물건이 떨어진 자리(월드 좌표) */
  readonly x: number
  readonly y: number
  /** 0(뛰어들기 시작) → 1(다 지나감) */
  readonly progress: number
  /** 물건을 이미 물었는가. 물기 전에는 떨어진 자리에 그대로 있다 */
  readonly holding: boolean
}

class CatPickup {
  private live: {
    kind: CatKind
    from: 'left' | 'right'
    variant: ItemVariant
    x: number
    y: number
    elapsed: number
  } | null = null
  private seed = 1

  /**
   * 난수를 스스로 굴린다. 까닭은 이 파일 맨 위에.
   */
  private random(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff
    return this.seed / 0x7fffffff
  }

  /**
   * 물건을 놓쳤다. 고양이가 뛰어든다.
   *
   * **이미 뛰고 있으면 무시한다.** 탑이 무너지면 한 번에 여럿이 떨어지는데 그때마다
   * 부르면 고양이가 여럿 교차해 무엇이 목숨을 깎았는지 오히려 안 보인다 — 엔진도
   * 같은 이유로 이탈을 개수가 아니라 사건으로 센다(`INVULNERABLE_SEC`).
   */
  take(variant: ItemVariant, x: number, y: number): void {
    if (this.live !== null) {
      return
    }
    this.live = {
      kind: KINDS[Math.floor(this.random() * KINDS.length)] ?? KINDS[0],
      /*
       * 떨어진 쪽에서 들어온다. 반대쪽에서 오면 화면을 가로질러 와야 해서 뛰어드는
       * 것이 아니라 지나가는 것으로 보이고, 물건에 닿는 순간도 늦다.
       */
      from: x < 0 ? 'left' : 'right',
      variant,
      x,
      y,
      elapsed: 0,
    }
  }

  update(dt: number): void {
    if (this.live === null) {
      return
    }
    this.live.elapsed += dt
    if (this.live.elapsed >= DURATION) {
      this.live = null
    }
  }

  /** 판을 다시 시작할 때. 앞 판의 고양이가 남아 있으면 안 된다 */
  reset(): void {
    this.live = null
  }

  /** 지금 어디에 있는가. 없으면 null */
  get view(): CatView | null {
    if (this.live === null) {
      return null
    }
    const progress = Math.min(this.live.elapsed / DURATION, 1)
    return {
      kind: this.live.kind,
      from: this.live.from,
      variant: this.live.variant,
      x: this.live.x,
      y: this.live.y,
      progress,
      holding: progress >= GRAB_AT,
    }
  }
}

export { CatPickup, KINDS, DURATION, GRAB_AT }
export type { CatKind, CatView }
