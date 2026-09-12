import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import { ARENA } from '../../config.ts'
import { CongestionSignal } from '../congestionSignal.ts'
export class Congestion3D {
  readonly group = new Group()
  readonly signal = new CongestionSignal()
  private readonly geometry = new BoxGeometry(1, 1, 1)
  private readonly material = new MeshStandardMaterial({ color: '#b8a286', roughness: 1, transparent: true, depthWrite: false })
  private readonly dust = Array.from({ length: 8 }, () => new Mesh(this.geometry, this.material))
  constructor() { this.group.add(...this.dust); this.group.visible = false }
  update(time: number, level: number, halfWidth: number, wallHeight: number, reduced: boolean): number {
    const pulse = this.signal.update(time, level)
    const age = time - this.signal.entryTime
    this.group.visible = !reduced && level > 0 && age >= 0 && age < 0.7
    this.material.opacity = Math.max(0, 1 - age / 0.7) * 0.6
    this.dust.forEach((mesh, i) => {
      const side = i % 2 === 0 ? -1 : 1
      mesh.position.set(side * (halfWidth + 0.02 + age * (0.1 + i * 0.015)), ARENA.platformTop + wallHeight - age * age * 0.7 - (i % 4) * 0.03, 0.16 + age * 0.12)
      mesh.rotation.set(i + age, age * 2, i)
      mesh.scale.setScalar((0.025 + i % 3 * 0.008) * Math.max(0, 1 - age / 0.7))
    })
    return reduced ? this.signal.intensity * 0.6 : pulse
  }
  dispose(): void { this.group.clear(); this.geometry.dispose(); this.material.dispose() }
}
