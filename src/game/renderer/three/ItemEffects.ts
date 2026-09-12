import type { ItemVariant, Material } from '../../types/game.ts'

export type ParticleShape = 'paper' | 'spark' | 'droplet' | 'puff' | 'steam' | 'chip' | 'petal' | 'star' | 'bubble' | 'pixel' | 'ring' | 'snow' | 'heart'
export type EffectTrigger = 'impact' | 'move' | 'merge' | 'recall'
export type EffectAnchor = 'center' | 'top' | 'contact' | 'wake' | { readonly x: number; readonly y: number }
export type EffectMotion = 'scatter' | 'rise' | 'pulse' | 'orbit'
export type EffectDirection = 'radial' | 'up' | 'opposite-motion' | { readonly x: number; readonly y: number }
const SURFACE = ['impact', 'merge', 'recall'] as const
const ACTIVE = ['impact', 'move', 'merge', 'recall'] as const
export interface ItemEffect {
  readonly trigger: readonly EffectTrigger[]
  readonly anchor: EffectAnchor
  readonly motion: EffectMotion
  readonly directionMode: EffectDirection
  readonly label: string
  readonly shape: ParticleShape
  readonly palette: readonly string[]
  readonly size: number
  readonly speed: number
  readonly gravity: number
  readonly drag: number
  readonly life: number
  readonly count: number
  readonly flutter: number
  readonly wave: 'none' | 'tight' | 'wide'
}
const paper: ItemEffect = { trigger: SURFACE, anchor: 'center', motion: 'scatter', directionMode: 'radial', label: '팔랑이는 종잇장', shape: 'paper', palette: ['#fff1c8', '#d7be83'], size: 0.17, speed: 0.8, gravity: 0.7, drag: 1.3, life: 1.1, count: 9, flutter: 1.8, wave: 'none' }
const spark: ItemEffect = { trigger: SURFACE, anchor: 'center', motion: 'scatter', directionMode: 'radial', label: '금속 불꽃과 짧은 울림', shape: 'spark', palette: ['#ffe6a2', '#f2a548', '#d9e6e8'], size: 0.11, speed: 2.6, gravity: 4.5, drag: 1, life: 0.38, count: 14, flutter: 0, wave: 'tight' }
const puff: ItemEffect = { trigger: SURFACE, anchor: 'center', motion: 'scatter', directionMode: 'radial', label: '가볍게 퍼지는 먼지', shape: 'puff', palette: ['#caba9d', '#e6dcc2'], size: 0.14, speed: 0.9, gravity: -0.3, drag: 3, life: 0.65, count: 8, flutter: 0.2, wave: 'wide' }
const droplet: ItemEffect = { trigger: SURFACE, anchor: 'center', motion: 'scatter', directionMode: 'radial', label: '둥글게 튀는 물방울', shape: 'droplet', palette: ['#86c9e1', '#c7eaf2'], size: 0.09, speed: 1.4, gravity: 4.6, drag: 0.3, life: 0.7, count: 12, flutter: 0, wave: 'none' }
const chip: ItemEffect = { trigger: SURFACE, anchor: 'center', motion: 'scatter', directionMode: 'radial', label: '작게 튀는 입자', shape: 'chip', palette: ['#c9b295', '#ead7b8'], size: 0.07, speed: 1.1, gravity: 3, drag: 0.6, life: 0.55, count: 8, flutter: 0, wave: 'none' }
const steam: ItemEffect = { trigger: ACTIVE, anchor: 'top', motion: 'rise', directionMode: 'up', label: '위로 피어나는 김', shape: 'steam', palette: ['#f5edd8', '#d8d6c9'], size: 0.24, speed: 0.35, gravity: -1.3, drag: 1.8, life: 1.05, count: 9, flutter: 0.55, wave: 'none' }
const MATERIAL_EFFECTS: Record<Material, ItemEffect> = {
  paper, metal: spark, tech: spark, spark,
  cloth: { ...puff, label: '살짝 퍼지는 솜먼지', wave: 'none' },
  rubber: puff,
  squish: { ...puff, label: '말랑하게 퍼지는 입자', palette: ['#f5d7ac', '#fae8ca'], wave: 'none' },
  glass: { ...spark, label: '맑게 반짝이는 빛', palette: ['#b8e4f2', '#e4f4f6'], speed: 0.7, count: 7 },
  wood: { ...chip, label: '가벼운 나무 먼지' }, plastic: chip,
}
// Sound materials are broad; visual exceptions describe the actual object.
const ITEM_EFFECTS: Readonly<Record<string, ItemEffect>> = {
  'study-book': paper,
  egg: { ...puff, label: '폭신한 크림색 입자', palette: ['#fff0c9', '#e9c987'], size: 0.12, gravity: 1.5, drag: 2.2, wave: 'none' },
  'frying-pan': spark,
  'soccer-ball': { ...puff, label: '먼지와 넓은 충격 고리', speed: 1.5, gravity: 0.4, count: 11 },
  umbrella: { ...droplet, label: '사방으로 털리는 물방울' },
  'fried-egg': steam,
  'milk-carton': { ...droplet, palette: ['#f8f0dd', '#e5dfcb'] },
  'strawberry-milk': { ...droplet, palette: ['#ecc3c4', '#f7dcce'] },
}
const petals: ItemEffect = { ...paper, label: '흩날리는 꽃잎', shape: 'petal', palette: ['#efb8c2', '#f5d580'], size: 0.18, gravity: 0.45, flutter: 1.1 }
const stars: ItemEffect = { ...spark, trigger: ACTIVE, motion: 'rise', directionMode: 'up', label: '회전하며 떠오르는 별빛', shape: 'star', palette: ['#f7d16e', '#fff0b5'], size: 0.17, speed: 0.65, gravity: -0.6, life: 0.95, wave: 'none' }
const pixels: ItemEffect = { ...chip, label: '깜빡이며 흩어지는 픽셀', shape: 'pixel', palette: ['#74d3c5', '#a6bdf1'], size: 0.1, speed: 0.8, gravity: -0.2, life: 0.65, wave: 'tight' }
const bubbles: ItemEffect = { ...droplet, label: '둥실 떠오르는 비눗방울', shape: 'bubble', palette: ['#c6e8ee', '#d9c5ef'], size: 0.19, speed: 0.45, gravity: -0.75, drag: 2, life: 1.15, flutter: 0.4 }

