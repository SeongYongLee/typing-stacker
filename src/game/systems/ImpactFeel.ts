import { IMPACT_FULL_SCALE, QUAKE_IMPACT_SCALE } from '../config.ts'
import type { ImpactEvent } from '../physics/PhysicsWorld.ts'
import type { GameEvent } from '../types/events.ts'
import type { TrailHit } from './TrailField.ts'

/**
 * 부딪힘 하나를 **눈에 보이는 것과 귀에 들리는 것**으로 바꾼다.
 *
 * 혼자 하기와 대전이 같은 규칙을 각자 적고 있었다 — 세기를 `IMPACT_FULL_SCALE`로
 * 나누고, 크기를 `artBounds`의 큰 변에서 뽑고, 재질·개체값을 그대로 넘기는 스무 줄이
 * 두 벌이었다. 물건에 새 속성이 붙거나 세기를 다시 재면 **두 곳을 함께 고쳐야 하고,
 * 한쪽만 고치면 같은 물건이 판마다 다르게 들린다.**
 *
 * 물리 결과를 받아 값만 계산한다 — DOM도 Rapier도 모른다.
 */

/** 부스러기가 튈 자리와 세기. 화면이 이것만 보고 뿌린다 */
function trailHitOf(hit: ImpactEvent): TrailHit {
  return {
    handle: hit.handle,
    id: hit.variant.id,
    color: hit.variant.color,
    x: hit.x,
    y: hit.y,
    strength: strengthOf(hit),
  }
}

/**
 * 소리로 바뀔 사건.
 *
 * 실제 질량은 박스 반응음의 사뿐·풀썩·척·쿵을 가르고, 그림의 **큰 변**은 몸통
 * 음높이를 정한다 — 큰 것이 낮게 울린다. 재질과 개체값(`tone`·`grain`)은 손대지 않고
 * 그대로 넘긴다.
 */
function impactEventOf(hit: ImpactEvent): GameEvent {
  return {
    kind: 'impact',
    strength: strengthOf(hit),
    mass: hit.mass,
    size: Math.max(hit.variant.artBounds.hw, hit.variant.artBounds.hh) * 2,
    material: hit.variant.material,
    tone: hit.variant.tone,
    grain: hit.variant.grain,
  }
}

/** 지진. 세기가 0이면 아무 일도 없었던 것이라 null이다 */
function quakeEventOf(quake: number): GameEvent | null {
  if (quake <= 0) {
    return null
  }
  return { kind: 'quake', strength: Math.min(quake / QUAKE_IMPACT_SCALE, 1) }
}

/** 0~1로 눌러 담은 부딪힌 세기. 부스러기와 소리가 **같은 값**을 써야 둘이 어긋나지 않는다 */
function strengthOf(hit: ImpactEvent): number {
  return Math.min(hit.impact / IMPACT_FULL_SCALE, 1)
}

export { trailHitOf, impactEventOf, quakeEventOf, strengthOf }
