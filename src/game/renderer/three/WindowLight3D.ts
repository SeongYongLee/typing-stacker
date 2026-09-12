import { NormalBlending, BoxGeometry, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, Mesh, PlaneGeometry, Points, ShaderMaterial, SpotLight, Vector3 } from 'three'
import { ARENA_ART } from '../arenaArt.generated.ts'
import { arenaProjection } from './projection.ts'

/** Same cover rectangle as ArenaBackdrop; gallery uses center, game uses bottom. */
export function windowRoomBox(width: number, height: number, alignment: 'center' | 'bottom') {
  const art = ARENA_ART['background-day'], scale = Math.max(width / art.width, height / art.height)
  const w = art.width * scale, h = art.height * scale
  return { left: (width - w) / 2, top: alignment === 'bottom' ? height - h : (height - h) / 2, width: w, height: h }
}
export function windowWorldPoint(screenX: number, screenY: number, z: number, width: number, height: number, cameraY: number, yaw: number, scaleOverride?: number): Vector3 {
  const projection = arenaProjection(width, height, cameraY, yaw, scaleOverride)
  return new Vector3(((screenX - width / 2) / projection.scale + z * Math.sin(yaw)) / Math.cos(yaw),
    (height - screenY) / projection.scale + projection.bottom, z)
}
const vertex = `varying vec3 local; varying vec2 coords; void main(){local=position;coords=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`
// Keep local coordinates for feathering while widening the beam into the room.
const rayVertex = `varying vec3 local; varying vec2 coords; void main(){local=position;coords=uv;vec3 p=position;p.yz*=mix(.35,1.8,position.x);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`
const colorUniforms = () => ({ tint: { value: new Color('#fff0b5') }, strength: { value: 0.1 } })
const rayFragment = `varying vec3 local; uniform vec3 tint; uniform float strength;
void main(){float along=clamp(local.x,0.,1.);float edge=smoothstep(0.,.23,.5-abs(local.y));
float alpha=edge*smoothstep(0.,.08,along)*pow(1.-along,.85)*strength;gl_FragColor=vec4(tint,alpha);}`
const poolFragment = `varying vec2 coords; uniform vec3 tint; uniform float strength;
void main(){vec2 p=(coords-.5)*2.;float a=pow(max(0.,1.-dot(p,p)),2.);gl_FragColor=vec4(tint,a*strength);}`
const dustVertex = `uniform float pointSize;attribute float depthLayer;attribute float visibility;varying float alpha;varying float softness;void main(){alpha=visibility;softness=depthLayer;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=pointSize*mix(.65,2.4,depthLayer);}`
const dustFragment = `uniform vec3 tint;uniform float strength;varying float alpha;varying float softness;void main(){float d=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(tint,pow(max(0.,1.-d),mix(1.2,2.,softness))*strength*alpha);}`
const AXIS = new Vector3(1, 0, 0)
const RAYS = [
  { x: 0.14, y: 0.28, endX: 0.58, endY: 0.58, thickness: 0.055 },
  { x: 0.14, y: 0.37, endX: 0.61, endY: 0.71, thickness: 0.045 },
  { x: 0.16, y: 0.46, endX: 0.52, endY: 0.8, thickness: 0.035 },
] as const
export interface WindowLightLayout { width: number; height: number; offsetX: number; offsetY: number; alignment: 'center' | 'bottom' }

export class WindowLight3D {
  readonly group = new Group()
  private readonly rayGeometry = new BoxGeometry(1, 1, 1).translate(0.5, 0, 0)
  private readonly poolGeometry = new PlaneGeometry(1, 1)
  private readonly rayMaterial = new ShaderMaterial({ uniforms: colorUniforms(), vertexShader: rayVertex, fragmentShader: rayFragment,
    transparent: true, blending: NormalBlending, depthWrite: false, side: DoubleSide, forceSinglePass: true })
  private readonly poolMaterial = new ShaderMaterial({ uniforms: colorUniforms(), vertexShader: vertex, fragmentShader: poolFragment,
    transparent: true, blending: NormalBlending, depthWrite: false, side: DoubleSide })
  private readonly rays = RAYS.map(() => new Mesh(this.rayGeometry, this.rayMaterial))
  private readonly pool = new Mesh(this.poolGeometry, this.poolMaterial)
  private readonly positions = new Float32Array(48 * 3)
  private readonly dustGeometry = new BufferGeometry()
  private readonly dustMaterial = new ShaderMaterial({ uniforms: { ...colorUniforms(), pointSize: { value: 3 } }, vertexShader: dustVertex, fragmentShader: dustFragment,
    transparent: true, blending: NormalBlending, depthWrite: false })
  private readonly dust = new Points(this.dustGeometry, this.dustMaterial)
  private readonly light = new SpotLight('#fff0b5', 5, 40, Math.PI / 5, 0.7, 1)
  private readonly day = new Color('#fff0b5')
  private readonly night = new Color('#a5bcf4')
  private readonly tint = new Color()
  private readonly ends = RAYS.map(() => ({ start: new Vector3(), end: new Vector3() }))
  private readonly delta = new Vector3()
  private readonly point = new Vector3()
  private disposed = false
  readonly moteCount = 48

