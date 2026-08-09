/**
 * 물건이 얹히는 순간 화면에 번지는 색.
 *
 * 물건마다 소리가 다르고 튐이 다른데 **보이는 것은 다 같았다.** 어떤 물건이 얹혔는지는
 * 그림으로만 알 수 있고, 그때 눈은 다음 단어를 쫓고 있어서 화면 가운데를 못 본다 —
 * 낙하음을 재질마다 다르게 만든 것과 같은 이유로, 얹히는 순간을 눈 구석에서도
 * 알아챌 수 있어야 한다.
 *
 * ## 색은 물건이 갖고 온다
 *
 * `words.ts`의 `color`를 쓴다. 107종에 서로 다른 값이 94가지라 그대로 특색이 된다.
 *
 * **재질로 묶지 않는다.** 소리는 재질이 정하는 게 맞지만 색은 아니다 — `metal` 21종에
 * 청록 텀블러·노란 금별·파란 주전자·초록 자전거·빨간 다리미가 다 들어 있어서, 재질로
 * 색을 정하면 물건과 화면이 어긋난다. 귀에는 "같은 금속"이 맞고 눈에는 아니다.
 *
 * ## 밝기는 맞추고 색조만 남긴다
 *
 * 물건 색을 그대로 쓰면 **짙은 물건이 아무 일도 하지 않는다.** 배경이 어두운 남색이라
 * 짙은 갈색(`#4a3a2a`)이나 남회색(`#3a3f52`)을 더해도 눈에 보이는 변화가 없다.
 * 그러면 특색이 "색이 다르다"가 아니라 "밝은 물건만 보인다"가 된다.
 *
 * 그래서 색조와 선명함은 물건에서 가져오고 **밝기만 한 값으로 맞춘다.** 세기를 말하는
 * 것은 색이 아니라 부딪힌 힘이어야 한다 — 그쪽은 알파가 맡는다.
 *
 * 선명함은 올리지 않는다. 흰 물건(`#f2f2f2`)에 색조를 만들어주면 그림에 없는 색이
 * 화면에 뜬다. 하얀 것은 하얗게 번지는 것이 맞다.
 */

interface Rgb {
  readonly r: number
  readonly g: number
  readonly b: number
}

/**
 * 화면에 덮는 색의 밝기. HSL의 L이다.
 *
 * **곱으로 덮는 색이라 낮을수록 진하다.** 1이면 아무 일도 없고 0이면 화면이 검어진다.
 * 0.45는 그 사이에서 색조가 살아 있는 자리다 — 더 낮추면 무슨 색인지 읽히기 전에
 * 어두워지는 것만 보인다.
 *
 * 예전에는 0.6이었고 근거가 "어두운 배경(`#262b3d`) 위에 **더하는** 색"이었다.
 * 배경이 방 그림으로 바뀌며 그 전제가 통째로 뒤집혔다 — 아래 `GLOW_PEAK_ALPHA`에.
 */
const GLOW_LIGHTNESS = 0.45

/**
 * 반짝임 부스러기의 밝기. 화면에 덮는 색과 **반대 방향**이다.
 *
 * 반짝임은 물감이 아니라 **빛**이라 밝아야 하고, 무엇보다 배경보다 밝아야 보인다.
 * 잰 값으로 물건이 쌓이는 자리의 배경 휘도가 **155**인데 예전 값(0.6 = 153)은
 * 그것과 **차이가 2**였다 — 색조만 다르고 밝기가 같아서 사실상 안 보였다.
 * 0.88이면 224라 62만큼 밝다.
 *
 * 색번짐과 상수를 나눈 이유가 여기 있다. 하나였을 때는 한쪽을 고치면 다른 쪽이
 * 망가졌는데, **둘이 원하는 방향이 서로 반대**다.
 */
const SPARKLE_LIGHTNESS = 0.88

/**
 * 가장 세게 부딪혔을 때의 알파.
 *
 * **"있는지 없는지 겨우 알" 만큼이 맞는 값이다.** 화면 전체를 덮는 색이라 조금만
 * 진해도 눈이 먼저 피로해지고, 낙하 단어의 대비까지 함께 깎는다. 판을 오래 하는
 * 게임에서 연출이 눈을 지치게 하면 그 연출은 결국 끄게 된다.
 *
 * **0.085에서 올렸다.** 그 값은 배경이 단색 `#0d0f16`(휘도 43)이던 때 **빛을 더해**
 * 잡은 것이라, 배경이 방 그림이 되자 아무 일도 일어나지 않았다.
 *
 * | 배경 | 방식 | 알파 | 변화 |
 * |---|---|---|---|
 * | 43 (예전 단색) | 더하기 | 0.085 | +22% |
 * | 155 (지금, 물건이 쌓이는 자리) | 더하기 | 0.085 | **0%** |
 * | 155 | 곱하기 | 0.085 | −5% |
 * | 155 | **곱하기** | **0.22** | **−12%** |
 *
 * **곱으로 바꾼 것이 요점이다.** 더하기는 배경이 밝을수록 여지가 줄지만(255가 상한)
 * 곱하기는 **비율로 움직여 배경 밝기와 무관하다** — 43이든 155든 −12%로 같다.
 * 그래서 낮과 밤에 다른 값을 쓸 필요가 없어졌다.
 */
const GLOW_PEAK_ALPHA = 0.22
/**
 * 가장 약하게 얹혔을 때의 알파.
 *
 * 0으로 두지 않는 이유는, 살짝 얹히는 것도 얹힌 것이기 때문이다. 빛나는 물건은
 * 드물게 오므로 그중 하나가 조용히 놓였다고 아무 일도 없으면 "왜 이번엔 안 물들지"가
 * 된다 — 규칙이 흔들리는 쪽이 연출이 약한 쪽보다 나쁘다.
 */
