import { recallExit } from './RecallExit.ts'
import { MergePresentation3D } from './MergePresentation3D.ts'
import { BoxGeometry, BufferGeometry, Shape, ExtrudeGeometry, Color, IcosahedronGeometry, SphereGeometry, DynamicDrawUsage, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D, TorusGeometry } from 'three'
import type { ArenaRenderState } from '../ArenaRenderer.ts'
import { itemEffect, MAGIC_EFFECT_IDS, type ParticleShape } from './ItemEffects.ts'
import { ALL_VARIANTS } from '../../data/words.ts'
import { catcherAlpha, catcherVisualOffset } from '../arenaPaint.ts'
import { ItemAssets, type ItemModel } from './ItemAssets.ts'
import { SpatialParticles, mergePosition, MAX_SPATIAL_PARTICLES } from './SpatialParticles.ts'

const BY_SPRITE = new Map(ALL_VARIANTS.map((variant) => [variant.sprite, variant]))

class Effects3D {
  readonly group = new Group()
  private readonly field = new SpatialParticles()
  private readonly chipGeometry = new BoxGeometry(1, 1, 0.28)
  private readonly ringGeometry = new TorusGeometry(1, 0.018, 5, 48)
  private readonly particles = new Map<ParticleShape, InstancedMesh<BufferGeometry, MeshStandardMaterial>>()
  private readonly rings: Mesh<TorusGeometry, MeshStandardMaterial>[] = []
  private readonly merge: MergePresentation3D
  private readonly forming: Mesh<BoxGeometry, MeshStandardMaterial>
  private readonly assets: ItemAssets
  private recall: ItemModel | null = null
  private readonly recallTrail: Mesh<BufferGeometry, MeshStandardMaterial>[] = []
  private readonly dummy = new Object3D()
  private readonly color = new Color()

