import { craftKeyOf, type Recipe } from '../data/recipes.ts'
import { findMerge, type ContactGraph, type MergeMatch } from './Merger.ts'
export interface MergeWaitView {
  readonly itemIds: readonly number[]
  readonly edges: readonly (readonly [number, number])[]
  readonly progress: number
  readonly opacity: number
}
const HOLD = 1
function counts(ids: readonly string[]) {
  const map = new Map<string, number>()
  for (const id of ids) { const key = craftKeyOf(id); map.set(key, (map.get(key) ?? 0) + 1) }
  return map
}
function contains(big: Recipe, small: Recipe): boolean {
  const have = counts(big.inputs)
  return big.inputs.length > small.inputs.length && [...counts(small.inputs)].every(([key, n]) => (have.get(key) ?? 0) >= n)
}
/** A fixed deadline for one connected small recipe; new arrivals never renew it. */
export class MergeGrace {
  private time = 0
  private pending: { match: MergeMatch; start: number } | null = null
  private current: MergeWaitView | null = null
  private fading: { view: MergeWaitView; start: number } | null = null
  advance(dt: number): void { this.time += Math.max(0, dt) }
  reset(): void { this.time = 0; this.pending = null; this.current = null; this.fading = null }
  get view(): MergeWaitView | null {
    if (this.current !== null && this.pending !== null) return { ...this.current, progress: Math.min(1, (this.time - this.pending.start) / HOLD) }
    if (this.fading === null) return null
    const opacity = Math.max(0, 1 - (this.time - this.fading.start) / 0.16)
    return opacity > 0 ? { ...this.fading.view, opacity } : null
  }
  private finish(): void {
    if (this.current !== null) this.fading = { view: this.view!, start: this.time }
    this.current = null; this.pending = null
  }
  choose(graph: ContactGraph, recipes: readonly Recipe[]): MergeMatch | null {
    // Revalidate the original pair: do not silently switch its IDs or renew its timer.
    const previous = this.pending
    const original = previous === null ? null : findMerge(graph, [previous.match.recipe], previous.match.itemIds)
    if (previous !== null && original === null) this.finish()
    const small = original ?? findMerge(graph, recipes)
    if (small === null) { this.finish(); return null }
    const larger = recipes.filter(recipe => contains(recipe, small.recipe)).sort((a, b) => b.inputs.length - a.inputs.length)
    for (const recipe of larger) {
      const complete = findMerge(graph, [recipe], small.itemIds)
      if (complete !== null) { this.finish(); return complete }
    }
    let waiting: number[] | null = null
    for (const recipe of larger) {
      const remaining = counts(recipe.inputs)
      for (const id of small.recipe.inputs) { const key = craftKeyOf(id); remaining.set(key, remaining.get(key)! - 1) }
      const selected = new Set(small.itemIds)
      const candidates = [...graph.nodes].sort((a, b) => a.itemId - b.itemId)
      let grew = true
      while (grew) {
        grew = false
        for (const node of candidates) {
          const key = craftKeyOf(node.variantId)
          if (selected.has(node.itemId) || (remaining.get(key) ?? 0) <= 0) continue
          if (!graph.edges.some(([a, b]) => a === node.itemId && selected.has(b) || b === node.itemId && selected.has(a))) continue
          selected.add(node.itemId); remaining.set(key, remaining.get(key)! - 1); grew = true
        }
      }
      if (selected.size > small.itemIds.length) { waiting = [...selected]; break }
    }
    if (waiting === null || this.pending !== null && this.time - this.pending.start >= HOLD) {
      this.finish(); return small
    }
    if (this.pending === null) this.pending = { match: small, start: this.time }
    const ids = new Set(waiting)
    this.current = { itemIds: waiting, edges: graph.edges.filter(([a, b]) => ids.has(a) && ids.has(b)), progress: 0, opacity: 1 }
    this.fading = null
    // A waiting pair should not stop independent recipes elsewhere in the box.
    return findMerge({ nodes: graph.nodes.filter(n => !ids.has(n.itemId)), edges: graph.edges.filter(([a, b]) => !ids.has(a) && !ids.has(b)) }, recipes)
  }
}
