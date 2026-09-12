import { BoxGeometry, CircleGeometry, Group, Mesh, MeshBasicMaterial } from 'three'
import type { ArenaRenderState } from '../ArenaRenderer.ts'
import { ALL_VARIANTS } from '../../data/words.ts'
import { ItemAssets, type ItemModel } from './ItemAssets.ts'

export const MERGE_HOLD_SECONDS = 0.55
export const MERGE_CONTACT_SECONDS = MERGE_HOLD_SECONDS + 0.15

export function mergeHoldSeconds(count: number): number { return count >= 4 ? 1 : MERGE_HOLD_SECONDS }
export function mergeStagger(count: number): number { return count >= 5 ? 0.09 : count >= 4 ? 0.06 : 0 }
export function mergeGatherEnd(count: number): number { return 0.15 + Math.max(0, count - 1) * mergeStagger(count) }
export function mergeSlots(count: number): { x: number; y: number }[] {
  const columns = count <= 3 ? count : count === 4 ? 2 : 3
  const rows = Math.ceil(count / Math.max(1, columns))
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / columns), rowCount = Math.min(columns, count - row * columns)
    return { x: (i % columns - (rowCount - 1) / 2) * 0.82, y: ((rows - 1) / 2 - row) * 0.82 }
  })
}
export function mergeLabelOffset(count: number): number {
  return count >= 4 ? 1.02 : 0.6
}

const BY_SPRITE = new Map(ALL_VARIANTS.map(v => [v.sprite, v]))
export function mergeSeconds(reveal: NonNullable<ArenaRenderState['hiddenReveal']>): number {
  return reveal.progress * (reveal.duration ?? 3)
}

/** Flat original art, with a short assembly motion in the particle scene. */
export class MergePresentation3D {
  readonly group = new Group()
  private key = ''
  private sources: ItemModel[] = []
  private result: ItemModel | null = null
  private readonly lineGeometry = new BoxGeometry(1, 1, 1)
  private readonly lines = Array.from({ length: 3 }, () => new Mesh(this.lineGeometry,
    new MeshBasicMaterial({ color: '#8b7358', transparent: true, depthWrite: false })))
  private readonly shadow = new Mesh(new CircleGeometry(1, 24),
    new MeshBasicMaterial({ color: '#574c39', transparent: true, opacity: 0.12, depthWrite: false }))
  private readonly assets: ItemAssets
  constructor(assets: ItemAssets) {
    this.assets = assets
    this.group.add(this.shadow, ...this.lines)
    this.group.visible = false
  }
  private clearModels(): void {
    for (const model of [...this.sources, ...(this.result === null ? [] : [this.result])]) this.assets.release(model)
    this.sources = []; this.result = null; this.key = ''
  }
  update(reveal: ArenaRenderState['hiddenReveal'], origin: { x: number; y: number }, enabled: boolean): void {
    this.group.visible = reveal != null
    if (reveal == null) { this.clearModels(); return }
    const key = JSON.stringify([reveal.seq, reveal.sprite, reveal.from])
    if (key !== this.key) {
      this.clearModels(); this.key = key
      const result = BY_SPRITE.get(reveal.sprite)
      if (result !== undefined) this.result = this.assets.create(result, 'flat')
      this.sources = reveal.from.flatMap(src => {
        const variant = BY_SPRITE.get(src)
        return variant === undefined ? [] : [this.assets.create(variant, 'flat')]
      })
      for (const model of [...this.sources, ...(this.result === null ? [] : [this.result])]) this.group.add(model.group)
    }
    const count = reveal.from.length
    const gatherEnd = mergeGatherEnd(count)
    const seconds = enabled ? Math.max(0, mergeSeconds(reveal) - mergeHoldSeconds(reveal.from.length)) : gatherEnd + 0.35
    const gather = Math.min(1, seconds / 0.15)
    const fade = Math.min(1, (1 - reveal.progress) * 5)
    const crossfade = Math.max(0, Math.min(1, (seconds - gatherEnd) / 0.1))
    this.group.position.set(origin.x, origin.y, 0)
    const slots = mergeSlots(this.sources.length)
    this.sources.forEach((model, i) => {
      this.assets.update(model)
      const gather = Math.max(0, Math.min(1, (seconds - i * mergeStagger(count)) / 0.15))
      const eased = gather * gather * (3 - 2 * gather)
      const slot = slots[i]!
      const side = slot.x
      const size = 0.7 / (Math.max(model.variant.artBounds.hw, model.variant.artBounds.hh) * 2)
      model.group.visible = crossfade < 1
      model.group.position.set(slot.x * (1 - eased * 0.65), slot.y * (1 - eased * 0.65) + Math.sin(gather * Math.PI) * 0.06, -0.08 + eased * 0.1)
      model.group.scale.setScalar(size)
      model.art.rotation.z = -side * eased * 0.12
      model.front.transparent = true; model.front.opacity = (1 - crossfade) * fade
    })
    if (this.result !== null) {
      const model = this.result
      this.assets.update(model)
      const settle = Math.max(0, Math.min(1, (seconds - gatherEnd - 0.1) / 0.25))
      const squash = enabled ? Math.sin(settle * Math.PI) * (1 - settle) * 0.12 : 0
      const size = 0.7 / (Math.max(model.variant.artBounds.hw, model.variant.artBounds.hh) * 2)
      model.group.visible = crossfade > 0
      model.group.position.set(0, -squash * 0.35, 0.08)
      const emphasis = count >= 4 && enabled ? 1 + Math.sin(settle * Math.PI) * (count >= 5 ? 0.24 : 0.16) : 1
      model.group.scale.set(size * emphasis * (1 + squash), size * emphasis * (1 - squash), size)
      model.front.transparent = true; model.front.opacity = crossfade * fade
    }
    this.shadow.position.set(0, -0.4, -0.2)
    const pop = enabled && count >= 4 ? Math.sin(Math.max(0, Math.min(1, (seconds - gatherEnd) / 0.35)) * Math.PI) : 0
    this.shadow.scale.set(0.44 - Math.sin(gather * Math.PI) * 0.05 + pop * 0.13, 0.045 + pop * 0.015, 1)
    this.shadow.material.opacity = fade * 0.12
    const impact = (seconds - gatherEnd) / 0.18
    this.lines.forEach((line, i) => {
      line.visible = enabled && impact >= 0 && impact < 1
      const angle = (35 + i * 55) * Math.PI / 180
      const distance = 0.3 + Math.max(0, impact) * 0.16
      line.position.set(Math.cos(angle) * distance, Math.sin(angle) * distance, 0.16)
      line.rotation.z = angle
      line.scale.set(0.1 * (1 - Math.max(0, impact)), 0.018, 0.015)
      line.material.opacity = Math.max(0, 1 - impact) * fade
    })
  }
  dispose(): void {
    this.clearModels(); this.group.clear(); this.lineGeometry.dispose()
    for (const line of this.lines) line.material.dispose()
    this.shadow.geometry.dispose(); this.shadow.material.dispose()
  }
}