const GLOW_MIN_ALPHA = 0.08

/*
 * 낮과 밤을 가르던 `GLOW_ADDITIVE_NIGHT`·`GLOW_DAY_GAIN`·`glowAdditive`를 걷어냈다.
 *
 * 그 값들은 "밤은 어두우니 빛을 더하고 낮은 밝으니 곱으로 덮는다"였는데, **곱하기는
 * 배경 밝기와 무관하게 비율로 움직인다.** 어느 쪽이든 −12%라 가를 이유가 없다.
 *
 * 재보니 가를 근거 자체도 약했다 — 아트 v2에서 밤 배경이 밝기 54에서 **106**이 됐고,
 * 무엇보다 **물건이 쌓이는 자리는 낮과 밤이 똑같이 155**다(형광등이 켜져서 아래쪽은
 * 안 어두워진다). 어두워지는 것은 벽 위쪽뿐이다.
 */

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1)
}

/** `#rgb` · `#rrggbb`를 0~1 성분으로. 읽을 수 없으면 null */
function parseHex(hex: string): Rgb | null {
  const body = hex.startsWith('#') ? hex.slice(1) : hex
  const full =
    body.length === 3
      ? [...body].map((char) => char + char).join('')
      : body.length === 6
        ? body
        : null
  if (full === null || !/^[0-9a-fA-F]{6}$/.test(full)) {
    return null
  }
  return {
    r: Number.parseInt(full.slice(0, 2), 16) / 255,
    g: Number.parseInt(full.slice(2, 4), 16) / 255,
    b: Number.parseInt(full.slice(4, 6), 16) / 255,
  }
}

/**
 * 색조와 선명함은 그대로 두고 밝기만 `GLOW_LIGHTNESS`로 옮긴다.
 *
 * HSL을 거치지 않고 성분을 직접 늘리고 줄인다 — 색조를 각도로 바꿔 되돌리는 과정에서
 * 회색(색조가 정의되지 않는 색)이 엉뚱한 색으로 튀는 것을 피하려는 것이다.
 * 최소·최대 성분의 중간을 밝기로 보고, 그 중간을 목표로 옮기며 폭을 함께 조인다.
 */
function normalizeLightness(color: Rgb, target: number): Rgb {
  const low = Math.min(color.r, color.g, color.b)
  const high = Math.max(color.r, color.g, color.b)
  const lightness = (low + high) / 2
  const spread = high - low
  if (spread === 0) {
    // 회색은 색조가 없다. 밝기만 옮긴다
    return { r: target, g: target, b: target }
  }
  /*
   * 선명함(HSL의 S)을 지키려면 폭이 밝기에 따라 달라져야 한다 — 같은 S라도
   * 밝기가 0.5에서 멀어질수록 담을 수 있는 폭이 좁아진다.
   */
  const saturation = spread / (1 - Math.abs(2 * lightness - 1))
  const nextSpread = saturation * (1 - Math.abs(2 * target - 1))
  const scale = nextSpread / spread
  const shift = target - lightness * scale
  return {
    r: clamp01(color.r * scale + shift),
    g: clamp01(color.g * scale + shift),
    b: clamp01(color.b * scale + shift),
  }
}

/** 물건 색을 화면에 덮을 색으로. 읽을 수 없는 색이면 무채색으로 떨어진다 */
function glowColor(hex: string): Rgb {
  return toLightness(hex, GLOW_LIGHTNESS)
}

/** 물건 색을 반짝임 부스러기 색으로. 배경보다 밝아야 하므로 색번짐과 방향이 반대다 */
function sparkleColor(hex: string): Rgb {
  return toLightness(hex, SPARKLE_LIGHTNESS)
}

function toLightness(hex: string, lightness: number): Rgb {
  const parsed = parseHex(hex)
  if (parsed === null) {
    return { r: lightness, g: lightness, b: lightness }
  }
  return normalizeLightness(parsed, lightness)
}

/**
 * 지금 얼마나 진하게 번져 있는가.
 *
 * `progress`는 0(닿은 순간) → 1(다 사라짐), `strength`는 부딪힌 세기 0~1이다.
 * 사라지는 곡선을 제곱으로 두는 이유는, 선형으로 빼면 끝까지 옅은 색이 남아 **화면이
 * 늘 물들어 있는 것처럼** 보이기 때문이다. 처음에 훅 빠지고 꼬리가 짧아야 "번쩍"이 된다.
 */
function glowAlpha(progress: number, strength: number): number {
  if (progress >= 1 || progress < 0) {
    return 0
  }
  const peak =
    GLOW_MIN_ALPHA + (GLOW_PEAK_ALPHA - GLOW_MIN_ALPHA) * clamp01(strength)
  const fade = 1 - progress
  return peak * fade * fade
}

/** 캔버스에 넘길 문자열. 알파가 0이면 그리지 않아야 하므로 부르는 쪽이 먼저 본다 */
function glowStyle(color: Rgb, alpha: number): string {
  const to255 = (value: number): number => Math.round(value * 255)
  return `rgba(${to255(color.r)}, ${to255(color.g)}, ${to255(color.b)}, ${alpha})`
}

export {
  glowAlpha,
  glowColor,
  sparkleColor,
  glowStyle,
  GLOW_LIGHTNESS,
  SPARKLE_LIGHTNESS,
  GLOW_PEAK_ALPHA,
  GLOW_MIN_ALPHA,
}
export type { Rgb }
