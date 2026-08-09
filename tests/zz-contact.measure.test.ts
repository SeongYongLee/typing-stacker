import { beforeAll, describe, expect, it } from 'vitest'
import { AIM_HALF_RANGE, HIDDEN_CHANCE, SOLO_OWNER } from '../src/game/config.ts'
import { RECIPES } from '../src/game/data/recipes.ts'
import { WORDS } from '../src/game/data/words.ts'
import { PhysicsWorld } from '../src/game/physics/PhysicsWorld.ts'
import { resolveItem } from '../src/game/systems/ItemResolver.ts'
import { findMerge } from '../src/game/systems/Merger.ts'
import { createRng, type Rng } from '../src/game/systems/Rng.ts'
import type { ItemVariant } from '../src/game/types/game.ts'

/**
 * 합성이 막히는 두 관문을 **갈라서** 잰다.
 *
 * | 관문 | 무엇을 보나 |
 * |---|---|
 * | 갖춤 | 어떤 레시피의 재료가 **받침대에 살아 있는 채** 다 모였는가 |
 * | 접촉 | 모인 재료가 **서로 닿아** 실제로 합쳐졌는가 |
 *
 * 둘의 차가 곧 **닿지 않아 놓친 것**이다. 판당 합성 횟수 하나만 보면 어느 쪽이 막고
 * 있는지 알 수 없어서, 한쪽을 고쳐도 다른 쪽이 곧바로 막는다.
 *
 * ## 봇을 둘 돌린다
 *
 * 예전 측정은 **중앙 조준** 하나뿐이었고 "갖춰져도 열에 일곱은 안 닿는다"가 그 값이다.
 * 그때는 그것이 곧 사람의 값이기도 했다 — 무엇이 재료인지 화면이 알려주지 않았으니
 * 사람도 중앙만 보고 떨구는 봇과 다를 게 없었다.
 *
 * **짝 표식(`systems/PairMarks.ts`)이 들어오며 전제가 바뀌었다.** 이제 무엇과 무엇이
 * 붙는지 보이므로 "저 옆에 떨구자"고 겨냥할 수 있다. 그래서 짝 옆을 노리는 봇을
 * 함께 돌린다 — **두 값의 차가 곧 표식이 만들어낸 실력 공간의 크기**다.
 *
 * ## 엔진이 아니라 물리를 직접 돌린다
 *
 * 목숨·판 종료·국면을 흉내내지 않으므로 **절대값은 엔진 쪽(`zz-balance`)을 믿을 것.**
 * 여기서 보려는 것은 두 관문의 **비율**이다.
 */

let world: PhysicsWorld

beforeAll(async () => {
  world = await PhysicsWorld.create()
})

/** 봇 하나가 도는 판 수 */
const RUNS = 40
/** 한 판에 떨구는 횟수. 엔진 실측의 판당 드롭과 맞춘다 */
const DROPS = 18
/** 한 물건이 자리를 잡기까지 기다리는 시간(초) */
const SETTLE_SEC = 2.2

/** 이 레시피에 필요한 재료와 개수 */
function needed(recipe: (typeof RECIPES)[number]): Map<string, number> {
  const need = new Map<string, number>()
  for (const id of recipe.inputs) {
    need.set(id, (need.get(id) ?? 0) + 1)
  }
  return need
}

/** 지금 받침대에 살아 있는 것만으로 만들 수 있는 레시피들 */
function satisfiedNow(counts: ReadonlyMap<string, number>): string[] {
  const ready: string[] = []
  for (const recipe of RECIPES) {
    let ok = true
    for (const [id, need] of needed(recipe)) {
      if ((counts.get(id) ?? 0) < need) {
        ok = false
        break
      }
    }
    if (ok) {
      ready.push(recipe.id)
    }
  }
  return ready
}

/** 이 물건과 **같은 레시피에 함께 들어가는** 것들 */
const PARTNERS: ReadonlyMap<string, ReadonlySet<string>> = (() => {
  const map = new Map<string, Set<string>>()
  for (const recipe of RECIPES) {
    for (const id of recipe.inputs) {
      const set = map.get(id) ?? new Set<string>()
      for (const other of recipe.inputs) {
        set.add(other)
      }
      map.set(id, set)
    }
  }
  return map
})()

type Aim = (variant: ItemVariant, rng: Rng) => number

/** 받침대 가운데만 본다. 짝이 어디 있는지 모르는 사람의 값이다 */
const centerAim: Aim = () => 0

/**
 * 짝이 받침대에 있으면 그 옆을 노린다.
 *
 * **위가 아니라 옆이다.** 위에 그대로 떨구면 얹혀서 닿기는 하지만 미끄러져 내려가는
 * 일이 잦고, 무엇보다 사람이 실제로 겨냥하는 것은 "저것 옆에 붙이기"다.
 */
function pairAim(bodies: readonly { variantId: string; x: number }[]): Aim {
  return (variant, rng) => {
    const partners = PARTNERS.get(variant.id)
    if (partners === undefined) {
      return 0
    }
    const targets = bodies.filter((body) => partners.has(body.variantId))
    const target = targets[Math.floor(rng.next() * targets.length)]
    if (target === undefined) {
      return 0
    }
    const side = rng.next() < 0.5 ? -1 : 1
    const x = target.x + side * (variant.artBounds.hw + 0.02)
    return Math.max(-AIM_HALF_RANGE, Math.min(AIM_HALF_RANGE, x))
  }
}

