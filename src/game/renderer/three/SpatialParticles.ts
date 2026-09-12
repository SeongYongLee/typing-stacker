import { mergeSeconds, mergeHoldSeconds, mergeGatherEnd } from './MergePresentation3D.ts'
import type { ArenaRenderState } from '../ArenaRenderer.ts'
import { VARIANT_BY_ID } from '../../data/words.ts'
import { itemEffect, type ItemEffect, type ParticleShape, type EffectMotion } from './ItemEffects.ts'
import { effectEmission } from './EffectEmission.ts'
import { createRng } from '../../systems/Rng.ts'

const MAX_SPATIAL_PARTICLES = 240
interface SpatialParticle {
  x: number; y: number; z: number
  vx: number; vy: number; vz: number
  age: number; life: number; size: number; spin: number; color: string
  motion: EffectMotion; originX: number; originY: number; scale: number
  shape: ParticleShape; gravity: number; drag: number; flutter: number
}
interface Shockwave { x: number; y: number; age: number; strength: number; color: string; radius: number; life: number }

function mergePosition(state: ArenaRenderState): { x: number; y: number } {
  return state.hiddenReveal?.origin ?? { x: 0, y: state.cameraY + Math.min(5.4, Math.max(3.2, state.stackTop - state.cameraY + 1)) }
}

/** Bounded visual simulation. Its RNG and clock never touch gameplay state. */
class SpatialParticles {
  readonly particles: SpatialParticle[] = []
  readonly waves: Shockwave[] = []
  private rng = createRng(0xeffec7)
  private time = -1
  private previousMerge: number | null = null
  private mergeEmitted = 0
  private readonly previousBodies = new Map<number, { x: number; y: number; emitted: number; id: string }>()

  reset(): void {
    this.particles.length = 0; this.waves.length = 0
    this.previousBodies.clear(); this.previousMerge = null; this.time = -1
    this.rng = createRng(0xeffec7)
    this.mergeEmitted = 0
  }

  private burst(x: number, y: number, effect: ItemEffect, strength: number, trail = false, direction?: { x: number; y: number }): void {
    const count = trail ? 1 : Math.max(1, Math.round(effect.count * (0.5 + strength * 0.5)))
    for (let i = 0; i < count && this.particles.length < MAX_SPATIAL_PARTICLES; i++) {
      const angle = this.rng.next() * Math.PI * 2
      const radial = (0.3 + this.rng.next() * 0.7) * effect.speed * (0.5 + strength * 0.5)
      this.particles.push({ x, y, z: 0.12,
        vx: direction === undefined ? Math.cos(angle) * radial : direction.x * radial,
        vy: direction === undefined ? Math.abs(Math.sin(angle)) * radial + 0.3 : direction.y * radial,
        vz: (this.rng.next() - 0.35) * radial,
        age: 0, life: effect.life * (0.75 + this.rng.next() * 0.25),
        size: effect.size * (0.75 + this.rng.next() * 0.5) * (trail ? 0.55 : 1),
        spin: this.rng.next() * 6, color: this.rng.pick(effect.palette),
        motion: effect.motion, originX: x, originY: y, scale: 1,
        shape: effect.shape, gravity: effect.motion === 'rise' ? -Math.abs(effect.gravity) : effect.gravity, drag: effect.drag, flutter: effect.flutter })
    }
  }