// Decisions made against the original sprite, separately from the sound material.
const contact: ItemEffect = { ...puff, anchor: 'contact', label: '착지 때 퍼지는 접촉 먼지', trigger: SURFACE, wave: 'tight', count: 5 }
const light: ItemEffect = { ...stars, motion: 'pulse', label: '작게 번지는 따뜻한 빛', shape: 'puff', palette: ['#ffe8a0', '#fff7d6'], size: 0.1, count: 5, trigger: SURFACE }
const leaves: ItemEffect = { ...petals, label: '흩날리는 초록 잎', palette: ['#7baf68', '#bdc979'] }
const grain: ItemEffect = { ...chip, label: '톡톡 튀는 볏알', palette: ['#d3ad50', '#ead080'], size: 0.08 }
const sound: ItemEffect = { ...puff, motion: 'pulse', label: '짧게 퍼지는 음파 고리', shape: 'ring', palette: ['#88b8cf', '#d3e5e5'], size: 0.2, gravity: 0, speed: 0.2, count: 3, wave: 'none' }
const snow: ItemEffect = { ...stars, motion: 'scatter', label: '천천히 내려앉는 눈 결정', shape: 'snow', palette: ['#d4eef5', '#ffffff'], gravity: 0.55, flutter: 0.6 }
const wind: ItemEffect = { ...steam, motion: 'scatter', label: '이동 방향을 따르는 바람 결', directionMode: 'opposite-motion', anchor: 'wake', palette: ['#d1e3dc', '#f3eada'], gravity: 0, speed: 1.1, flutter: 0 }
const closedContainer: ItemEffect = { ...contact, motion: 'pulse', label: '밀폐 용기의 짧은 접촉 파문', shape: 'ring', size: 0.12, wave: 'none' }
const REVIEWED_EFFECTS = new Map<string, ItemEffect>()
function assign(ids: string, effect: ItemEffect): void {
  for (const id of ids.split(' ')) REVIEWED_EFFECTS.set(id, effect)
}
assign('turtle turtle-sea-turtle', { ...contact, label: '등껍질 접촉 파문', shape: 'ring', palette: ['#99b279', '#d3d5a1'] })
assign('clover clover-lucky', leaves)
assign('rice-plant', grain)
assign('cactus cactus-mexican-character', { ...contact, label: '가볍게 퍼지는 사막 먼지', palette: ['#d8b682', '#ebd0a2'], wave: 'none' })
assign('octopus electric-kettle electric-kettle-gooseneck iron', steam)
assign('dessert-tower', { ...chip, label: '디저트의 작은 설탕·과자 입자', palette: ['#ecd6b0', '#fff0d2'] })
assign('fire-extinguisher', { ...contact, label: '소화기 착지 먼지 · 분사 없음', palette: ['#e8e5db', '#c7c6bf'], wave: 'none' })
assign('fart-cloud', { ...steam, label: '느리게 퍼지는 초록 기체', palette: ['#a6bd48', '#c7d96d'], size: 0.3, speed: 0.2 })
assign('candle', { ...light, anchor: { x: 0, y: 0.85 }, label: '심지의 작은 불빛', palette: ['#ffbd65', '#ffe0a1'], trigger: ACTIVE })
assign('footprints footprints-dinosaur', { ...contact, label: '발자국을 따라 퍼지는 흙먼지', palette: ['#b39a77', '#d0bb96'] })
assign('mirror-door', { ...stars, motion: 'orbit', label: '보라색 마법 소용돌이', shape: 'steam', palette: ['#ac80da', '#d6b1f0'], size: 0.25 })
assign('speaker headphones alarm-clock', sound)
assign('desk-lamp gooseneck-lamp flashlight', light)
assign('broom stick-vacuum robot-vacuum', { ...contact, label: '바닥 접촉으로 일어나는 먼지', wave: 'none' })
assign('sunflower', { ...petals, label: '흩날리는 노란 해바라기 꽃잎', palette: ['#efc54b', '#f4dd87'] })
assign('pine-tree', { ...paper, label: '가늘게 흩날리는 솔잎', shape: 'spark', palette: ['#65954e', '#96ad60'], size: 0.08, speed: 0.4 })
assign('snowflake snow-globe', snow)
assign('ice-cream-cone', { ...puff, label: '크림 주변의 옅은 냉기', palette: ['#f5dce3', '#f8edcb'], wave: 'none' })
assign('spaceship', { ...spark, label: '추진구에서 뻗는 불빛', palette: ['#ffc158', '#f29245'], directionMode: { x: 0.65, y: -1 }, anchor: { x: 0.55, y: -0.65 }, trigger: ACTIVE })
assign('spaceship-saucer', { ...sound, motion: 'orbit', label: '비행접시의 부양 고리', palette: ['#8bded9', '#d1f1e6'], trigger: ACTIVE })
assign('mirror-ball', { ...stars, label: '색색으로 흩어지는 반사광', palette: ['#9ccedf', '#d5a3dc', '#edcf87'], trigger: SURFACE })
assign('bolt', { ...spark, label: '짧게 튀는 전기 섬광', palette: ['#ffdc50', '#fff3a0'], trigger: ACTIVE })
assign('heart', { ...sound, label: '작게 퍼지는 하트 맥박', shape: 'heart', palette: ['#e75a62', '#f4acaa'] })
assign('burnt-hole-shirt', { ...contact, label: '탄 구멍에서 떨어지는 그을음', palette: ['#6c6358', '#8a8071'], wave: 'none' })
assign('triangle-gimbap', { ...chip, label: '작은 쌀알과 김 조각', palette: ['#f5efdc', '#566447'] })
assign('microwave refrigerator washing-machine', { ...contact, label: '가전제품 착지 파문 · 작동 연출 없음', shape: 'ring' })
assign('airplane airplane-biplane paper-airplane hand-fan speed-course racing-flag', wind)
assign('tumbler kids-bottle milk-carton strawberry-milk beer-bottle', closedContainer)
assign('shampoo-bottle bubble-bottle rubber-gloves', { ...bubbles, trigger: SURFACE })

