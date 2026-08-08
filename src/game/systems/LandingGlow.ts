import { IMPACT_FULL_SCALE } from '../config.ts'
import { glows } from '../data/glowItems.ts'

/**
 * 빛나는 물건이 얹히는 순간을 들고 있다가 시간에 따라 놓아준다.
 *
 * 물건마다 소리가 다르고 튐이 다른데 **보이는 것은 다 같았다.** 무엇이 얹혔는지는
 * 그림으로만 알 수 있고, 그때 눈은 다음 단어를 쫓고 있어 화면 가운데를 못 본다 —
 * 낙하음을 재질마다 다르게 만든 것과 같은 이유로, 얹히는 순간이 눈 구석에서도
 * 읽혀야 한다.
 *
 * **모든 물건이 아니라 빛나는 것만** 물들인다(`data/glowItems.ts`). 1초에 한 번씩
 * 화면 색이 바뀌면 그것은 특색이 아니라 배경이 깜빡이는 것이고, 늘 일어나는 일은
 * 아무것도 알리지 못한다.
 *
 * 싱글과 대전이 함께 쓴다. 두 엔진에 같은 것을 두 벌 두면 한쪽만 고쳐지는데,
 * 이런 연출은 어긋나도 테스트가 아니라 눈으로만 잡힌다. 색을 실제로 칠하는 일은
 * `renderer/glow.ts`가 하고, 여기는 **무엇이 얼마나 남았는지**만 안다 — DOM도
 * canvas도 모르므로 node에서 그대로 검사할 수 있다.
 */

/** 얹힘 하나 — 물리가 돌려주는 것 중 이 연출에 필요한 부분만 */
interface LandingImpact {
  readonly variant: { readonly id: string; readonly color: string }
  readonly impact: number
  /** 떨어져서 처음 닿은 것인가 */
  readonly first: boolean
}

/** 렌더러에 넘기는 모양 */
interface LandingGlowView {
  readonly color: string
  readonly strength: number
  /** 0(닿은 순간) → 1(다 사라짐) */
  readonly progress: number
}

/**
 * 색이 사라지는 데 걸리는 시간(초).
 *
 * 짧아야 한다. 물건은 1초에 한 번쯤 얹히므로 이보다 길면 색이 이어져 **화면이 늘
 * 물들어 있고**, 그러면 어느 물건이 남긴 색인지 알 수 없다. 히든 등장 연출이 1.8초로
 * 긴 것은 그쪽이 드물게 일어나기 때문이다.
 */
const LANDING_GLOW_SEC = 0.5

class LandingGlow {
  private color = ''
  private strength = 0
  private elapsed = 0
  private active = false

  /**
   * 이번 스텝의 얹힘들을 받아 하나를 고른다. 거르는 것이 둘이다.
   *
   * **빛나는 물건이어야 한다.** 기준은 `data/glowItems.ts`에 있다.
   *
   * **떨어져서 처음 닿은 것만** 본다. 무너지는 동안에는 부딪힘이 한 프레임에 열 개도
   * 들어오는데, 그때마다 화면이 물들면 색이 겹쳐 무엇이 얹혔는지가 오히려 안 보인다.
   * 소리는 `SoundLimiter`가 개수를 끊어주지만 색에는 그럴 자리가 없고, 애초에 색으로
   * 말하려는 것은 "이번에 무엇이 얹혔나"다.
   *
   * 여럿이 같은 프레임에 처음 닿으면 **가장 세게 부딪힌 것**이 남는다. 마지막 것을
   * 쓰면 순서가 물리 순회에 달려 있어, 같은 시드로 다시 돌려도 색이 달라진다.
   */
  note(impacts: readonly LandingImpact[]): void {
    let picked: LandingImpact | null = null
    for (const hit of impacts) {
      if (!hit.first || !glows(hit.variant.id)) {
        continue
      }
      if (picked === null || hit.impact > picked.impact) {
        picked = hit
      }
    }
    if (picked === null) {
      return
    }
    this.color = picked.variant.color
    this.strength = Math.min(picked.impact / IMPACT_FULL_SCALE, 1)
    this.elapsed = 0
    this.active = true
  }

  /** 시간을 흘린다. 다 사라지면 스스로 비운다 */
  advance(dt: number): void {
    if (!this.active) {
      return
    }
    this.elapsed += dt
    if (this.elapsed >= LANDING_GLOW_SEC) {
      this.active = false
    }
  }

  /** 판을 다시 시작할 때. 앞 판의 색이 남아 있으면 안 된다 */
  reset(): void {
    this.active = false
    this.elapsed = 0
  }

  get view(): LandingGlowView | null {
    if (!this.active) {
      return null
    }
    return {
      color: this.color,
      strength: this.strength,
      progress: this.elapsed / LANDING_GLOW_SEC,
    }
  }
}

export { LandingGlow, LANDING_GLOW_SEC }
export type { LandingGlowView, LandingImpact }
