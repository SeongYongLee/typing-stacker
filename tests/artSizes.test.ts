import { describe, expect, it } from 'vitest'
import { MAX_ITEM_HALF_WIDTH, QUAKE_MIN_SIZE } from '../src/game/config.ts'
import { ALL_VARIANTS } from '../src/game/data/words.ts'

/**
 * 물건이 화면에 그려지는 크기를 **적어둔 표**.
 *
 * ## 왜 적어두나
 *
 * `words.ts`는 크기를 **한 변만** 적는다(`{ width: 0.72 }` 또는 `{ height: 0.5 }`).
 * 나머지 한 변은 그림의 가로세로비에서 저절로 나온다 — 그래야 물건이 찌그러지지 않는다.
 *
 * 편한 만큼 위험하다. **그림을 다시 그리면 지정하지 않은 변이 혼자 움직인다.**
 * 2026-08-09 재작화에서 실제로 이렇게 됐다.
 *
 * | 물건 | 비율 | 지정한 변 | 따라온 변 |
 * |---|---|---|---|
 * | 도시락 | 0.9896 → 0.9479 | 가로 0.74 | 세로 0.748 → **0.781** |
 * | 여행앨범 | 0.838 → **1.5547** | 세로 0.55 | 가로 0.461 → **0.855** |
 *
 * 도시락은 흔들림 문턱(0.78)을 1000분의 1 넘겨 "가장 무거운데 작아서 안 흔들린다"는
 * 규칙을 깼고, 여행앨범은 세로형이 가로형으로 다시 그려져 폭이 거의 두 배가 되며
 * 재료보다 넓어졌다. 둘 다 **아무도 그 값을 고치지 않았는데** 벌어진 일이다.
 *
 * 두 변을 다 **지정**하면 그림이 눌리거나 늘어난다. 그래서 지정하는 대신 **적어둔다** —
 * 그리기는 그대로 비율을 따르고, 값이 움직이면 이 검사가 무엇이 얼마나 움직였는지 알린다.
 *
 * ## 아트가 새로 올 때
 *
 * 이 검사가 실패하면 그것이 곧 **다시 그려진 물건의 목록**이다. 실패 메시지에 새 표가
 * 통째로 찍히므로 그대로 갈아 넣으면 되지만, **갈아 넣기 전에 그 목록을 읽어야 한다** —
 * 문턱에 가까운 물건이 섞여 있으면 크기를 조정할 일이 함께 생긴다.
 */

