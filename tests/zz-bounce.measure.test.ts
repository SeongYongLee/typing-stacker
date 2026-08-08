import { beforeAll, describe, expect, it } from 'vitest'
import { ARENA, SOLO_OWNER } from '../src/game/config.ts'
import { BOUNCE, bounceOf } from '../src/game/data/materials.ts'
import { ALL_VARIANTS, WORDS } from '../src/game/data/words.ts'
import { PhysicsWorld } from '../src/game/physics/PhysicsWorld.ts'
import { createRng } from '../src/game/systems/Rng.ts'
import type { Material } from '../src/game/types/game.ts'

/**
 * 튐(restitution)과 그 대가를 잰다.
 *
 * 튐은 손끝에서 물건을 가르는 가장 강한 신호인데, 벽이 없는 받침대에서는 **튀면 곧
 * 이탈**이라 공짜가 아니다. 그래서 값을 넣는 것과 그 값이 판을 얼마나 짧게 만드는지를
 * 한자리에서 본다.
 *
 * 중앙 조준 봇은 받침대 가운데에만 계속 떨군다. 조준 실수를 지운 상태에서 재는 것이라
 * 여기 나오는 숫자는 **쌓기 자체의 난이도**다. CLAUDE.md의 밸런스 기록이 이 값이다.
 */

let world: PhysicsWorld

beforeAll(async () => {
  world = await PhysicsWorld.create()
})

const LIVES = 3
const MAX_DROPS = 60
/** 한 물건이 자리를 잡기까지 기다리는 시간(초) */
const SETTLE_SEC = 2.2

function runOne(seed: number): { drops: number; stacked: number; height: number } {
  const rng = createRng(seed)
  const pool = WORDS.flatMap((entry) => entry.variants).filter((item) => !item.hidden)
  world.reset()
  let lost = 0
  let drops = 0
  let height = 0
  while (lost < LIVES && drops < MAX_DROPS) {
    world.spawnItem(rng.pick(pool), 0, SOLO_OWNER)
    drops += 1
    for (let t = 0; t < SETTLE_SEC; t += 1 / 60) {
      lost += world.step(1 / 60).escaped.length
      if (lost >= LIVES) {
        break
      }
    }
    /*
     * 높이는 `stackTop()`으로 잰다 — 자리를 잡은 물건만 본다.
     * 물건 좌표를 그대로 훑으면 **튀어올라 공중에 있는 것**이 최고 높이로 잡혀서,
     * 튐을 올렸을 때 쌓기가 좋아진 것처럼 보인다(실제로 1.75 → 2.74m로 그렇게 나왔다).
     */
    height = Math.max(height, world.stackTop() - ARENA.platformTop)
  }
  return { drops, stacked: world.frames().length, height }
}

describe('튐', () => {
  /**
   * 재질마다 값이 갈려 있는지. 예전에는 107종 중 93종이 기본값 0.02로 **완전히
   * 같았다** — 축이 있는데 쓰지 않고 있던 것이다.
   */
  it('재질마다 튐이 갈려 있다', () => {
    const values = new Set(Object.values(BOUNCE))
    expect(values.size, `서로 다른 값: ${[...values].sort((a, b) => a - b).join(', ')}`).toBeGreaterThanOrEqual(7)
  })

  it('모든 물건이 재질에서 튐을 받거나 직접 적어 갖는다', () => {
    const flat = [...ALL_VARIANTS].filter(
      (item) => item.restitution === bounceOf(item.material),
    )
    // 재질 기본값을 그대로 쓰는 물건이 대부분이어야 한다 — 그것이 무리로 정한다는 뜻이다
    expect(flat.length).toBeGreaterThan(ALL_VARIANTS.length / 2)
    for (const item of ALL_VARIANTS) {
      expect(item.restitution, item.id).toBeGreaterThanOrEqual(0)
      // 벽이 없는 받침대다. 이보다 튀면 얹히지 않고 굴러 나간다
      expect(item.restitution, item.id).toBeLessThanOrEqual(0.45)
    }
  })

  /**
   * 튐이 판을 얼마나 짧게 만드는지.
   *
   * 재본 값(24판 평균): 튐 없이 17.2드롭 / 15.5개 / 2.20m → 튐 넣고 16.8 / 15.0 / 2.15m.
   * 대가가 3% 안쪽이라 받아들였다. 이 검사는 앞으로 누군가 튐이나 중력을 크게
   * 건드렸을 때 판이 짧아지는 것을 잡는다 — 실기로 알아채려면 몇 판을 해봐야 한다.
   */
  /*
   * 12판을 돌리므로 기본 5초 안에 못 끝난다. CI의 러너는 손보다 느려서 여기서 걸렸다 —
   * 재는 테스트는 시간이 걸리는 것이 정상이고, 짧게 잡으면 값이 아니라 기계 속도를 재게 된다.
   */
  it('중앙 조준 봇이 충분히 버틴다', { timeout: 60_000 }, () => {
    const seeds = [1, 38, 75, 112, 149, 186, 223, 260, 297, 334, 371, 408]
    const runs = seeds.map(runOne)
    const mean = (pick: (run: (typeof runs)[number]) => number) =>
      runs.reduce((sum, run) => sum + pick(run), 0) / runs.length
    const report =
      `버틴 드롭 ${mean((r) => r.drops).toFixed(1)} · ` +
      `남은 물건 ${mean((r) => r.stacked).toFixed(1)} · ` +
      `최고 높이 ${mean((r) => r.height).toFixed(2)}m`
    expect(mean((r) => r.drops), report).toBeGreaterThan(12)
    expect(mean((r) => r.height), report).toBeGreaterThan(1.2)
  })
})

/** 재질 이름을 타입으로 묶어두려는 것 — BOUNCE에 빠진 재질이 있으면 여기서 걸린다 */
const _exhaustive: Record<Material, number> = BOUNCE
void _exhaustive