  constructor(assets: ItemAssets) {
    this.assets = assets
    this.merge = new MergePresentation3D(assets)

    const star = new Shape()
    for (let i = 0; i < 10; i++) {
      const angle = Math.PI / 2 + i * Math.PI / 5, radius = i % 2 === 0 ? 0.5 : 0.22
      if (i === 0) star.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius)
      else star.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius)
    }
    star.closePath()
    const snow = new Shape()
    for (let i = 0; i < 12; i++) {
      const angle = Math.PI / 2 + i * Math.PI / 6, radius = i % 2 === 0 ? 0.5 : 0.13
      if (i === 0) snow.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius)
      else snow.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius)
    }
    snow.closePath()
    const heart = new Shape()
    heart.moveTo(0, -0.5)
    heart.bezierCurveTo(-1, 0.15, -0.45, 0.8, 0, 0.3)
    heart.bezierCurveTo(0.45, 0.8, 1, 0.15, 0, -0.5)
    const shapes: Record<ParticleShape, BufferGeometry> = {
      snow: new ExtrudeGeometry(snow, { depth: 0.06, bevelEnabled: false }),
      heart: new ExtrudeGeometry(heart, { depth: 0.08, bevelEnabled: false, curveSegments: 8 }),
      ring: new TorusGeometry(0.5, 0.035, 4, 24),
      petal: new SphereGeometry(0.5, 8, 6).scale(0.65, 1, 0.12),
      star: new ExtrudeGeometry(star, { depth: 0.08, bevelEnabled: false }),
      bubble: new SphereGeometry(0.5, 10, 8), pixel: new BoxGeometry(1, 1, 1),
      paper: new BoxGeometry(1, 0.7, 0.035), spark: new BoxGeometry(0.18, 1.8, 0.18),
      droplet: new SphereGeometry(0.5, 8, 6).scale(0.75, 1.3, 0.75),
      puff: new IcosahedronGeometry(0.5, 1), steam: new TorusGeometry(0.5, 0.07, 4, 12, Math.PI * 1.4).scale(0.65, 1, 0.65),
      chip: new BoxGeometry(1, 0.6, 0.35),
    }
    for (const shape of Object.keys(shapes) as ParticleShape[]) {
      const luminous = shape === 'star'
      const material = new MeshStandardMaterial({ color: '#ffffff', roughness: shape === 'droplet' ? 0.4 : 0.95,
        metalness: 0, emissive: luminous ? '#8c5d29' : '#000000', emissiveIntensity: 0.15,
        transparent: shape === 'steam' || shape === 'droplet' || shape === 'bubble', opacity: shape === 'bubble' ? 0.22 : shape === 'steam' ? 0.4 : 0.9,
        depthWrite: shape !== 'steam' && shape !== 'bubble', })
      const mesh = new InstancedMesh(shapes[shape], material, MAX_SPATIAL_PARTICLES)
      mesh.count = 0; mesh.frustumCulled = false
      mesh.instanceMatrix.setUsage(DynamicDrawUsage)
      this.particles.set(shape, mesh); this.group.add(mesh)
    }
    for (let i = 0; i < 12; i++) {
      const material = new MeshStandardMaterial({ color: '#f4d290', emissive: '#8c581f', emissiveIntensity: 0.4, transparent: true, depthWrite: false, roughness: 0.4 })
      const ring = new Mesh(this.ringGeometry, material)
      ring.visible = false
      this.group.add(ring)
      this.rings.push(ring)
    }
    for (let i = 0; i < 12; i++) {
      const chip = new Mesh(this.chipGeometry, new MeshStandardMaterial({ color: '#efc06e', emissive: '#000000', emissiveIntensity: 0, roughness: 1, transparent: true, depthWrite: false }))
      chip.visible = false
      this.recallTrail.push(chip)
      this.group.add(chip)
    }
    this.forming = new Mesh(this.chipGeometry, new MeshStandardMaterial({ color: '#bc8650', transparent: true, roughness: 0.7 }))
    this.forming.visible = false
    this.group.add(this.forming)
  }

  update(state: ArenaRenderState, scale: number, enabled: boolean, yaw = 0, compact = false): void {
    this.field.update(state, enabled)
    for (const mesh of this.particles.values()) mesh.count = 0
    this.field.particles.forEach((p) => {
      const mesh = this.particles.get(p.shape)!
      const index = mesh.count++
      const size = p.size * p.scale * Math.min(1, (1 - p.age / p.life) * 3) * (p.shape === 'steam' ? 1 + p.age * 2 : 1)
      this.dummy.position.set(p.x, p.y, p.z)
      if (p.motion === 'pulse') this.dummy.rotation.set(0, 0, 0)
      else this.dummy.rotation.set(p.age * p.spin, p.age * 3, p.shape === 'spark' ? -Math.atan2(p.vx, p.vy) : p.spin)
      this.dummy.scale.setScalar(size)
      this.dummy.updateMatrix()
      mesh.setMatrixAt(index, this.dummy.matrix)
      mesh.setColorAt(index, this.color.set(p.color).multiplyScalar(p.shape === 'pixel' ? 0.65 + 0.35 * Math.cos(p.age * 30) : 1))
    })
    for (const mesh of this.particles.values()) {
      mesh.visible = mesh.count > 0
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true
    }
    this.rings.forEach((ring, index) => {
      const wave = this.field.waves[index]
      ring.visible = wave !== undefined
      if (wave === undefined) return
      const t = wave.age / wave.life
      ring.position.set(wave.x, wave.y, 0.08)
      ring.rotation.set(Math.PI * 0.37, 0, 0)
      ring.scale.setScalar(0.1 + t * wave.radius * (0.6 + wave.strength * 0.4))
      ring.material.opacity = (1 - t) * 0.7
      ring.material.color.set(wave.color)
    })
    const reveal = state.hiddenReveal
    const origin = mergePosition(state)
    this.merge.update(reveal, origin, enabled)
    const ledge = state.formingLedge
    this.forming.visible = ledge != null
    if (ledge != null) {
      const t = ledge.progress
      this.forming.position.set(origin.x + (ledge.x - origin.x) * t, origin.y + (ledge.y - origin.y) * t, Math.sin(Math.PI * t) * 0.7)
      this.forming.rotation.set(0, (1 - t) * Math.PI, (1 - t) * 0.5)
      this.forming.scale.set(ledge.halfWidth * 2 * t, 0.14 * t, 2)
      this.forming.material.opacity = Math.min(1, t * 3)
    }
    const recall = state.whiteboardRecall
    const catcher = state.catcher
    const variant = recall == null ? undefined : BY_SPRITE.get(recall.sprite)
    for (const chip of this.recallTrail) chip.visible = false
    if (variant === undefined || catcher == null) {
      if (this.recall !== null) { this.assets.release(this.recall); this.recall = null }
      return
    }
    if (this.recall?.variant.id !== variant.id) {
      if (this.recall !== null) this.assets.release(this.recall)
      this.recall = this.assets.create(variant, 'flat')
      this.group.add(this.recall.group)
    }
    const model = this.recall!
    this.assets.update(model)
    const t = Math.min(1, recall!.progress / 0.62)
    const eased = t * t * (3 - 2 * t)
    const side = recall!.side
    const sign = side === 'left' ? -1 : 1
    const endX = catcher.x + catcherVisualOffset(side, compact) / scale + sign * 0.12
    const endY = catcher.y + 0.16
    model.group.position.set(recall!.sourceX + (endX - recall!.sourceX) * eased,
      recall!.sourceY + (endY - recall!.sourceY) * t + Math.sin(Math.PI * t) * 1.7,
      0.12 + Math.sin(Math.PI * t) * 0.7)
    const exit = recallExit(catcher.progress, side, scale, yaw, compact)
    model.group.position.x += exit.x
    model.group.position.y += exit.y
    this.recallTrail.forEach((chip, index) => {
      const past = t - (index + 1) * 0.025
      chip.visible = enabled && index < (MAGIC_EFFECT_IDS.has(variant.id) ? 8 : 4) && itemEffect(variant).trigger.includes('recall') && past > 0 && recall!.progress < 0.7
      if (!chip.visible) return
      const smooth = past * past * (3 - 2 * past)
      chip.position.set(recall!.sourceX + (endX - recall!.sourceX) * smooth,
        recall!.sourceY + (endY - recall!.sourceY) * past + Math.sin(Math.PI * past) * 1.7,
        0.12 + Math.sin(Math.PI * past) * 0.7)
      const effect = itemEffect(variant)
      chip.geometry = this.particles.get(effect.shape)!.geometry
      chip.material.color.set(effect.palette[index % effect.palette.length]!)
      chip.rotation.set(past * 4, index, past * 6)
      chip.scale.setScalar(Math.min(0.045, effect.size * 0.45) * (1 - index / 15))
      chip.material.opacity = (1 - index / 12) * catcherAlpha(catcher.progress) * 0.75
    })
    const size = (0.58 + Math.sin(Math.PI * eased) * 0.12) / (Math.max(variant.artBounds.hw, variant.artBounds.hh) * 2)
    model.group.scale.setScalar(size)
    model.art.rotation.z = -sign * (-0.42 + eased * 1.1)
    model.front.transparent = true
    model.front.opacity = catcherAlpha(catcher.progress) * Math.min(1, recall!.progress / 0.12)
  }

  get mergeGroup(): Group { return this.merge.group }

  get particleKinds(): string { return [...new Set(this.field.particles.map((p) => p.shape))].sort().join(',') }

  get particleCount(): number { return this.field.particles.length }

  dispose(): void {
    if (this.recall !== null) this.assets.release(this.recall)
    this.recall = null
    this.group.clear()
    for (const mesh of this.particles.values()) { mesh.dispose(); mesh.geometry.dispose(); mesh.material.dispose() }
    this.particles.clear()
    this.chipGeometry.dispose(); this.ringGeometry.dispose()
    this.forming.material.dispose()
    for (const chip of this.recallTrail) chip.material.dispose()
    for (const ring of this.rings) ring.material.dispose()
    this.merge.dispose()
    this.field.reset()
  }
}

export { Effects3D }
