import type { Recipe } from '../data/recipes.ts'

interface TouchNode {
  readonly itemId: number
  readonly variantId: string
}

/** 지금 아레나에서 무엇이 무엇에 닿아 있는지 */
interface ContactGraph {
  readonly nodes: readonly TouchNode[]
  /** 서로 직접 닿은 물건 쌍 */
  readonly edges: readonly (readonly [number, number])[]
}

interface MergeMatch {
  readonly recipe: Recipe
  /** 사라질 재료들. 항상 오름차순이라 결과가 재현된다 */
  readonly itemIds: readonly number[]
}

/**
 * 재료가 **서로 붙어 있는 한 덩어리**여야 한다.
 *
 * 탑이 높아지면 쌓인 것 전체가 접촉으로 이어져 하나의 덩어리가 된다. 그래서
 * "같은 덩어리에 있으면 합쳐진다"로 두면 맨 아래 클로버와 맨 위 클로버가
 * 난데없이 합쳐진다 — 플레이어 눈에는 아무 관계 없어 보이는 두 개다.
 * 재료들끼리만 이어져 있을 것을 요구하면 합쳐지는 것은 반드시 눈에 붙어 있다.
 */
const MAX_SEARCH_NODES = 400

function sortedKey(ids: readonly string[]): string {
  return [...ids].sort().join('|')
}

function buildAdjacency(graph: ContactGraph): Map<number, Set<number>> {
  const adjacency = new Map<number, Set<number>>()
  for (const node of graph.nodes) {
    adjacency.set(node.itemId, new Set())
  }
  for (const [a, b] of graph.edges) {
    adjacency.get(a)?.add(b)
    adjacency.get(b)?.add(a)
  }
  return adjacency
}

/**
 * 크기가 `size`인 **이어진** 부분집합을 전부 훑는다.
 *
 * 같은 집합을 여러 번 보지 않도록 "시작점보다 큰 id만 넣는다"는 규칙을 둔다.
 * 재료 수가 둘셋이고 아레나에 있는 물건도 스무 개 남짓이라 이 정도면 충분하다.
 */
function forEachConnectedSubset(
  nodeIds: readonly number[],
  adjacency: ReadonlyMap<number, Set<number>>,
  size: number,
  visit: (subset: readonly number[]) => boolean,
): void {
  const ordered = [...nodeIds].sort((a, b) => a - b)

  const grow = (subset: number[], frontier: Set<number>, minId: number): boolean => {
    if (subset.length === size) {
      return visit(subset)
    }
    for (const candidate of [...frontier].sort((a, b) => a - b)) {
      if (candidate < minId) {
        continue
      }
      const nextFrontier = new Set(frontier)
      nextFrontier.delete(candidate)
      for (const neighbour of adjacency.get(candidate) ?? []) {
        if (!subset.includes(neighbour)) {
          nextFrontier.add(neighbour)
        }
      }
      subset.push(candidate)
      const stop = grow(subset, nextFrontier, minId)
      subset.pop()
      if (stop) {
        return true
      }
    }
    return false
  }

  for (const start of ordered) {
    const frontier = new Set(adjacency.get(start) ?? [])
    if (grow([start], frontier, start)) {
      return
    }
  }
}

/**
 * 지금 합쳐질 수 있는 것 하나를 찾는다.
 *
 * 한 번에 하나만 돌려주는 이유는 재료가 겹칠 수 있어서다 — 클로버 셋이 붙어 있으면
 * 어느 둘을 쓸지 정해야 하고, 하나를 합친 뒤 남은 것으로 다시 판단하는 편이
 * 규칙이 단순하고 화면에서도 한 번에 하나씩 터지는 것으로 보인다.
 *
 * 물리도 화면도 모르는 순수 함수다. 같은 그래프면 언제나 같은 답을 준다.
 */
function findMerge(graph: ContactGraph, recipes: readonly Recipe[]): MergeMatch | null {
  if (graph.nodes.length < 2 || graph.nodes.length > MAX_SEARCH_NODES) {
    return null
  }

  const variantOf = new Map(graph.nodes.map((node) => [node.itemId, node.variantId]))
  const adjacency = buildAdjacency(graph)
  const nodeIds = graph.nodes.map((node) => node.itemId)

  // 재료가 적은 레시피부터 본다. 클로버 둘이 이미 조건을 만족하는데
  // 셋짜리 레시피를 기다리게 만들면 플레이어는 합성이 고장난 줄 안다
  const ordered = [...recipes].sort((a, b) => a.inputs.length - b.inputs.length)

  for (const candidate of ordered) {
    const want = sortedKey(candidate.inputs)
    let found: MergeMatch | null = null

    forEachConnectedSubset(nodeIds, adjacency, candidate.inputs.length, (subset) => {
      const have = sortedKey(subset.map((id) => variantOf.get(id) ?? ''))
      if (have !== want) {
        return false
      }
      found = { recipe: candidate, itemIds: [...subset].sort((a, b) => a - b) }
      return true
    })

    if (found !== null) {
      return found
    }
  }
  return null
}

export { findMerge }
export type { ContactGraph, MergeMatch, TouchNode }
