import { describe, expect, it } from 'vitest'
import { PhysicsWorld } from '../src/game/physics/PhysicsWorld.ts'
import { RECIPES } from '../src/game/data/recipes.ts'
import { findMerge } from '../src/game/systems/Merger.ts'
import { shapeBounds } from '../src/game/shapes.ts'
import { ARENA, SOLO_OWNER } from '../src/game/config.ts'
import { WORDS } from '../src/game/data/words.ts'
import type { ItemVariant, ShapeDef } from '../src/game/types/game.ts'

const VARIANTS = WORDS.flatMap((entry) => entry.variants)

function pieceCount(shape: ShapeDef): number {
  return shape.kind === 'compound' ? shape.parts.length : 1
}

function boxed(variant: ItemVariant): ItemVariant {
  const { hw, hh } = shapeBounds(variant.shape)
  return { ...variant, shape: { kind: 'box', hw, hh } }
}

/** 조각 수를 앞에서 n개로 자른 사본. 비용만 재려는 것이라 실루엣은 상관없다 */
function capped(variant: ItemVariant, n: number): ItemVariant {
  if (variant.shape.kind !== 'compound') return variant
  return { ...variant, shape: { kind: 'compound', parts: variant.shape.parts.slice(0, n) } }
}

async function buildStack(
  make: (variant: ItemVariant) => ItemVariant,
  count: number,
): Promise<PhysicsWorld> {
  const world = await PhysicsWorld.create()
  // 받침대 위에 낮게 넓게 깔아 실제로 남아 있게 한다 — 높이 쌓으면 굴러떨어져 수가 줄어든다
  const perRow = 5
  for (let i = 0; i < count; i += 1) {
    const variant = make(VARIANTS[(i * 7) % VARIANTS.length]!)
    const col = i % perRow
    const row = Math.floor(i / perRow)
    world.spawnItemAt(
      variant,
      -1.4 + col * 0.7,
      ARENA.platformTop + 0.35 + row * 0.7,
      SOLO_OWNER,
    )
    for (let f = 0; f < 40; f += 1) world.step(1 / 60)
  }
  for (let f = 0; f < 120; f += 1) world.step(1 / 60)
  return world
}

function bench(label: string, iterations: number, run: () => void): number {
  run()
  const start = performance.now()
  for (let i = 0; i < iterations; i += 1) run()
  const per = (performance.now() - start) / iterations
  console.log(`${label}: ${per.toFixed(3)} ms/회`)
  return per
}

describe('성능 측정', () => {
  it('조각 수 통계', () => {
    const counts = VARIANTS.map((v) => pieceCount(v.shape))
    const total = counts.reduce((s, c) => s + c, 0)
    console.log(
      `물건 ${VARIANTS.length}종 · 콜라이더 합 ${total} · 평균 ${(total / counts.length).toFixed(1)} · 최대 ${Math.max(...counts)}`,
    )
    expect(total).toBeGreaterThan(0)
  })

  it('조각 수에 따른 프레임 비용', async () => {
    const N = 15
    const cases: [string, (v: ItemVariant) => ItemVariant][] = [
      ['조각 그대로(평균 12)', (v) => v],
      ['8조각 상한', (v) => capped(v, 8)],
      ['4조각 상한', (v) => capped(v, 4)],
      ['박스 하나', boxed],
    ]

    for (const [label, make] of cases) {
      const world = await buildStack(make, N)
      const graph = world.contactGraph()
      console.log(`\n[${label}] 남은 물건 ${world.itemCount} · 간선 ${graph.edges.length}`)
      bench('  physics.step', 200, () => world.step(1 / 60))
      bench('  contactGraph', 200, () => world.contactGraph())
      bench('  findMerge(graph)', 200, () => findMerge(graph, RECIPES))
      bench('  stackTop', 200, () => world.stackTop())
      bench('  snapshots', 200, () => world.snapshots())
      world.dispose()
    }
    expect(true).toBe(true)
  }, 300_000)

  it('halfExtentY: 매번 계산 vs 캐시', () => {
    const sample = VARIANTS.filter((v) => pieceCount(v.shape) >= 10).slice(0, 12)
    const raw = bench('shapeBounds 매번', 20000, () => {
      let top = 0
      for (const v of sample) top = Math.max(top, shapeBounds(v.shape).hh)
      return top
    })
    const cache = new Map(sample.map((v) => [v.id, shapeBounds(v.shape).hh]))
    const cached = bench('캐시 조회', 20000, () => {
      let top = 0
      for (const v of sample) top = Math.max(top, cache.get(v.id) ?? 0)
      return top
    })
    console.log(`배수: ${(raw / cached).toFixed(0)}배`)
    expect(cached).toBeLessThan(raw)
  })
})
