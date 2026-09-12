import type { BodySnapshot, Material } from '../../types/game.ts'
import type { TrailHit } from '../../systems/TrailField.ts'

const SOFTNESS: Record<Material, number> = {
  rubber: 1, squish: 1, cloth: 0.8, paper: 0.35, wood: 0.25,
  plastic: 0.5, glass: 0.15, metal: 0.12, tech: 0.2, spark: 0.5,
}
interface Pulse { id: string; start: number; amplitude: number }

/** Visual-only, driven by physics impact events and simulation time, including pause. */
class Jelly {
  private readonly pulses = new Map<number, Pulse>()
  private previousTime = -1

  update(time: number, bodies: readonly BodySnapshot[], impacts: readonly TrailHit[]): void {
    if (time < this.previousTime) this.pulses.clear()
    const present = new Map(bodies.map((body) => [body.handle, body.variant.id]))
    for (const [handle, pulse] of this.pulses) {
      if (present.get(handle) !== pulse.id || time - pulse.start > 0.9) this.pulses.delete(handle)
    }
    // Resize/redraw at the same simulation time must not retrigger an impact.
    if (time !== this.previousTime) {
      for (const hit of impacts) {
        if (present.get(hit.handle) !== hit.id) continue
        this.pulses.set(hit.handle, { id: hit.id, start: time, amplitude: Math.min(1, Math.max(0, hit.strength)) })
      }
    }
    this.previousTime = time
  }

  scale(body: BodySnapshot, time: number, strength: number): { x: number; y: number } {
    const pulse = this.pulses.get(body.handle)
    if (pulse === undefined || body.recalled) return { x: 1, y: 1 }
    const soft = body.variant.id === 'egg' ? 0.8 : SOFTNESS[body.variant.material]
    const age = Math.max(0, time - pulse.start)
    const amount = 0.22 * Math.max(0, Math.min(1, strength)) * soft * pulse.amplitude
      * Math.exp(-7 * age) * Math.sin(24 * age)
    const y = 1 - amount
    return { x: 1 / y, y }
  }
}

export { Jelly }
