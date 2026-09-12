import type { ArenaView } from './arenaView.ts'
import type { ArenaRenderState } from './ArenaRenderer.ts'
import { itemOutlines } from './itemOutlines.ts'

export function drawMergeWait(view: ArenaView, state: ArenaRenderState, reducedMotion = false): void {
  const wait = state.mergeWait
  if (wait == null) return
  const { ctx, scale } = view
  const bodies = new Map(state.bodies.filter(body => wait.itemIds.includes(body.handle)).map(body => [body.handle, body]))
  const pulse = reducedMotion ? 0.8 : 0.55 + Math.sin(Math.PI * wait.progress) * 0.35
  ctx.save()
  ctx.strokeStyle = '#d3a14f'; ctx.globalAlpha = pulse * wait.opacity
  ctx.lineWidth = 2; ctx.setLineDash([4, 5])
  ctx.lineDashOffset = reducedMotion ? 0 : -wait.progress * 9
  for (const [a, b] of wait.edges) {
    const from = bodies.get(a), to = bodies.get(b)
    if (from === undefined || to === undefined) continue
    ctx.beginPath(); ctx.moveTo(view.toScreenX(from.x), view.toScreenY(from.y))
    ctx.lineTo(view.toScreenX(to.x), view.toScreenY(to.y)); ctx.stroke()
  }
  ctx.setLineDash([])
  for (const body of bodies.values()) {
    ctx.save(); ctx.translate(view.toScreenX(body.x), view.toScreenY(body.y)); ctx.scale(scale, -scale); ctx.rotate(body.rotation)
    ctx.lineWidth = 2.5 / scale
    for (const outline of itemOutlines(body.variant)) {
      ctx.beginPath(); outline.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)); ctx.closePath(); ctx.stroke()
    }
    ctx.restore()
  }
  ctx.restore()
}
