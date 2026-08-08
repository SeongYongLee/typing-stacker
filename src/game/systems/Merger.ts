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

/*
 * 레시피에서 나오는 값들은 레시피가 바뀌지 않는 한 그대로다. 프레임마다 다시 만들지 않는다 —
 * 이 함수가 매 프레임 불리므로 정렬과 문자열 이어붙이기가 그대로 프레임 비용이 된다.
 */
const wantKeys = new WeakMap<Recipe, string>()
const needCounts = new WeakMap<Recipe, ReadonlyMap<string, number>>()
/** 재료가 적은 레시피부터 본 순서. 레시피 배열마다 한 번만 정렬한다 */
const orderedCache = new WeakMap<readonly Recipe[], readonly Recipe[]>()

function wantKey(recipe: Recipe): string {
  let key = wantKeys.get(recipe)
  if (key === undefined) {
    key = sortedKey(recipe.inputs)
    wantKeys.set(recipe, key)
  }
  return key
}

/** 이 레시피가 필요한 재료의 개수 (다중집합이라 같은 재료 둘일 수 있다) */
function needCount(recipe: Recipe): ReadonlyMap<string, number> {
  let counts = needCounts.get(recipe)
  if (counts === undefined) {
    const built = new Map<string, number>()
    for (const input of recipe.inputs) {
      built.set(input, (built.get(input) ?? 0) + 1)
    }
    counts = built
    needCounts.set(recipe, counts)
  }
  return counts
}

function countVariants(graph: ContactGraph): Map<string, number> {
  const counts = new Map<string, number>()
  for (const node of graph.nodes) {
    counts.set(node.variantId, (counts.get(node.variantId) ?? 0) + 1)
  }
  return counts
}

/**
 * 개수만으로 가능성이 남는 레시피들. 재료가 적은 것부터다 —
 * 클로버 둘이 이미 조건을 만족하는데 셋짜리 레시피를 기다리게 만들면
 * 플레이어는 합성이 고장난 줄 안다.
 */
function satisfiable(
  recipes: readonly Recipe[],
  present: ReadonlyMap<string, number>,
): readonly Recipe[] {
  let ordered = orderedCache.get(recipes)
  if (ordered === undefined) {
    ordered = [...recipes].sort((a, b) => a.inputs.length - b.inputs.length)
    orderedCache.set(recipes, ordered)
  }
  return ordered.filter((recipe) => {
    for (const [id, need] of needCount(recipe)) {
      if ((present.get(id) ?? 0) < need) {
        return false
      }
    }
    return true
  })
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

  /*
   * 아레나에 재료가 갖춰지지도 않았으면 여기서 끝낸다.
   *
   * 이 함수는 프레임마다 불리는데, 재료로 쓰이는 물건은 전체 57종 중 7종뿐이라
   * **대부분의 프레임에는 합칠 후보가 아예 없다.** 그런데도 아래에서 인접 그래프를 세우고
   * 이어진 부분집합을 전부 훑었다. 개수만 세어보면 그 일을 건너뛸 수 있다 — 어떤 레시피도
   * 필요한 만큼의 재료를 못 채우면 붙어 있는지 볼 필요가 없다.
   *
   * 결과는 달라지지 않는다. 여기서 걸러지는 경우는 어차피 부분집합 탐색도 못 찾는 경우다.
   */
  const present = countVariants(graph)
  const candidates = satisfiable(recipes, present)
  if (candidates.length === 0) {
    return null
  }

  const variantOf = new Map(graph.nodes.map((node) => [node.itemId, node.variantId]))
  const adjacency = buildAdjacency(graph)
  const nodeIds = graph.nodes.map((node) => node.itemId)

  for (const candidate of candidates) {
    const want = wantKey(candidate)
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
