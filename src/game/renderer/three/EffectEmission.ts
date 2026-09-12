import type { BodySnapshot } from '../../types/game.ts'
import type { EffectTrigger, ItemEffect } from './ItemEffects.ts'

interface Vector { x: number; y: number }
/** Local anchors/directions rotate with the sprite; contact and world-up do not. */
export function effectEmission(effect: ItemEffect, body: BodySnapshot, trigger: EffectTrigger, movement?: Vector): { x: number; y: number; direction?: Vector } {
  const c = Math.cos(body.rotation), s = Math.sin(body.rotation)
  const bounds = body.variant.artBounds
  let x = body.x, y = body.y
  const direction = typeof effect.directionMode === 'object'
    ? { x: effect.directionMode.x * c - effect.directionMode.y * s, y: effect.directionMode.x * s + effect.directionMode.y * c }
    : effect.directionMode === 'up' ? { x: 0, y: 1 }
    : effect.directionMode === 'opposite-motion' && movement !== undefined && Math.hypot(movement.x, movement.y) > 0
      ? { x: -movement.x, y: -movement.y } : undefined
  if (direction !== undefined) {
    const length = Math.hypot(direction.x, direction.y)
    if (length > 0) { direction.x /= length; direction.y /= length }
  }
  if (typeof effect.anchor === 'object') {
    const dx = effect.anchor.x * bounds.hw, dy = effect.anchor.y * bounds.hh
    x += dx * c - dy * s; y += dx * s + dy * c
  } else if (effect.anchor === 'contact' && trigger === 'impact') {
    y -= Math.abs(c) * bounds.hh + Math.abs(s) * bounds.hw
  } else if (effect.anchor === 'top') {
    x -= s * bounds.hh * 0.7; y += c * bounds.hh * 0.7
  } else if (effect.anchor === 'wake' && direction !== undefined) {
    x += direction.x * bounds.hw * 0.7; y += direction.y * bounds.hh * 0.7
  }
  return { x, y, direction }
}