const reflection: ItemEffect = { ...stars, trigger: SURFACE, motion: 'scatter', directionMode: 'radial', label: '작게 흩어지는 반사광' }
/** Explicit visual families. IDs are checked against the catalog in tests. */
export const EFFECT_GROUPS = [
  { id: 'flowers', label: '꽃잎', effect: petals, ids: ['sunflower', 'lucky-flowerpot'] },
  { id: 'leaves', label: '나뭇잎', effect: { ...petals, label: '빙글 도는 초록 잎', palette: ['#7baf68', '#bdc979'] }, ids: ['clover', 'clover-lucky', 'leaf', 'pine-tree', 'terrarium', 'hanging-terrarium'] },
  { id: 'autumn', label: '가을 잎', effect: { ...petals, label: '팔랑이는 단풍잎', palette: ['#ca703e', '#e6b854'] }, ids: ['leaf-maple'] },
  { id: 'crumbs', label: '빵과 과자', effect: { ...chip, label: '톡톡 튀는 과자 부스러기', palette: ['#d9a65f', '#f1cd8b'], size: 0.09 }, ids: ['biscuit', 'fish-bread', 'chocolate-donut', 'french-fries', 'macaron', 'macaron-bear', 'picnic-basket', 'pub-platter'] },
  { id: 'warm', label: '따뜻한 음식', effect: steam, ids: ['octopus', 'fried-egg', 'sausage', 'pizza-slice', 'lunchbox-bear-omelet-rice', 'bento', 'americano'] },
  { id: 'drinks', label: '물과 음료', effect: droplet, ids: ['iced-drink', 'cocktail', 'beer', 'beer-bottle', 'americano-iced', 'tumbler', 'kids-bottle', 'watering-can', 'umbrella-folded'] },
  { id: 'winter', label: '눈과 얼음', effect: { ...stars, motion: 'scatter', label: '천천히 내려앉는 얼음 결정', palette: ['#d4eef5', '#ffffff'], gravity: 0.55, flutter: 0.6 }, ids: ['snowflake', 'snow-globe', 'ice-cream-cone'] },
  { id: 'magic', label: '별과 마법', effect: stars, ids: ['magic-wand', 'winged-wand', 'magic-book', 'gold-star', 'shooting-star', 'stardust', 'crescent-moon', 'christmas-tree', 'treasure-chest'] },
  { id: 'digital', label: '전자기기', effect: pixels, ids: ['laptop', 'laptop-closed', 'smartphone', 'keyboard', 'internet-router', 'smartwatch', 'alarm-clock-digital', 'tv-remote', 'camera', 'digital-camera', 'traffic-light'] },
  { id: 'bubbles', label: '비누와 청소', effect: bubbles, ids: ['bubble-bottle', 'shampoo-bottle', 'cleaning-set', 'rubber-gloves'] },
  { id: 'soft', label: '옷과 털', effect: { ...puff, label: '천천히 퍼지는 솜털', palette: ['#eae0ce', '#d5c7b4'], gravity: -0.25, wave: 'none' }, ids: ['scarf', 'wool-hat', 'wool-hat-nordic-earflap', 'blue-shirt', 'rabbit', 'squirrel', 'school-backpack', 'art-bag', 'graduation-cap', 'quill-feather'] },
  { id: 'wind', label: '바람과 비행', effect: { ...steam, label: '뒤로 흘러가는 바람 결', palette: ['#d1e3dc', '#f3eada'], gravity: -0.1, speed: 1.1 }, ids: ['airplane', 'airplane-biplane', 'paper-airplane', 'hand-fan', 'speed-course', 'racing-flag'] },
  { id: 'grains', label: '곡물과 씨앗', effect: grain, ids: ['rice-plant', 'sunflower-seed', 'triangle-gimbap'] },
  { id: 'lights', label: '빛과 조명', effect: light, ids: ['flashlight', 'desk-lamp', 'gooseneck-lamp', 'candle', 'sunlight'] },
  { id: 'sound', label: '소리와 진동', effect: sound, ids: ['speaker', 'headphones', 'alarm-clock'] },
  { id: 'gas', label: '연기와 기체', effect: steam, ids: ['fart-cloud', 'burnt-hole-shirt'] },
  { id: 'soil', label: '흙과 모래', effect: contact, ids: ['cactus', 'cactus-mexican-character', 'footprints', 'footprints-dinosaur'] },
  { id: 'propulsion', label: '추진과 부양', effect: wind, ids: ['spaceship', 'spaceship-saucer'] },
  { id: 'reflection', label: '보석과 반사광', effect: reflection, ids: ['crystal', 'diamond-ring', 'heart-ring', 'mirror-ball', 'hand-mirror', 'window', 'round-glasses', 'gold-medal', 'sports-trophy', 'explorer-badge'] },
] as const satisfies readonly { id: string; label: string; effect: ItemEffect; ids: readonly string[] }[]
const FAMILY_EFFECTS = new Map<string, ItemEffect>(EFFECT_GROUPS.flatMap((group) => group.ids.map((id) => [id, group.effect] as const)))

