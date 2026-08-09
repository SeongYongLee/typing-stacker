import { AIM_HALF_RANGE, ARENA, LEDGE } from '../config.ts'
import type { Rng } from './Rng.ts'

/**
 * 합성하면 공중에 작은 통나무가 하나 놓인다.
 *
 * 이 게임에서 판을 끝내는 것은 점수가 아니라 얹을 자리가 좁아지는 것이므로, 자리를
 * 하나 더 주는 것이 이 게임의 말로 된 보상이다. 합성이 이미 "재료 둘이 차지하던 폭을
 * 하나로 줄여준다"로 보상하고 있으니 같은 축을 한 번 더 밀어주는 셈이다.
 *
 * **운으로 만난 히든에는 주지 않는다.** 아무것도 하지 않아도 나오는 것에 같은 것을
 * 주면 판을 여는 자리가 실력이 아니라 운으로 갈린다 — 이유는 `GameEngine.growLedge`에.
 *
 * ## 조준 범위 안에만 놓는다
 *
 * 화살표가 닿지 못하는 곳(±`AIM_HALF_RANGE`)에 놓으면 거기에 떨굴 수가 없어 **밀려난
 * 물건을 받는 그물**로만 쓰인다. 그것도 목숨은 지켜주지만 "게임을 이어나간다"가
 * 손으로 하는 일이 아니라 운이 된다. 통나무 전체가 조준 안에 들어와야 온전히 얹힌다.
 *
 * ## 빈 자리를 물리로 확인한다
 *
 * 물건이 있는 자리에 놓으면 통나무가 탑 속에 박혀 물건을 밀어낸다. 스폰 높이가 같은
 * 함정을 이미 겪었다(`ARENA.spawnY` 주석). 그래서 후보 자리를 훑어 **비어 있는 곳만**
 * 고르고, 다 차 있으면 이번에는 놓지 않는다 — 억지로 끼워 넣느니 거르는 편이 낫다.
 *
 * DOM도 물리도 모른다. 자리만 정하고, 실제로 세우는 것은 `PhysicsWorld`의 일이다.
 */

/** 자리를 차지하고 있는 것. 물건이든 이미 놓인 통나무든 */
interface Occupied {
  readonly x: number
  readonly y: number
  readonly hw: number
  readonly hh: number
}

/**
 * 통나무 **중심**이 갈 수 있는 x의 한계.
 *
 * 통나무 전체를 조준 안에 넣으려다(`AIM_HALF_RANGE - halfWidth` = 1.5) 실수를 했다.
 * 그러면 통나무가 전부 받침대(±1.85) **위 공중**에만 생겨서, 새 자리를 준 것이 아니라
 * 있던 자리 위에 선반을 하나 얹은 것이 된다.
 *
 * 중심만 닿으면 거기에 떨굴 수 있다. 그러면 통나무가 받침대 밖으로 뻗어나가
 * **판이 옆으로 넓어진다** — 원래 노린 것이 그쪽이다.
 */
const REACH = AIM_HALF_RANGE

/**
 * 후보 자리. 좌우 끝까지 고르게 훑는다.
 *
 * 난수로 x를 뽑지 않고 정해둔 자리를 섞어 쓰는 이유는, 난수 좌표를 그대로 쓰면
 * 탑 바로 옆 몇 cm에 놓이는 일이 생기기 때문이다 — 그건 새 자리가 아니라 탑의 일부다.
 */
const SLOTS = 11

/**
 * **받침대 밖을 먼저 고른다.**
 *
 * 받침대 위 공중에 놓이면 이미 쌓을 수 있던 자리를 한 겹 덮는 것뿐이다. 밖으로
 * 나가야 없던 자리가 생기고, 옆으로 흘러내리던 물건도 거기서 걸린다.
 *
 * 그렇다고 밖으로만 두지는 않는다 — 밖이 다 차 있으면 안쪽에라도 놓는다.
 * 보상을 거르는 것보다는 덜 좋은 자리라도 주는 편이 낫다.
 */
function candidates(): { outer: number[]; inner: number[]; step: number } {
  const step = (REACH * 2) / (SLOTS - 1)
  const all = Array.from({ length: SLOTS }, (_, i) => -REACH + step * i)
  return {
    outer: all.filter((x) => Math.abs(x) > ARENA.platformHalfWidth),
    inner: all.filter((x) => Math.abs(x) <= ARENA.platformHalfWidth),
    step,
  }
}

/** 같은 시드면 같은 순서. 난수를 쓰는 곳은 여기 하나뿐이다 */
function shuffled(list: number[], rng: Rng): number[] {
  const order = [...list]
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1))
    ;[order[i], order[j]] = [order[j]!, order[i]!]
  }
  return order
}