  constructor() {
    this.dustGeometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3))
    this.dustGeometry.setAttribute('depthLayer', new Float32BufferAttribute(Array.from({ length: this.moteCount }, (_, i) => Math.floor(i / 3) % 3 / 2), 1))
    this.dustGeometry.setAttribute('visibility', new Float32BufferAttribute(new Float32Array(this.moteCount), 1))
    this.dust.frustumCulled = false
    this.group.add(...this.rays, this.pool, this.dust, this.light, this.light.target)
  }

  update(width: number, height: number, cameraY: number, yaw: number, layout: WindowLightLayout, nightfall: number, time: number, reducedMotion: boolean, dpr: number, scaleOverride?: number): void {
    if (this.disposed) return
    const room = windowRoomBox(layout.width, layout.height, layout.alignment)
    const scale = arenaProjection(width, height, cameraY, yaw, scaleOverride).scale
    const phase = reducedMotion ? 0 : time
    const night = Math.max(0, Math.min(1, nightfall))
    this.tint.copy(this.day).lerp(this.night, night)
    for (const material of [this.rayMaterial, this.poolMaterial, this.dustMaterial]) material.uniforms.tint!.value.copy(this.tint)
    this.rayMaterial.uniforms.strength!.value = (0.38 - night * 0.14) * (0.96 + Math.sin(phase * 0.25) * 0.04)
    this.poolMaterial.uniforms.strength!.value = 0.26 - night * 0.1
    this.dustMaterial.uniforms.strength!.value = 0.95 - night * 0.2
    this.dustMaterial.uniforms.pointSize!.value = Math.min(2, dpr) * 3
    const point = (x: number, y: number, z: number) => windowWorldPoint(layout.offsetX + room.left + x * room.width,
      layout.offsetY + room.top + y * room.height, z, width, height, cameraY, yaw, scaleOverride)
    this.rays.forEach((ray, i) => {
      const spec = RAYS[i]!, ends = this.ends[i]!
      ends.start.copy(point(spec.x, spec.y, -0.8))
      ends.end.copy(point(spec.endX, spec.endY, 0.65))
      this.delta.subVectors(ends.end, ends.start)
      ray.position.copy(ends.start)
      ray.quaternion.setFromUnitVectors(AXIS, this.delta.clone().normalize())
      ray.scale.set(this.delta.length(), room.height * spec.thickness / scale, 0.8)
    })
    this.pool.position.copy(point(0.39, 0.82, -0.2))
    this.pool.scale.set(room.width * 0.33 / scale, room.height * 0.12 / scale, 1)
    this.pool.rotation.set(0.35, 0, -0.05)
    for (let i = 0; i < this.moteCount; i++) {
      const ends = this.ends[i % 3]!
      const depth = this.dustGeometry.getAttribute('depthLayer').getX(i)
      const t = ((i * 0.61803398875 + phase * (0.009 + depth * 0.023)) % 1 + 1) % 1
      this.dustGeometry.getAttribute('visibility').setX(i, Math.min(1, t / 0.12, (1 - t) / 0.16))
      this.point.lerpVectors(ends.start, ends.end, t)
      this.point.y += Math.sin(i * 2.3 + phase * (0.22 + depth * 0.3)) * (0.06 + depth * 0.14)
      this.point.z += -0.5 + depth * 1.8 + Math.cos(i * 1.7 + phase * 0.2) * 0.18
      this.positions.set([this.point.x, this.point.y, this.point.z], i * 3)
    }
    // Float32BufferAttribute copies its input; update its existing GPU-bound array.
    const attribute = this.dustGeometry.getAttribute('position')
    ;(attribute.array as Float32Array).set(this.positions)
    attribute.needsUpdate = true
    this.dustGeometry.getAttribute('visibility').needsUpdate = true
    this.light.position.copy(this.ends[0]!.start); this.light.position.z += 3
    this.light.target.position.copy(this.ends[1]!.end)
    this.light.color.copy(this.tint); this.light.intensity = 5 - night * 3
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.group.clear()
    this.rayGeometry.dispose(); this.poolGeometry.dispose(); this.dustGeometry.dispose()
    this.rayMaterial.dispose(); this.poolMaterial.dispose(); this.dustMaterial.dispose()
    this.light.dispose()
  }
}
