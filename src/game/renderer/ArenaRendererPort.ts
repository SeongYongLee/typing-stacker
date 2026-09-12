import type { ArenaRenderState } from './ArenaRenderer.ts'

/** Renderers consume the same 2D state; drawing must never advance the simulation. */
interface ArenaRendererPort {
  draw(state: ArenaRenderState): void
  resize(): void
  dispose(): void
}

export type { ArenaRendererPort }