  update(state: ArenaRenderState, enabled: boolean): void {
    if (!enabled) { this.reset(); this.time = state.time; return }
    if (state.time < this.time) this.reset()
    if (state.time === this.time) return
    const dt = this.time < 0 ? 0 : Math.min(0.05, state.time - this.time)
    this.time = state.time
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!
      p.age += dt
      if (p.age >= p.life) { this.particles.splice(i, 1); continue }
      if (p.motion === 'pulse') {
        p.scale = 1 + p.age / p.life * 2.5
        continue
      }
      if (p.motion === 'orbit') {
        const angle = p.spin + p.age * 5, radius = 0.08 + p.age * 0.3
        p.x = p.originX + Math.cos(angle) * radius
        p.y = p.originY + Math.sin(angle) * radius * 0.4
        p.z = 0.12 + Math.sin(angle) * radius * 0.7
        continue
      }
      const damping = Math.exp(-p.drag * dt)
      p.vx *= damping; p.vz *= damping
      p.x += (p.vx + Math.sin(p.age * 14 + p.spin) * p.flutter * p.age) * dt
      p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= p.gravity * dt
    }
    for (let i = this.waves.length - 1; i >= 0; i--) {
      this.waves[i]!.age += dt
      if (this.waves[i]!.age > this.waves[i]!.life) this.waves.splice(i, 1)
    }
    for (const hit of state.impacts) {
      const variant = VARIANT_BY_ID.get(hit.id)
      const effect = itemEffect(variant)
      if (!effect.trigger.includes('impact')) continue
      const body = state.bodies.find((candidate) => candidate.handle === hit.handle && candidate.variant.id === hit.id)
      const source = variant === undefined ? { x: hit.x, y: hit.y, direction: undefined } : effectEmission(effect,
        body ?? { handle: hit.handle, variant, owner: 'effect', x: hit.x, y: hit.y, rotation: 0, settled: false }, 'impact')
      this.burst(source.x, source.y, effect, hit.strength, false, source.direction)
      if (effect.wave !== 'none' && this.waves.length < 12) this.waves.push({
        x: source.x, y: source.y, age: 0, strength: hit.strength, color: effect.palette[0]!,
        radius: effect.wave === 'wide' ? 0.95 : 0.4, life: effect.wave === 'wide' ? 0.55 : 0.3,
      })
    }
    const present = new Set<number>()
    for (const body of state.bodies) {
      present.add(body.handle)
      let previous = this.previousBodies.get(body.handle)
      if (previous === undefined || previous.id !== body.variant.id) {
        previous = { x: body.x, y: body.y, emitted: state.time, id: body.variant.id }
      }
      const effect = itemEffect(body.variant)
      if (effect.trigger.includes('move') && !body.settled && !body.recalled && !state.suppressTrails?.has(body.handle)
        && state.time - previous.emitted > 0.07 && Math.hypot(body.x - previous.x, body.y - previous.y) > 0.025) {
        const source = effectEmission(effect, body, 'move', { x: body.x - previous.x, y: body.y - previous.y })
        this.burst(source.x, source.y, effect, 0.1, true, source.direction)
        previous.emitted = state.time
      }
      previous.x = body.x; previous.y = body.y
      this.previousBodies.set(body.handle, previous)
    }
    for (const handle of this.previousBodies.keys()) if (!present.has(handle)) this.previousBodies.delete(handle)
    const reveal = state.hiddenReveal
    if (reveal == null || this.previousMerge === null || reveal.progress < this.previousMerge) this.mergeEmitted = 0
    const count = reveal?.from.length ?? 0
    const burstTimes = count >= 5 ? [0, 0.18] : [0]
    if (reveal != null) for (const [beat, delay] of burstTimes.entries()) {
      if (this.mergeEmitted > beat || mergeSeconds(reveal) < mergeHoldSeconds(count) + mergeGatherEnd(count) + delay) continue
      this.mergeEmitted = beat + 1
      const origin = mergePosition(state)
      const effect = itemEffect([...VARIANT_BY_ID.values()].find((variant) => variant.sprite === reveal.sprite))
      if (effect.trigger.includes('merge')) {
        const start = this.particles.length
        this.burst(origin.x, origin.y, { ...effect, count: count >= 5 ? 12 : count >= 4 ? 10 : 4, size: effect.size * (count >= 4 ? 0.9 : 0.7),
          speed: effect.speed * (count >= 4 ? 0.7 : 0.45), life: Math.min(effect.life, count >= 4 ? 0.9 : 0.65) }, 0.4)
        if (beat === 0) this.burst(origin.x, origin.y, { ...effect, shape: 'puff', palette: ['#b9ab91', '#d5c7af'],
          count: 6, size: 0.045, speed: 0.35, life: 0.3, gravity: 0.4, motion: 'scatter', flutter: 0 }, 0)
        const emitted = this.particles.slice(start)
        emitted.forEach((p, i) => {
          p.z = -0.12 - beat * 0.12; p.vz = 0.6 + this.rng.next() * 0.5
          if (count >= 4) {
            const angle = Math.PI * (0.12 + 0.76 * i / Math.max(1, emitted.length - 1))
            const speed = 0.65 + beat * 0.25
            p.vx = Math.cos(angle) * speed; p.vy = Math.sin(angle) * speed
            if (p.motion === 'orbit') p.motion = 'scatter'
          }
        })
      }
    }
    this.previousMerge = reveal?.progress ?? null
  }
}

export { SpatialParticles, mergePosition, MAX_SPATIAL_PARTICLES }