/** 두 상자가 서로 겹치는가. 여유를 두어 붙어 있는 것도 겹친 것으로 본다 */
function overlaps(a: Occupied, b: Occupied): boolean {
  return (
    Math.abs(a.x - b.x) < a.hw + b.hw + LEDGE.margin &&
    Math.abs(a.y - b.y) < a.hh + b.hh + LEDGE.margin
  )
}

/**
 * 통나무를 놓을 자리. 놓을 곳이 없으면 `null`.
 *
 * 높이는 **지금 쌓인 것들의 평균**이다. 꼭대기에 두면 탑을 한 칸 더 올려주는 것과
 * 다를 바 없고, 바닥에 두면 받침대와 겹쳐 아무것도 아니다. 중간에 두어야 옆으로
 * 새 기둥이 서고 판이 넓어진다.
 *
 * 다만 받침대에 너무 붙으면 그 아래로 물건이 못 들어가 오히려 자리를 빼앗는다.
 * `minClearance`만큼은 띄운다.
 */
function placeLedge(
  items: readonly Occupied[],
  ledges: readonly Occupied[],
  stackTop: number,
  rng: Rng,
): { x: number; y: number; halfWidth: number } | null {
  if (ledges.length >= LEDGE.maxCount) {
    return null
  }

  const floor = ARENA.platformTop + LEDGE.minClearance
  /*
   * **쌓아 올린 것보다 위로는 가지 않는다.**
   *
   * 평균을 내는 물건 목록에는 아직 **떨어지는 중인 것**도 들어 있다. 판 앞머리에는
   * 공중의 물건 하나뿐일 때가 있어서, 그때 평균이 곧 스폰 높이(4.6)가 되고 통나무가
   * 화살표 자리에 섰다 — 조준선을 가로막는 데다 아무것도 없는 허공에 떠 있었다.
   *
   * 쌓인 것의 꼭대기를 천장으로 두면 그 일이 구조적으로 막힌다. 아직 아무것도 못
   * 쌓았으면 바닥값이 곧 천장이라 늘 같은 낮은 자리에 선다.
   */
  const ceiling = Math.max(floor, stackTop)
  const tops = items.map((item) => item.y + item.hh)
  const average =
    tops.length === 0 ? ARENA.platformTop : tops.reduce((sum, y) => sum + y, 0) / tops.length
  const base = Math.min(Math.max(average, floor), ceiling)

  /*
   * 높이를 하나만 보면 판 중반부터 자리를 못 찾는다.
   *
   * 실측으로 합성 35회 중 29회만 통나무가 섰고, 못 선 여섯은 전부 **두 번째 이후
   * 합성**이었다. 탑이 자라면 평균 높이가 곧 탑의 허리인데, 그 높이에서는 통나무를
   * 밖에 세워도 안쪽 끝이 탑에 닿는다 — 통나무가 최대 1.9m라 ±2.1에 세워도 안쪽이
   * 1.15까지 들어온다.
   *
   * 그래서 몇 뼘 위아래도 함께 본다. 겹침 규칙을 느슨하게 푸는 것이 아니라 **빈 층을
   * 찾는 것**이다 — 규칙을 풀면 통나무가 탑에 박히고, 그건 보상이 아니라 사고다.
   */
  const step = 0.5
  const heights = [base, base + step, base - step, ceiling, floor]
    .map((h) => Math.min(Math.max(h, floor), ceiling))
    .filter((h, index, list) => list.indexOf(h) === index)

  // 길이는 판마다 다르다. 같은 것만 서면 "같은 것이 세 번"이지 새 자리로 안 읽힌다
  const halfWidth =
    LEDGE.minHalfWidth + (LEDGE.maxHalfWidth - LEDGE.minHalfWidth) * rng.next()

  const taken = [...items, ...ledges]
  const { outer, inner, step: slotStep } = candidates()
  // 받침대 밖을 먼저, 거기가 다 차 있으면 안쪽을
  const order = [...shuffled(outer, rng), ...shuffled(inner, rng)]

  for (const y of heights) {
    for (const slot of order) {
      // 칸에 딱 맞춰 서면 자리가 늘 같아 보인다. 칸 안에서 조금 흔든다
      const jittered = slot + (rng.next() - 0.5) * slotStep * 0.7
      const x = Math.max(-REACH, Math.min(REACH, jittered))
      const spot: Occupied = { x, y, hw: halfWidth, hh: LEDGE.halfHeight }
      if (!taken.some((other) => overlaps(spot, other))) {
        return { x, y, halfWidth }
      }
    }
  }
  return null
}

export { placeLedge, REACH }
export type { Occupied }