/** [id, 가로, 세로] — 월드 단위. 소수점 셋째 자리까지 */
const DRAWN: readonly (readonly [string, number, number])[] = [
  ['airplane', 1.060, 0.654],
  ['airplane-biplane', 1.000, 0.784],
  ['alarm-clock', 0.455, 0.580],
  ['alarm-clock-digital', 0.600, 0.331],
  ['americano', 0.679, 0.540],
  ['americano-iced', 0.363, 0.620],
  ['badminton-racket', 0.345, 0.920],
  ['baseball-bat', 0.703, 0.850],
  ['beer', 0.537, 0.620],
  ['beer-bottle', 0.236, 0.680],
  ['bento', 0.740, 0.781],
  ['bicycle', 1.060, 0.654],
  ['bicycle-folding', 0.780, 0.606],
  ['binoculars', 0.680, 0.491],
  ['blue-shirt', 0.700, 0.581],
  ['bolt', 0.586, 0.800],
  ['broom', 0.627, 0.850],
  ['burnt-hole-shirt', 0.700, 0.589],
  ['butterfly', 0.600, 0.401],
  ['cactus', 0.536, 0.700],
  ['cactus-mexican-character', 0.465, 0.720],
  ['camera', 0.550, 0.427],
  ['candle', 0.412, 0.550],
  ['chocolate-donut', 0.580, 0.467],
  ['christmas-tree', 0.735, 0.960],
  ['clothes-hanger', 0.750, 0.513],
  ['clover', 0.404, 0.420],
  ['clover-lucky', 0.386, 0.440],
  ['cocktail', 0.493, 0.620],
  ['compass', 0.400, 0.390],
  ['crank-sharpener', 0.580, 0.527],
  ['crescent-moon', 0.846, 1.000],
  ['cricket', 0.520, 0.279],
  ['desk-globe', 0.528, 0.700],
  ['desk-lamp', 0.527, 0.780],
  ['desk-phone', 0.640, 0.493],
  ['digital-camera', 0.600, 0.375],
  ['dinosaur-toy', 0.780, 0.739],
  ['dinosaur-toy-triceratops', 0.820, 0.585],
  ['egg', 0.316, 0.400],
  ['electric-kettle', 0.699, 0.720],
  ['electric-kettle-gooseneck', 0.761, 0.660],
  ['fart-cloud', 0.550, 0.280],
  ['fire-extinguisher', 0.463, 0.780],
  ['first-aid-kit', 0.640, 0.555],
  ['fish-bread', 0.600, 0.460],
  ['flashlight', 0.620, 0.367],
  ['footprints', 0.263, 0.550],
  ['footprints-dinosaur', 0.630, 0.550],
  ['french-fries', 0.483, 0.620],
  ['fried-egg', 0.700, 0.587],
  ['frying-pan', 0.860, 0.417],
  ['glass-shards', 0.550, 0.435],
  ['gold-medal', 0.250, 0.400],
  ['gold-star', 0.400, 0.396],
  ['gooseneck-lamp', 0.555, 0.800],
  ['graduation-cap', 0.700, 0.443],
  ['hand-mirror', 0.382, 0.550],
  ['handheld-sharpener', 0.420, 0.395],
  ['headphones', 0.553, 0.660],
  ['heart', 0.400, 0.380],
  ['heart-ring', 0.400, 0.277],
  ['ice-cream-cone', 0.320, 0.660],
  ['iced-drink', 0.399, 0.580],
  ['internet-router', 0.550, 0.445],
  ['iron', 0.550, 0.426],
  ['keyboard', 0.700, 0.366],
  ['ladybug', 0.350, 0.440],
  ['laptop', 0.880, 0.855],
  ['laptop-closed', 0.800, 0.429],
  ['laundry-basket', 0.780, 0.564],
  ['leaf', 0.379, 0.460],
  ['leaf-maple', 0.456, 0.500],
  ['lunchbox-bear-omelet-rice', 0.700, 0.706],
  ['magic-wand', 0.523, 0.550],
  ['map-world-map', 0.620, 0.394],
  ['microwave', 0.880, 0.610],
  ['milk-carton', 0.448, 0.580],
  ['milk-vintage-cart', 0.757, 0.580],
  ['mirror-ball', 0.766, 0.850],
  ['octopus', 0.580, 0.687],
  ['old-key', 0.400, 0.222],
  ['padlock', 0.318, 0.400],
  ['paper-airplane', 0.550, 0.327],
  ['pine-tree', 0.766, 0.920],
  ['pizza-box', 0.980, 0.889],
  ['pizza-slice', 0.720, 0.624],
  ['quill-feather', 0.404, 0.550],
  ['rabbit', 0.700, 0.679],
  ['racing-flag', 0.764, 0.850],
  ['refrigerator', 0.727, 1.040],
  ['rice-plant', 0.872, 0.850],
  ['robot-vacuum', 0.780, 0.628],
  ['roller-skates', 0.780, 0.636],
  ['round-glasses', 0.550, 0.192],
  ['rubber-gloves', 0.606, 0.720],
  ['salmon-fish', 0.850, 0.308],
  ['salmon-sushi', 0.400, 0.261],
  ['sausage', 0.660, 0.324],
  ['scarf', 0.871, 0.680],
  ['school-backpack', 0.736, 0.800],
  ['secret-diary', 0.455, 0.550],
  ['shampoo-bottle', 0.311, 0.660],
  ['shooting-star', 1.000, 0.891],
  ['smartphone', 0.428, 0.640],
  ['smartwatch', 0.324, 0.500],
  ['snail', 0.700, 0.418],
  ['snail-curled', 0.560, 0.413],
  ['sneakers', 0.740, 0.507],
  ['soccer-ball', 0.640, 0.632],
  ['spaceship', 1.000, 1.128],
  ['speaker', 0.586, 0.780],
  ['spider-web', 0.640, 0.700],
  ['squirrel', 0.640, 0.588],
  ['stardust', 0.455, 0.550],
  ['stick-vacuum', 0.477, 0.920],
  ['strawberry-milk', 0.480, 0.580],
  ['study-book', 0.550, 0.546],
  ['sunflower', 0.627, 0.820],
  ['sunflower-seed', 0.279, 0.400],
  ['sunglasses', 0.580, 0.263],
  ['sunglasses-black-narrow-frame', 0.580, 0.186],
  ['sunlight', 1.000, 0.979],
  ['telescope', 0.834, 0.850],
  ['telescope-spyglass', 0.720, 0.421],
  ['tissue-box', 0.600, 0.522],
  ['toilet-paper', 0.410, 0.470],
  ['toy-train', 0.800, 0.704],
  ['toy-train-bullet-train', 0.860, 0.302],
  ['traffic-light', 0.390, 0.920],
  ['trash-bin', 0.613, 0.780],
  ['travel-album', 0.855, 0.550],
  ['travel-suitcase', 0.633, 0.850],
  ['treasure-chest', 0.850, 0.748],
  ['treasure-map', 0.550, 0.450],
  ['triangle-gimbap', 0.470, 0.422],
  ['tumbler', 0.400, 0.700],
  ['turtle', 0.700, 0.452],
  ['turtle-sea-turtle', 0.800, 0.662],
  ['tv-remote', 0.283, 0.640],
  ['umbrella', 0.968, 0.900],
  ['umbrella-folded', 0.624, 0.800],
  ['washing-machine', 0.802, 0.940],
  ['watering-can', 0.740, 0.634],
  ['window', 0.787, 0.850],
  ['wool-hat', 0.568, 0.620],
  ['wool-hat-nordic-earflap', 0.467, 0.660],
  ['wristwatch', 0.358, 0.470],
]