assign('hand-mirror window round-glasses', MATERIAL_EFFECTS.glass)
assign('crystal', { ...reflection, palette: ['#b39ade', '#dac7f1'] })

/** Lost-property room art direction: quiet at rest, small material reactions on events. */
export const MAGIC_EFFECT_IDS = new Set(['magic-wand', 'winged-wand', 'magic-book', 'stardust', 'mirror-door'])
const conceptCache = new Map<string, ItemEffect>()
export function itemEffect(variant: Pick<ItemVariant, 'id' | 'material'> | undefined): ItemEffect {
  const key = variant?.id ?? 'fallback'
  const cached = conceptCache.get(key)
  if (cached !== undefined) return cached
  const source = variant === undefined ? chip : REVIEWED_EFFECTS.get(variant.id) ?? ITEM_EFFECTS[variant.id] ?? FAMILY_EFFECTS.get(variant.id) ?? MATERIAL_EFFECTS[variant.material]
  const magic = MAGIC_EFFECT_IDS.has(key)
  let effect: ItemEffect = { ...source, trigger: SURFACE, wave: 'none',
    count: Math.min(source.count, magic ? 7 : 4), size: source.size * (magic ? 0.85 : 0.7),
    speed: source.speed * 0.6, life: Math.min(source.life, magic ? 0.85 : 0.65), flutter: source.flutter * 0.65 }
  if (source.shape === 'pixel' || source.shape === 'ring' || ['shampoo-bottle', 'rubber-gloves'].includes(key)) {
    effect = { ...effect, shape: 'puff', anchor: 'contact', motion: 'scatter', directionMode: 'radial',
      palette: ['#caba9d', '#e6dcc2'], label: '접점에서 살짝 이는 먼지', size: 0.045, count: 2, speed: 0.3, gravity: 0.3, life: 0.3 }
  } else if (!magic && (source.shape === 'star' || (source.shape === 'spark' && key !== 'pine-tree'))) {
    effect = { ...effect, shape: 'spark', motion: 'pulse', directionMode: 'radial',
      label: '표면에 잠깐 맺히는 반사광', size: 0.045, speed: 0, count: 2, life: 0.24, gravity: 0 }
  }
  if (variant !== undefined && ['cloth', 'rubber', 'squish', 'plastic'].includes(variant.material) && effect.shape === 'puff') {
    effect = { ...effect, label: '가볍게 이는 접촉 먼지', anchor: 'contact', size: Math.min(effect.size, 0.055), count: 2, speed: 0.3 }
  }
  if (key === 'soccer-ball') effect = { ...effect, label: '착지 순간의 작은 먼지', anchor: 'contact', count: 2, size: 0.05 }
  if (effect.shape === 'steam') effect = { ...effect, label: magic ? '잠깐 번지는 마법의 기운' : source.label, count: magic ? 5 : 3, speed: 0.2, size: source.size * 0.65 }
  conceptCache.set(key, effect)
  return effect
}
