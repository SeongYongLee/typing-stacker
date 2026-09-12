import { RECIPES } from '../game/data/recipes.ts'
import { trailHitOf } from '../game/systems/ImpactFeel.ts'
import type { TrailHit } from '../game/systems/TrailField.ts'
import { GameLoop } from '../game/core/GameLoop.ts'
import { PhysicsWorld } from '../game/physics/PhysicsWorld.ts'
import { VARIANT_BY_ID } from '../game/data/words.ts'
import type { BodySnapshot } from '../game/types/game.ts'
import type { ArenaRendererPort } from '../game/renderer/ArenaRendererPort.ts'
import type { ArenaRenderState } from '../game/renderer/ArenaRenderer.ts'

const EXAMPLES = ['study-book', 'egg', 'frying-pan', 'soccer-ball', 'umbrella', 'fried-egg'] as const
const DISPLAY_BODIES: readonly BodySnapshot[] = EXAMPLES.map((id, handle) => ({
  handle, variant: VARIANT_BY_ID.get(id)!, owner: 'gallery',
  x: (handle % 3 - 1) * 1.5, y: handle < 3 ? 4.8 : 2.9,
  rotation: 0, settled: true,
}))

/** A separate physical tray: no scores, merges, game-over or changes to the solo run. */
class GallerySimulation {
  private readonly physics: PhysicsWorld
  private readonly loop = new GameLoop()
  private renderer: ArenaRendererPort | null = null
  private display = true
  private paused = false
  private time = 0
  private impacts: readonly TrailHit[] = []
  private preview: { kind: 'merge' | 'recall'; start: number; itemId: string } | null = null
  private disposed = false

  private constructor(physics: PhysicsWorld) {
    this.physics = physics
    physics.setContainer(2.4, 1.52)
    this.loop.setCallbacks((dt) => {
      if (this.paused) return
      this.time += dt
      this.impacts = this.display ? [] : this.physics.step(dt).impacts.map(trailHitOf)
      if (this.preview !== null && this.time - this.preview.start >= 3) this.preview = null
    }, this.render)
  }

  static async create(): Promise<GallerySimulation> {
    return new GallerySimulation(await PhysicsWorld.create())
  }

  attachRenderer(renderer: ArenaRendererPort): void {
    this.detachRenderer()
    this.renderer = renderer
    this.render()
    this.loop.start()
  }

  detachRenderer(): void {
    this.loop.stop()
    this.renderer?.dispose()
    this.renderer = null
  }

  handleResize(): void {
    this.renderer?.resize()
    this.render()
  }

  drop(id: string, x: number): void {
    const variant = VARIANT_BY_ID.get(id)
    if (variant === undefined) return
    if (this.display) this.clear()
    // Keep the comparison tray responsive even if a button is repeatedly pressed.
    if (this.physics.snapshots().length >= 60) return
    const safeX = Number.isFinite(x) ? Math.max(-1.6, Math.min(1.6, x)) : 0
    this.physics.spawnItemAt(variant, safeX, 6.5, 'gallery')
    this.render()
  }

  dropAll(ids: readonly string[] = EXAMPLES): void {
    const variants = [...new Set(ids)].map((id) => VARIANT_BY_ID.get(id)).filter((item) => item !== undefined).slice(0, 6)
    if (variants.length === 0) return
    this.clear()
    variants.forEach((variant, i) => this.physics.spawnItemAt(variant, (i % 3 - 1) * 1.5, i < 3 ? 4.8 : 2.9, 'gallery'))
    this.render()
  }

  setPaused(paused: boolean): void {
    this.paused = paused
  }

  previewEffect(kind: 'merge' | 'recall', itemId = 'fried-egg'): void {
    if (!VARIANT_BY_ID.has(itemId)) return
    this.preview = { kind, start: this.time, itemId }
    this.paused = false
    this.render()
  }

  clear(): void {
    this.preview = null
    this.physics.reset()
    this.display = false
    this.time = 0
    this.impacts = []
    this.render()
  }

  arrange(): void {
    this.clear()
    this.display = true
    this.render()
  }

  snapshot(): ArenaRenderState {
    const progress = this.preview === null ? 0 : Math.min(1, (this.time - this.preview.start) / 3)
    const recipe = this.preview?.kind === 'merge' ? RECIPES.find(recipe => recipe.result.id === this.preview!.itemId) : undefined
    const result = VARIANT_BY_ID.get(this.preview?.itemId ?? 'fried-egg')!
    return {
      hiddenReveal: this.preview?.kind === 'merge' ? {
        label: result.label, sprite: result.sprite,
        from: (recipe?.inputs ?? ['egg', 'frying-pan']).map((id) => VARIANT_BY_ID.get(id)!.sprite), progress,
      } : null,
      catcher: this.preview?.kind === 'recall' ? { x: 1.8, y: 3.5, halfLength: 0.6, angle: 0, progress } : null,
      whiteboardRecall: this.preview?.kind === 'recall' ? {
        word: result.label, label: result.label, sprite: result.sprite, side: 'right', index: 0,
        sourceX: 0, sourceY: 2, progress,
      } : null,
      bodies: this.display ? DISPLAY_BODIES : this.physics.snapshots(),
      aimX: 0, showAim: false, landing: null, ownerColors: null, cameraY: 0,
      stackTop: this.display ? 5 : this.physics.stackTop(), time: this.time, impacts: this.impacts,
      container: { halfWidth: 2.4, wallHeight: 1.52 },
    }
  }

  private readonly render = (): void => {
    this.renderer?.draw(this.snapshot())
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.detachRenderer()
    this.physics.dispose()
  }
}

export { GallerySimulation, EXAMPLES }