/** 재작화로 이만큼 넘게 움직이면 알린다. 반올림 오차만 흡수하는 폭이다 */
const TOLERANCE = 0.002

describe('그려지는 크기', () => {
  it('적어둔 값과 같다', () => {
    const recorded = new Map(DRAWN.map(([id, w, h]) => [id, { w, h }]))
    const drifted: string[] = []
    for (const item of ALL_VARIANTS) {
      const want = recorded.get(item.id)
      if (want === undefined) {
        continue
      }
      const w = item.artBounds.hw * 2
      const h = item.artBounds.hh * 2
      if (Math.abs(w - want.w) > TOLERANCE || Math.abs(h - want.h) > TOLERANCE) {
        drifted.push(
          `${item.label}(${item.id}) ${want.w.toFixed(3)}x${want.h.toFixed(3)}` +
            ` → ${w.toFixed(3)}x${h.toFixed(3)}`,
        )
      }
    }
    expect(
      drifted,
      `그려지는 크기가 움직였다. 그림을 다시 그렸다면 아래 표를 갈아 넣기 전에 목록을 읽을 것:\n` +
        drifted.map((line) => `  ${line}`).join('\n') +
        '\n\n새 표:\n' +
        [...ALL_VARIANTS]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map(
            (v) =>
              `  ['${v.id}', ${(v.artBounds.hw * 2).toFixed(3)}, ${(v.artBounds.hh * 2).toFixed(3)}],`,
          )
          .join('\n'),
    ).toEqual([])
  })

  /** 표에 없는 물건이 생기면 그 물건만 이 검사를 조용히 빠져나간다 */
  it('모든 물건이 표에 있다', () => {
    const recorded = new Set(DRAWN.map(([id]) => id))
    const missing = ALL_VARIANTS.filter((item) => !recorded.has(item.id)).map((item) => item.id)
    expect(missing, `표에 없는 물건: ${missing.join(', ')}`).toEqual([])
  })

  it('없어진 물건이 표에 남아 있지 않다', () => {
    const known = new Set(ALL_VARIANTS.map((item) => item.id))
    const stale = DRAWN.map(([id]) => id).filter((id) => !known.has(id))
    expect(stale, `없어진 물건: ${stale.join(', ')}`).toEqual([])
  })
})

/**
 * 크기에 걸려 있는 문턱들.
 *
 * 위의 표가 "무엇이 움직였나"를 알린다면 이쪽은 **"움직여서 무엇이 깨지나"**를 지킨다.
 * 표만 갱신하고 지나가도 이 검사들이 남아 있어야 규칙이 조용히 뒤집히지 않는다.
 */
describe('크기에 걸린 문턱', () => {
  /** 조준 범위가 이 값에서 나온다. 넘으면 조준 끝에서 즉사한다 */
  it('가장 넓은 물건이 조준 상한 안에 있다', () => {
    for (const item of ALL_VARIANTS) {
      expect(item.artBounds.hw, item.id).toBeLessThanOrEqual(MAX_ITEM_HALF_WIDTH)
    }
  })

  /**
   * 도시락은 **가장 무거운데 그림이 작아서** 흔들지 않는다 — 흔들림을 무게가 아니라
   * 보이는 크기로 판정하는 규칙이 이 물건에서 시작됐다. 재작화 때마다 여기가 뒤집힌다.
   */
  it('도시락은 흔들림 문턱 아래에 있다', () => {
    const bento = ALL_VARIANTS.find((item) => item.id === 'bento')
    expect(bento).toBeDefined()
    const size = Math.max(bento!.artBounds.hw, bento!.artBounds.hh) * 2
    expect(size, `도시락 ${size.toFixed(3)} / 문턱 ${QUAKE_MIN_SIZE}`).toBeLessThan(QUAKE_MIN_SIZE)
  })
})