interface RunResult {
  /** 이 판에서 재료가 다 모인 적 있는 레시피 수 */
  readonly gathered: number
  /** 그중 실제로 합쳐진 횟수 */
  readonly merged: number
  /** 재료 둘짜리만 따로. 셋 이상과 자릿수가 다르므로 섞으면 둘 다 안 보인다 */
  readonly gatheredPair: number
  readonly mergedPair: number
  /** 이탈한 물건. 짝 옆을 노리면 늘어난다 */
  readonly escaped: number
}

/** 재료 수. 둘짜리와 셋 이상을 갈라 보는 데 쓴다 */
const INPUTS_OF: ReadonlyMap<string, number> = new Map(
  RECIPES.map((recipe) => [recipe.id, recipe.inputs.length]),
)

function runOne(seed: number, aimFor: (bodies: readonly { variantId: string; x: number }[]) => Aim): RunResult {
  const rng = createRng(seed)
  world.reset()
  const everGathered = new Set<string>()
  let merged = 0
  let mergedPair = 0
  let escaped = 0

  const sweep = (): void => {
    for (const id of satisfiedNow(world.countsByVariant())) {
      everGathered.add(id)
    }
    const match = findMerge(world.contactGraph(), RECIPES)
    if (match !== null) {
      // 실제로 합쳐야 판이 이어진다 — 재료가 남아 있으면 같은 짝을 계속 세게 된다
      if (world.mergeItems(match.itemIds, match.recipe.result, SOLO_OWNER) !== null) {
        merged += 1
        if (match.recipe.inputs.length === 2) {
          mergedPair += 1
        }
      }
    }
  }

  for (let drop = 0; drop < DROPS; drop += 1) {
    const entry = rng.pick(WORDS)
    const variant = resolveItem(entry.word, rng, HIDDEN_CHANCE)
    world.spawnItem(variant, aimFor(world.frames())(variant, rng), SOLO_OWNER)
    for (let t = 0; t < SETTLE_SEC; t += 1 / 60) {
      escaped += world.step(1 / 60).escaped.length
      sweep()
    }
  }
  return {
    gathered: everGathered.size,
    merged,
    gatheredPair: [...everGathered].filter((id) => INPUTS_OF.get(id) === 2).length,
    mergedPair,
    escaped,
  }
}

describe('합성이 막히는 두 관문', () => {
  it('갖춤과 접촉을 갈라 잰다', { timeout: 600_000 }, () => {
    const bots: [string, (bodies: readonly { variantId: string; x: number }[]) => Aim][] = [
      ['중앙 조준 (표식이 없던 때)', () => centerAim],
      ['짝 옆 조준 (표식을 보는 사람)', pairAim],
    ]

    const lines: string[] = []
    const summary = new Map<string, RunResult[]>()
    for (const [label, aimFor] of bots) {
      const runs: RunResult[] = []
      for (let i = 0; i < RUNS; i += 1) {
        runs.push(runOne(20260809 + i * 7919, aimFor))
      }
      summary.set(label, runs)

      const mean = (pick: (run: RunResult) => number): number =>
        runs.reduce((sum, run) => sum + pick(run), 0) / runs.length
      const none = (pick: (run: RunResult) => number): number =>
        runs.filter((run) => pick(run) === 0).length / runs.length
      const gathered = mean((r) => r.gathered)
      const mergedMean = mean((r) => r.merged)
      const gatheredPair = mean((r) => r.gatheredPair)
      const mergedPairMean = mean((r) => r.mergedPair)
      const rate = (top: number, bottom: number): string =>
        bottom === 0 ? '—' : `${Math.round((top / bottom) * 100)}%`
      lines.push(
        `  ${label}\n` +
          `    | 갖춤 (전체) | 판당 ${gathered.toFixed(2)}건 · 한 번도 못 갖춘 판 ${Math.round(none((r) => r.gathered) * 100)}% |\n` +
          `    | 합쳐짐 (전체) | 판당 ${mergedMean.toFixed(2)}건 · 한 번도 못 한 판 ${Math.round(none((r) => r.merged) * 100)}% |\n` +
          `    | **닿아서 합쳐진 비율** | **${rate(mergedMean, gathered)}** |\n` +
          `    | 재료 둘짜리 — 갖춤 / 합쳐짐 | ${gatheredPair.toFixed(2)} / ${mergedPairMean.toFixed(2)} → ${rate(mergedPairMean, gatheredPair)} |\n` +
          `    | 재료 셋 이상 — 갖춤 / 합쳐짐 | ${(gathered - gatheredPair).toFixed(2)} / ${(mergedMean - mergedPairMean).toFixed(2)} |\n` +
          `    | 이탈 | 판당 ${mean((r) => r.escaped).toFixed(1)}개 |`,
      )
    }

    console.log(
      `\n[접촉 실측] 봇마다 ${RUNS}판 · 판당 ${DROPS}드롭 · 레시피 ${RECIPES.length}개\n` +
        lines.join('\n'),
    )

    /*
     * 값을 못 박지 않는다. 아트와 레시피가 올 때마다 움직이는 숫자라 문턱을 두면
     * 이 검사가 그것들을 막는 자리가 된다. 지키는 것은 "봇이 실제로 판을 돌렸는가"까지다.
     */
    for (const [label, runs] of summary) {
      const gathered = runs.reduce((sum, run) => sum + run.gathered, 0)
      expect(gathered, `${label}: 재료가 한 번도 안 갖춰졌다`).toBeGreaterThan(0)
    }
  })
})
