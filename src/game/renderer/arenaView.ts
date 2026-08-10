interface ArenaView {
  readonly ctx: CanvasRenderingContext2D
  readonly scale: number
  readonly cssWidth: number
  readonly cssHeight: number
  readonly cameraY: number
  readonly nightfall: number
  toScreenX(worldX: number): number
  toScreenY(worldY: number): number
}

export type { ArenaView }
