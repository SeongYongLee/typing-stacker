export function congestionLevel(percent: number, rush: boolean): number {
  return rush ? 1 : percent < 80 ? 0 : 0.25 + Math.min(1, Math.max(0, (percent - 80) / 20)) * 0.75
}
export function congestionPeriod(level: number): number { return 2.4 - Math.max(0, Math.min(1, level)) * 1.2 }
/** Visual clock follows game time, so pause freezes both the pulse and dust. */
export class CongestionSignal {
  intensity = 0
  phase = 0
  time = -1
  entryTime = -10
  private active = false
  update(time: number, level: number): number {
    if (time < this.time) { this.intensity = 0; this.phase = 0; this.active = false; this.entryTime = -10 }
    const dt = this.time < 0 ? 0 : Math.max(0, Math.min(0.1, time - this.time))
    this.time = time
    if (level > 0 && !this.active) this.entryTime = time
    this.active = level > 0
    this.intensity += (level - this.intensity) * (1 - Math.exp(-dt * (level > 0 ? 7 : 4)))
    this.phase += dt / congestionPeriod(level)
    return this.intensity * (0.45 + (1 - Math.cos(this.phase * Math.PI * 2)) * 0.275)
  }
}
