import { drawMergeWait } from '../mergeWaitPaint.ts'
import { mergeLabelOffset } from './MergePresentation3D.ts'
import type { ArenaRenderState } from '../ArenaRenderer.ts'
import type { ArenaView } from '../arenaView.ts'
import type { BodySnapshot, PrimitiveShape } from '../../types/game.ts'
import { mergePosition } from './SpatialParticles.ts'
import { PAIR_MARK_COLORS } from '../../systems/PairMarks.ts'
import { drawAim, drawCat, catcherVisualOffset } from '../arenaPaint.ts'
import { itemOutlines } from './itemGeometry.ts'

function traceShape(ctx: CanvasRenderingContext2D, shape: PrimitiveShape): void {
  ctx.beginPath()
  switch (shape.kind) {
    case 'circle': ctx.arc(0, 0, shape.radius, 0, Math.PI * 2); break
    case 'box': ctx.rect(-shape.hw, -shape.hh, shape.hw * 2, shape.hh * 2); break
    case 'capsule':
      ctx.roundRect(-shape.radius, -shape.halfHeight - shape.radius, shape.radius * 2, (shape.halfHeight + shape.radius) * 2, shape.radius)
      break
    case 'polygon':
      shape.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
      ctx.closePath()
  }
}

/** Diagnostic outlines use the actual collision pieces, not the rendering silhouette. */
function drawCollider(view: ArenaView, body: BodySnapshot): void {
  const { ctx, scale } = view
  ctx.save()
  ctx.translate(view.toScreenX(body.x), view.toScreenY(body.y))
  ctx.scale(scale, -scale)
  ctx.rotate(body.rotation)
  ctx.strokeStyle = '#00efc6'
  ctx.lineWidth = 1.3 / scale
  const shape = body.variant.shape
  if (shape.kind === 'compound') {
    for (const part of shape.parts) {
      ctx.save(); ctx.translate(part.offset.x, part.offset.y); ctx.rotate(part.rotation ?? 0)
      traceShape(ctx, part.shape); ctx.stroke(); ctx.restore()
    }
  } else { traceShape(ctx, shape); ctx.stroke() }
  ctx.restore()
}

class PrototypeOverlay {
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  drawMergeLabel(view: ArenaView, state: ArenaRenderState): void {
    const { ctx } = view
    if (state.hiddenReveal != null) {
      const reveal = state.hiddenReveal
      const origin = mergePosition(state)
      const x = view.toScreenX(origin.x), y = view.toScreenY(origin.y)
      ctx.save()
      ctx.globalAlpha = Math.min(1, reveal.progress * 10, (1 - reveal.progress) * 5)
      ctx.font = 'bold 18px sans-serif'
      ctx.textAlign = 'center'; ctx.lineWidth = 5
      ctx.strokeStyle = '#f4edda'; ctx.fillStyle = '#493e30'
      ctx.strokeText(reveal.label, x, y + view.scale * mergeLabelOffset(reveal.from.length))
      ctx.fillText(reveal.label, x, y + view.scale * mergeLabelOffset(reveal.from.length))
      ctx.restore()
    }
  }

  draw(view: ArenaView, state: ArenaRenderState, colliders: boolean): void {
    const { ctx } = view
    if (state.showAim) drawAim(view, state.aimX, state.stackTop, view.compact)
    for (const body of state.bodies) {
      if (colliders) drawCollider(view, body)
      const mark = state.pairMarks?.get(body.variant.id)
      if (mark === undefined) continue
      ctx.save()
      const offset = body.recalled && state.catcher != null ? catcherVisualOffset(state.catcher.x < 0 ? 'left' : 'right', view.compact) : 0
      ctx.translate(view.toScreenX(body.x) + offset, view.toScreenY(body.y))
      ctx.scale(view.scale, -view.scale)
      ctx.rotate(body.rotation)
      ctx.strokeStyle = PAIR_MARK_COLORS[mark % PAIR_MARK_COLORS.length] ?? '#fff'
      ctx.globalAlpha = 0.4 + (state.pairPulse ?? 0) * 0.6
      ctx.lineWidth = 2.5 / view.scale
      for (const outline of itemOutlines(body.variant)) {
        ctx.beginPath()
        outline.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y))
        ctx.closePath(); ctx.stroke()
      }
      ctx.restore()
    }
    drawMergeWait(view, state, this.reducedMotion.matches)
    for (const cat of state.cats ?? []) drawCat(view, cat)
  }
}

export { PrototypeOverlay }
