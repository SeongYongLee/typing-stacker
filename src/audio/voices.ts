import { HEAVY_MASS } from '../game/config.ts'
import type { Material } from '../game/types/game.ts'
import { HIDDEN_REVEAL_PRE_GAIN } from './outputLevels.ts'

/**
 * 소리를 코드로 만든다. 오디오 파일은 하나도 쓰지 않는다.
 *
 * 파일 대신 합성을 고른 이유는 번들이나 라이선스보다 **값을 이어붙일 수 있어서**다.
 * 부딪힌 세기가 곧 음량과 길이가 되고, 물건의 크기가 곧 음높이가 된다. 녹음된
 * 소리로 같은 것을 하려면 세기 단계마다 파일을 따로 두고 골라야 한다.
 *
 * 여기 있는 함수들은 전부 "지금부터 이런 소리를 예약한다"이고, 예약이 끝나면
 * 노드는 스스로 멈춰 GC된다. 재생 중인 것을 들고 있지 않으므로 정리할 것도 없다.
 */

/** 소리 하나를 예약하는 데 필요한 것들 */
interface Voice {
  readonly ctx: AudioContext
  readonly out: AudioNode
  readonly noise: AudioBuffer
  /** 이 소리가 시작할 시각(컨텍스트 기준) */
  readonly at: number
}

/** 소리가 완전히 사라지기 전에 노드를 끊지 않도록 두는 여유 */
const TAIL = 0.03

/** 지수 램프는 0에 닿을 수 없다. 사실상 무음인 최솟값 */
const SILENT = 0.0001

interface ToneOptions {
  readonly type: OscillatorType
  readonly freq: number
  /** 있으면 duration에 걸쳐 여기까지 미끄러진다 */
  readonly toFreq?: number
  readonly gain: number
  readonly duration: number
  readonly delay?: number
  readonly attack?: number
  /** 센트 단위. 살짝 어긋난 둘을 겹치면 소리가 두꺼워진다 */
  readonly detune?: number
}

/** 음 하나 */
function tone(voice: Voice, options: ToneOptions): void {
  const { ctx } = voice
  const start = voice.at + (options.delay ?? 0)
  const end = start + options.duration
  /*
   * 기본 어택을 넉넉히 둔다. 소리가 날카롭게 들리는 이유의 절반은 시작이 너무
   * 가팔라서다 — 순간적으로 0에서 최대로 뛰면 그 자체가 클릭 잡음을 만든다.
   * 개별 소리가 더 또렷해야 하면 그때만 낮춘다.
   */
  const attack = Math.min(options.attack ?? 0.012, options.duration * 0.5)

  const osc = ctx.createOscillator()
  osc.type = options.type
  osc.frequency.setValueAtTime(options.freq, start)
  if (options.toFreq !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(options.toFreq, 1), end)
  }
  if (options.detune !== undefined) {
    osc.detune.value = options.detune
  }

  const envelope = ctx.createGain()
  envelope.gain.setValueAtTime(SILENT, start)
  envelope.gain.exponentialRampToValueAtTime(Math.max(options.gain, SILENT), start + attack)
  envelope.gain.exponentialRampToValueAtTime(SILENT, end)

  osc.connect(envelope).connect(voice.out)
  osc.start(start)
  osc.stop(end + TAIL)
}

interface BurstOptions {
  readonly filter: BiquadFilterType
  readonly freq: number
  readonly toFreq?: number
  readonly q?: number
  readonly gain: number
  readonly duration: number
  readonly delay?: number
  readonly attack?: number
}

/** 잡음 한 조각. 부딪힘의 "탁"과 낙하의 바람이 전부 여기서 나온다 */
function burst(voice: Voice, options: BurstOptions): void {
  const { ctx } = voice
  const start = voice.at + (options.delay ?? 0)
  const end = start + options.duration
  const attack = Math.min(options.attack ?? 0.006, options.duration * 0.5)

  const source = ctx.createBufferSource()
  source.buffer = voice.noise
  // 한 통을 돌려 쓰므로 시작 위치를 옮겨 매번 다른 조각이 들리게 한다
  const offset = (start * 7.3) % Math.max(voice.noise.duration - options.duration, 0.01)

  const filter = ctx.createBiquadFilter()
  filter.type = options.filter
  filter.frequency.setValueAtTime(options.freq, start)
  if (options.toFreq !== undefined) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(options.toFreq, 1), end)
  }
  if (options.q !== undefined) {
    filter.Q.value = options.q
  }

  const envelope = ctx.createGain()
  envelope.gain.setValueAtTime(SILENT, start)
  envelope.gain.exponentialRampToValueAtTime(Math.max(options.gain, SILENT), start + attack)
  envelope.gain.exponentialRampToValueAtTime(SILENT, end)

  source.connect(filter).connect(envelope).connect(voice.out)
  source.start(start, offset, options.duration + TAIL)
  source.stop(end + TAIL)
}

/** MIDI 번호를 주파수로. 음을 숫자로 적으면 화음이 눈에 보인다 */
function hz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * 글자 하나가 들어왔다.
 *
 * 이 게임에서 가장 자주 나는 소리다 — 1분에 300번도 난다. 그래서 음정이 없는
 * 짧은 소리로 둔다. 음이 있으면 빠르게 칠 때 멜로디처럼 들리면서 귀에 걸린다.
 *
 * 처음에는 2.6kHz를 통과시키는 밝은 클릭이었는데 가장 뾰족한 소리가 됐다.
 * 자주 나는 소리일수록 낮고 둔해야 한다 — 실제 키보드의 타건음도 저역이다.
 */
function typeTick(voice: Voice): void {
  burst(voice, {
    filter: 'lowpass',
    freq: 760,
    q: 0.7,
    gain: 0.03,
    duration: 0.034,
    attack: 0.006,
  })
}

/** 단어를 맞췄다. 콤보가 쌓일수록 음이 올라간다 */
function wordHit(voice: Voice, combo: number): void {
  /*
   * 온음계로 올리면 8콤보쯤에서 귀에 거슬리는 음이 나온다. 5음계(펜타토닉)는
   * 어느 음끼리 겹쳐도 어긋나지 않아서, 연달아 맞출 때 저절로 듣기 좋은 흐름이 된다.
   *
   * 기준음을 한 옥타브 내렸다. 위쪽에서 시작하면 콤보가 쌓일수록 2kHz를 넘어가
   * "잘하고 있다"는 신호가 오히려 가장 듣기 싫은 소리가 된다.
   */
  const steps = [0, 2, 4, 7, 9, 12, 14, 16, 19]
  const step = steps[clamp(combo - 1, 0, steps.length - 1)] ?? 0
  const base = hz(64 + step)

  tone(voice, { type: 'sine', freq: base, gain: 0.075, duration: 0.17, attack: 0.014 })
  // 배음을 아주 옅게만 얹는다. 몸통은 사인이 만들고 이건 윤곽만 준다
  tone(voice, { type: 'triangle', freq: base * 2, gain: 0.012, duration: 0.1, attack: 0.02 })
}

/** 아무 단어와도 맞지 않았다. 낮고 짧게 — 실수는 알리되 벌주지 않는다 */
function wordMiss(voice: Voice): void {
  // 톱니파는 배음이 촘촘해 그것만으로 거슬린다. 삼각파로 바꾸고 음량도 내렸다
  tone(voice, {
    type: 'triangle',
    freq: 178,
    toFreq: 112,
    gain: 0.055,
    duration: 0.2,
    attack: 0.012,
  })
  burst(voice, { filter: 'lowpass', freq: 420, toFreq: 200, gain: 0.024, duration: 0.14 })
}

/**
 * 재질마다 부딪힘의 성질이 다르다.
 *
 * `body`는 몸통 저음의 기준 음높이(Hz)이고 나머지는 그 위에 무엇을 얹을지다.
 * 실제 물건이 그렇듯 **단단할수록 높고 짧게, 무를수록 낮고 뭉근하게** 울린다.
 */
interface MaterialVoice {
  /** 몸통 저음의 기준. 물건 크기에 따라 여기서 더 내려간다 */
  readonly body: number
  /** 몸통이 울리는 길이(초). 짧으면 "톡", 길면 "웅" */
  readonly ring: number
  /** 몸통 음량 배수 */
  readonly bodyGain: number
  /** 몸통 위에 얹는 배음비. 비어 있으면 순수한 저음뿐이다 */
  readonly partials: readonly (readonly [ratio: number, gain: number, ring: number])[]
  /** 부딪히는 "탁"을 만드는 잡음 */
  readonly tick: {
    readonly filter: BiquadFilterType
    readonly freq: number
    readonly toFreq?: number
    readonly gain: number
    readonly duration: number
  } | null
  /** 음높이를 개체마다 몇 반음까지 밀지 */
  readonly spread: number
  /**
   * 울림 길이를 개체마다 ±몇 배까지 밀지. 0.5면 절반에서 1.5배까지 벌어진다.
   *
   * 음높이와 **다른 축**이라는 것이 요점이다. 같은 금속 21종이 음높이만 다르면
   * 한 소리를 조옮김한 것으로 들리는데, 짧게 끊기는 것과 길게 남는 것은 서로
   * 다른 물건으로 들린다 — 자물쇠와 물뿌리개가 그렇다.
   */
  readonly ringSpread: number
  /**
   * 잡음의 밝기를 개체마다 ±몇 배까지 밀지.
   *
   * 몸통이 거의 없는 재질(마른 것·천)은 잡음이 소리의 전부라, 그쪽에서는 이 축이
   * 울림 길이보다 크게 들린다. 그래서 재질마다 두 축의 몫이 다르다.
   */
  readonly tickSpread: number
}

const MATERIAL_VOICES: Readonly<Record<Material, MaterialVoice>> = {
  /* 유리 — 맑은 정수배 배음이 길게 남는다 */
  glass: {
    body: 210,
    ring: 0.3,
    bodyGain: 0.7,
    partials: [
      [2.02, 0.4, 0.5],
      [3.98, 0.16, 0.34],
    ],
    tick: { filter: 'highpass', freq: 1600, gain: 0.5, duration: 0.02 },
    spread: 9,
    ringSpread: 0.45,
    tickSpread: 0.25,
  },
  /* 금속 — 정수배가 아닌 배음이라 어긋난 채로 울린다. 그게 금속의 성질이다 */
  metal: {
    body: 165,
    ring: 0.42,
    bodyGain: 0.75,
    partials: [
      [2.76, 0.3, 0.6],
      [5.4, 0.1, 0.42],
    ],
    tick: { filter: 'bandpass', freq: 1900, gain: 0.4, duration: 0.025 },
    spread: 10,
    ringSpread: 0.5,
    tickSpread: 0.3,
  },
  /* 나무 — 배음 없이 짧게 끊긴다 */
  wood: {
    body: 190,
    ring: 0.1,
    bodyGain: 0.85,
    partials: [[2.4, 0.12, 0.06]],
    tick: { filter: 'lowpass', freq: 1400, gain: 0.55, duration: 0.02 },
    spread: 5,
    ringSpread: 0.4,
    tickSpread: 0.3,
  },
  /* 마른 것 — 몸통이 거의 없고 잡음이 전부다 */
  paper: {
    body: 240,
    ring: 0.05,
    bodyGain: 0.18,
    partials: [],
    tick: { filter: 'bandpass', freq: 2600, toFreq: 1100, gain: 0.7, duration: 0.09 },
    spread: 4,
    ringSpread: 0.3,
    // 이미 2.6kHz라 더 열면 뾰족해진다. 마른 것은 잡음 길이 쪽으로 갈린다
    tickSpread: 0.26,
  },
  /* 천 — 넷 중 가장 조용하다. 얹혔다는 것만 겨우 알린다 */
  cloth: {
    body: 120,
    ring: 0.07,
    bodyGain: 0.3,
    partials: [],
    tick: { filter: 'lowpass', freq: 320, gain: 0.5, duration: 0.05 },
    spread: 3,
    ringSpread: 0.3,
    // 몸통이 거의 없는 재질이라 갈라주는 것은 잡음뿐이다. 320Hz라 밝게 밀어도 안 뾰족하다
    tickSpread: 0.45,
  },
  /* 단단한 플라스틱 — 마른 "딱". 울림이 거의 없다 */
  plastic: {
    body: 230,
    ring: 0.09,
    bodyGain: 0.7,
    partials: [[3.1, 0.14, 0.05]],
    tick: { filter: 'bandpass', freq: 2100, gain: 0.5, duration: 0.018 },
    spread: 6,
    ringSpread: 0.4,
    tickSpread: 0.28,
  },
  /* 고무 — 음높이가 아래로 훅 떨어졌다 살짝 되돌아온다. 튀는 느낌은 거기서 온다 */
  rubber: {
    body: 150,
    ring: 0.16,
    bodyGain: 0.8,
    partials: [],
    tick: { filter: 'lowpass', freq: 700, gain: 0.3, duration: 0.03 },
    spread: 5,
    ringSpread: 0.35,
    tickSpread: 0.25,
  },
  /* 기계 — 무겁게 내려앉고 끝에 금속이 한 번 스친다 */
  tech: {
    body: 95,
    ring: 0.22,
    bodyGain: 1,
    partials: [[6.2, 0.07, 0.16]],
    tick: { filter: 'lowpass', freq: 900, gain: 0.45, duration: 0.03 },
    spread: 3,
    ringSpread: 0.35,
    tickSpread: 0.3,
  },
  /* 물컹한 것 — 음높이가 아래로 미끄러진다. "퍽" */
  squish: {
    body: 175,
    ring: 0.13,
    bodyGain: 0.6,
    partials: [],
    tick: { filter: 'lowpass', freq: 520, toFreq: 200, gain: 0.55, duration: 0.06 },
    spread: 9,
    ringSpread: 0.4,
    tickSpread: 0.35,
  },
  /* 번개 — 물건이 아니다. 잡음이 튀고 높은 음이 하나 남는다 */
  spark: {
    body: 380,
    ring: 0.2,
    bodyGain: 0.35,
    partials: [[2.5, 0.3, 0.26]],
    tick: { filter: 'highpass', freq: 2400, toFreq: 4200, gain: 0.6, duration: 0.07 },
    spread: 9,
    ringSpread: 0.35,
    // 이미 4.2kHz까지 열려 있다. 더 밀면 버스의 로우패스(5.2kHz)에 닿아 뾰족해진다
    tickSpread: 0.15,
  },
}

/** 재질마다 떨어지는 소리도 다르다. 무엇이 오는지 닿기 전에 들려야 한다 */
interface DropVoice {
  readonly filter: BiquadFilterType
  readonly from: number
  readonly to: number
  readonly q: number
  readonly gain: number
  readonly duration: number
}

const DROP_VOICES: Readonly<Record<Material, DropVoice>> = {
  // 맑은 것들은 높은 데서 훑고 지나간다
  glass: { filter: 'bandpass', from: 1800, to: 700, q: 1.4, gain: 0.03, duration: 0.26 },
  metal: { filter: 'bandpass', from: 1500, to: 600, q: 1.6, gain: 0.032, duration: 0.28 },
  // 마른 것은 바스락거리며 내려온다
  paper: { filter: 'bandpass', from: 2400, to: 1500, q: 0.6, gain: 0.036, duration: 0.34 },
  cloth: { filter: 'lowpass', from: 700, to: 300, q: 0.5, gain: 0.03, duration: 0.32 },
  wood: { filter: 'bandpass', from: 900, to: 380, q: 0.8, gain: 0.034, duration: 0.24 },
  plastic: { filter: 'bandpass', from: 1100, to: 420, q: 0.9, gain: 0.032, duration: 0.24 },
  rubber: { filter: 'lowpass', from: 800, to: 340, q: 0.7, gain: 0.034, duration: 0.26 },
  // 무거운 것은 낮게 깔려 온다 — 크게 부딪힐 것이 온다는 예고가 된다
  tech: { filter: 'lowpass', from: 620, to: 190, q: 0.7, gain: 0.042, duration: 0.34 },
  squish: { filter: 'lowpass', from: 900, to: 260, q: 0.6, gain: 0.034, duration: 0.28 },
  spark: { filter: 'highpass', from: 900, to: 3200, q: 0.8, gain: 0.03, duration: 0.22 },
}

/** 개체별 tone(0~1)을 반음 단위 배수로 바꾼다. 0.5가 기준음이다 */
function detuneRatio(tone: number, spread: number): number {
  return 2 ** (((tone - 0.5) * spread) / 12)
}

type WeightClass = 'veryLight' | 'light' | 'medium' | 'heavy'

/**
 * 박스가 받아내는 소리를 네 무게대로 가른다.
 *
 * 현재 185종의 실제 질량 분포를 재면 0.08 / 0.18 / 0.35에서 각각 41 / 64 / 42 / 38종으로
 * 갈린다. 맨 위 문턱은 물리의 무거운 물건 기준과 같아서, 쿵 소리와 잠금 판정이 서로
 * 다른 물건을 무겁다고 말하지 않는다.
 */
function weightClassOf(mass: number): WeightClass {
  if (mass < 0.08) return 'veryLight'
  if (mass < 0.18) return 'light'
  if (mass < HEAVY_MASS) return 'medium'
  return 'heavy'
}

/**
 * 물건 아래에서 함께 울리는 종이 박스의 반응.
 *
 * 기존 재질음은 "무엇이 떨어졌는가"를 말하고, 이 층은 "얼마나 무거운가"를 말한다.
 * 아주 가벼우면 사뿐, 가벼우면 풀썩, 중간은 척/탁, 무거우면 쿵으로 읽히게 한다.
 */
function boxLanding(voice: Voice, strength: number, mass: number, grain: number): void {
  const weight = weightClassOf(mass)
  const intensity = 0.45 + clamp(strength, 0, 1) * 0.55

  if (weight === 'veryLight') {
    // 사뿐 — 모서리를 건드리는 얇은 숨과 작은 몸통만 남긴다
    burst(voice, {
      filter: 'lowpass',
      freq: 1050,
      toFreq: 520,
      gain: 0.016 * intensity,
      duration: 0.07,
      attack: 0.018,
    })
    tone(voice, {
      type: 'sine',
      freq: 210,
      toFreq: 145,
      gain: 0.012 * intensity,
      duration: 0.08,
      attack: 0.02,
    })
    return
  }

  if (weight === 'light') {
    // 풀썩 — 접힌 골판지가 공기를 먹으며 눌리는 둔한 잡음
    burst(voice, {
      filter: 'lowpass',
      freq: 720,
      toFreq: 190,
      gain: 0.035 * intensity,
      duration: 0.13,
      attack: 0.018,
    })
    tone(voice, {
      type: 'sine',
      freq: 125,
      toFreq: 82,
      gain: 0.025 * intensity,
      duration: 0.13,
      attack: 0.016,
    })
    return
  }

  if (weight === 'medium') {
    /*
     * 척/탁 — 같은 무게라도 개체의 grain으로 둘을 가른다. 난수로 고르면 같은 물건이
     * 매번 다른 소리를 내지만, 개체값을 쓰면 반복하면서 그 물건의 감각이 익는다.
     */
    const crisp = grain < 0.5
    burst(voice, {
      filter: crisp ? 'bandpass' : 'lowpass',
      freq: crisp ? 1500 : 1050,
      toFreq: crisp ? 480 : 360,
      q: crisp ? 0.8 : 0.6,
      gain: 0.045 * intensity,
      duration: crisp ? 0.055 : 0.085,
      attack: 0.004,
    })
    tone(voice, {
      type: 'sine',
      freq: 115,
      toFreq: 68,
      gain: 0.042 * intensity,
      duration: 0.16,
      attack: 0.008,
    })
    return
  }

  // 쿵 — 상자 몸통 전체가 눌렸다 돌아오는 저음. 고역을 늘려 세게 만들지 않는다
  burst(voice, {
    filter: 'lowpass',
    freq: 440,
    toFreq: 75,
    gain: 0.07 * intensity,
    duration: 0.25,
    attack: 0.012,
  })
  burst(voice, {
    filter: 'bandpass',
    freq: 900,
    toFreq: 260,
    q: 0.7,
    gain: 0.025 * intensity,
    duration: 0.09,
    attack: 0.004,
  })
  tone(voice, {
    type: 'sine',
    freq: 74,
    toFreq: 38,
    gain: (0.09 + strength * 0.05) * intensity,
    duration: 0.34,
    attack: 0.008,
  })
}

/** 스플래시 화면용 사무실 나무문이 경첩 소리를 내며 열린다 */
function woodenDoorOpen(voice: Voice): void {
  // 한 번 매끈하게 훑으면 바람처럼 들린다. 방향이 다른 짧은 마찰을 겹쳐 경첩을 만든다
  burst(voice, {
    filter: 'bandpass',
    freq: 220,
    toFreq: 820,
    q: 4.2,
    gain: 0.02,
    duration: 0.55,
    attack: 0.07,
  })
  tone(voice, {
    type: 'triangle',
    freq: 132,
    toFreq: 188,
    gain: 0.018,
    duration: 0.22,
    delay: 0.03,
    attack: 0.035,
  })
  tone(voice, {
    type: 'triangle',
    freq: 196,
    toFreq: 148,
    gain: 0.014,
    duration: 0.2,
    delay: 0.22,
    attack: 0.025,
  })
  burst(voice, {
    filter: 'bandpass',
    freq: 780,
    toFreq: 360,
    q: 5.5,
    gain: 0.015,
    duration: 0.24,
    delay: 0.27,
    attack: 0.04,
  })
}

/** 스플래시 화면용 사무실 나무문의 문짝과 잠금쇠가 차례로 쿵 닫힌다 */
function woodenDoorClose(voice: Voice, strength: number): void {
  const intensity = 0.55 + clamp(strength, 0, 1) * 0.45
  // 문짝의 넓은 저음
  tone(voice, {
    type: 'sine',
    freq: 78,
    toFreq: 36,
    gain: 0.11 * intensity,
    duration: 0.32,
    attack: 0.006,
  })
  burst(voice, {
    filter: 'lowpass',
    freq: 650,
    toFreq: 90,
    gain: 0.09 * intensity,
    duration: 0.22,
    attack: 0.004,
  })
  // 나무판이 문틀에 맞는 짧은 척
  burst(voice, {
    filter: 'bandpass',
    freq: 1300,
    toFreq: 460,
    q: 0.9,
    gain: 0.045 * intensity,
    duration: 0.07,
    attack: 0.003,
  })
  // 손잡이와 잠금쇠가 한 박자 늦게 따라온다
  tone(voice, {
    type: 'sine',
    freq: 880,
    toFreq: 620,
    gain: 0.012 * intensity,
    duration: 0.075,
    delay: 0.035,
    attack: 0.004,
  })
}

/**
 * 물건이 손을 떠났다.
 *
 * 재질마다 훑는 대역이 다르다 — 무엇이 떨어지는지가 **닿기 전에** 들려야 하기
 * 때문이다. 이 게임에서 물건의 정체는 Enter를 친 순간 처음 공개되는데, 그때 눈은
 * 다음 단어를 쫓고 있어서 화면을 못 볼 때가 많다.
 *
 * 히든이면 위로 올라가는 소리를 하나 더 얹는다. 방향이 뒤집히면 그것만으로
 * "다른 것이 온다"가 전해진다.
 */
function dropWhoosh(voice: Voice, material: Material, tone: number, hidden: boolean): void {
  const recipe = DROP_VOICES[material]
  const shift = detuneRatio(tone, 4)
  burst(voice, {
    filter: recipe.filter,
    freq: recipe.from * shift,
    toFreq: recipe.to * shift,
    // Q를 낮추면 훑는 소리가 휘파람이 아니라 바람에 가까워진다
    q: recipe.q,
    gain: recipe.gain,
    duration: recipe.duration,
    attack: 0.06,
  })
  if (hidden) {
    burst(voice, {
      filter: 'bandpass',
      freq: 700,
      toFreq: 2200,
      q: 1.2,
      gain: 0.022,
      duration: 0.3,
      attack: 0.08,
    })
  }
}

/**
 * 무언가에 부딪혔다.
 *
 * 네 가지가 소리를 정한다.
 *
 * | 무엇이 | 무엇으로 |
 * |---|---|
 * | 재질 | 배음의 성질과 울림의 길이 — 유리는 맑게 남고 천은 거의 안 남는다 |
 * | 물건 크기 | 몸통의 음높이. 큰 것이 낮게 울리는 것은 실제 물건이 그렇기 때문이다 |
 * | 부딪힌 세기 | 음량과 길이 |
 * | 개체(tone) | 같은 재질 안에서 몇 반음 밀기 — 유리잔과 칵테일을 가른다 |
 * | 개체(grain) | 울림의 길이와 잡음의 밝기 — 자물쇠와 물뿌리개를 가른다 |
 *
 * 그래야 화면을 보지 않아도 **무엇이 얼마나 세게 얹혔는지**를 안다.
 *
 * 개체가 축 하나가 아니라 둘인 이유는 `game/data/materials.ts`에 있다. 음높이만
 * 밀면 같은 재질이 몰려 있을 때(금속 21종) 이웃끼리 0.48반음이라 한 소리를 조옮김한
 * 것으로 들린다. 축이 둘이면 같은 폭 안에서도 갈라지는 물건 수가 제곱으로 늘어난다.
 */
function impact(
  voice: Voice,
  strength: number,
  mass: number,
  size: number,
  material: Material,
  itemTone: number,
  itemGrain: number,
): void {
  boxLanding(voice, strength, mass, itemGrain)

  const recipe = MATERIAL_VOICES[material]
  // 큰 물건일수록 낮게. 재질이 정한 기준음에서 크기만큼 내려간다
  const body = clamp(recipe.body - size * 78, 44, 320) * detuneRatio(itemTone, recipe.spread)
  const level = 0.05 + strength * 0.28
  /*
   * grain이 높으면 길게 울리고 잡음이 어둡다(크고 속이 빈 것), 낮으면 짧고 밝다
   * (작고 단단한 것). 둘을 **반대로** 묶는 것이 요점이다 — 같은 방향으로 밀면
   * "밝고 긴" 것과 "어둡고 짧은" 것뿐이라 결국 축이 하나로 되돌아간다.
   */
  const ringScale = 1 + (itemGrain - 0.5) * 2 * recipe.ringSpread
  const tickScale = 1 - (itemGrain - 0.5) * 2 * recipe.tickSpread

  tone(voice, {
    type: 'sine',
    freq: body,
    toFreq: body * 0.6,
    gain: level * recipe.bodyGain,
    duration: recipe.ring * ringScale + strength * 0.12,
    // 완전히 가파르게 두면 저음이 아니라 딱 소리가 먼저 들린다
    attack: 0.006,
  })

  for (const [ratio, gain, ring] of recipe.partials) {
    tone(voice, {
      type: 'sine',
      freq: body * ratio,
      gain: level * gain,
      duration: ring * ringScale + strength * 0.1,
      attack: 0.004,
    })
  }

  /*
   * 부딪히는 "탁"은 잡음이 만든다. 예전에는 세게 부딪힐수록 3.8kHz까지 열려서
   * 무거운 물건이 떨어질 때가 가장 날카로웠다 — 정작 묵직하게 들려야 할 순간에.
   * 이제 열리는 폭을 재질이 정하고, 세기는 음량으로만 받는다.
   */
  const tick = recipe.tick
  if (tick !== null) {
    burst(voice, {
      filter: tick.filter,
      freq: tick.freq * tickScale,
      toFreq: tick.toFreq === undefined ? undefined : tick.toFreq * tickScale,
      gain: (0.014 + strength * 0.042) * tick.gain * 2,
      duration: tick.duration * ringScale,
      attack: 0.004,
    })
  }
}

/** 무겁고 큰 것이 떨어졌다. 화면이 흔들리는 그 순간의 저음 */
function quake(voice: Voice, strength: number): void {
  tone(voice, {
    type: 'sine',
    freq: 52,
    toFreq: 28,
    gain: 0.05 + strength * 0.13,
    duration: 0.55,
    attack: 0.014,
  })
  burst(voice, {
    filter: 'lowpass',
    freq: 240,
    toFreq: 60,
    gain: 0.018 + strength * 0.05,
    duration: 0.45,
    attack: 0.02,
  })
}

/** 재료가 합쳐졌다. 네 음으로 올라간다 — 만들어냈다는 것은 좋은 일이다 */
function merge(voice: Voice): void {
  const notes = [64, 68, 71, 76]
  notes.forEach((midi, index) => {
    tone(voice, {
      type: 'triangle',
      freq: hz(midi),
      gain: 0.05,
      duration: 0.22,
      delay: index * 0.07,
      attack: 0.014,
    })
  })
}

/**
 * 히든이 모습을 드러냈다.
 *
 * 종소리로 만든다. 배음을 정수배가 아닌 비율(2.76, 5.4)로 얹으면 금속처럼 울리는데,
 * 이 게임에서 가장 드문 순간이라 다른 소리와 확실히 갈라져야 한다.
 */
function reveal(voice: Voice): void {
  /*
   * 기준음을 내리고 가장 높은 배음(5.4배)을 뺐다. 1046Hz에 5.4를 곱하면 5.6kHz인데,
   * 사람 귀가 가장 예민한 대역이라 "특별하다"가 아니라 "따갑다"로 들렸다.
   * 종소리의 성질은 2.76배 하나만으로도 충분히 난다.
   */
  const base = hz(79)
  const partials: readonly (readonly [number, number, number])[] = [
    [1, 0.05 * HIDDEN_REVEAL_PRE_GAIN, 1],
    [2.76, 0.016 * HIDDEN_REVEAL_PRE_GAIN, 0.7],
  ]
  for (const [ratio, gain, duration] of partials) {
    tone(voice, { type: 'sine', freq: base * ratio, gain, duration, attack: 0.012 })
  }
  burst(voice, {
    filter: 'highpass',
    freq: 1800,
    toFreq: 3000,
    gain: 0.012 * HIDDEN_REVEAL_PRE_GAIN,
    duration: 0.45,
    attack: 0.08,
  })
}

/** 목숨이 하나 깎였다 */
function lifeLost(voice: Voice): void {
  // 사각파는 홀수 배음이 그대로 서서 유난히 따갑다. 삼각파로 바꿨다
  tone(voice, {
    type: 'triangle',
    freq: 370,
    toFreq: 247,
    gain: 0.045,
    duration: 0.36,
    attack: 0.014,
  })
  tone(voice, { type: 'sine', freq: 185, toFreq: 123, gain: 0.07, duration: 0.55 })
  burst(voice, { filter: 'lowpass', freq: 300, toFreq: 110, gain: 0.032, duration: 0.34 })
}

/** 목숨을 다 잃고 탑이 무너지기 시작했다 */
function collapse(voice: Voice): void {
  burst(voice, {
    filter: 'lowpass',
    freq: 620,
    toFreq: 55,
    q: 0.7,
    gain: 0.15,
    duration: 1.2,
    attack: 0.08,
  })
  tone(voice, { type: 'sine', freq: 68, toFreq: 26, gain: 0.1, duration: 1.1, attack: 0.03 })
}

/** 판이 끝났다. 이겼는지에 따라 오르내린다 */
function gameOver(voice: Voice, won: boolean | null): void {
  const notes = won === true ? [64, 68, 71, 76] : [69, 65, 60]
  const gap = won === true ? 0.14 : 0.19
  notes.forEach((midi, index) => {
    tone(voice, {
      type: 'triangle',
      freq: hz(midi),
      gain: 0.058,
      duration: won === true ? 0.26 : 0.46,
      delay: index * gap,
      attack: 0.016,
    })
  })
  if (won !== true) {
    tone(voice, {
      type: 'sine',
      freq: hz(36),
      gain: 0.07,
      duration: 1,
      delay: notes.length * gap,
      attack: 0.03,
    })
  }
}

/** 메뉴에서 고른 항목이 옮겨졌다 */
function menuMove(voice: Voice): void {
  // 1.7kHz 삼각파였는데 메뉴를 훑을 때마다 찔렸다. 한 옥타브 반을 내리고 사인으로
  tone(voice, { type: 'sine', freq: hz(72), gain: 0.028, duration: 0.06, attack: 0.008 })
}

/** 메뉴 항목으로 들어갔다 */
function menuSelect(voice: Voice): void {
  tone(voice, {
    type: 'sine',
    freq: hz(69),
    toFreq: hz(76),
    gain: 0.045,
    duration: 0.13,
    attack: 0.01,
  })
  tone(voice, { type: 'triangle', freq: hz(81), gain: 0.014, duration: 0.1, delay: 0.05 })
}

/**
 * 대전: 내 차례가 됐다.
 *
 * 다른 소리보다 길고 또렷하게 둔다. 상대의 물건이 멈춘 뒤 조용히 시작되는 순간이라
 * 놓치면 몇 초를 그냥 흘리는데, 그 몇 초가 대전에서는 한 수다.
 */
function turnCue(voice: Voice): void {
  tone(voice, { type: 'sine', freq: hz(69), gain: 0.055, duration: 0.2, attack: 0.018 })
  tone(voice, {
    type: 'sine',
    freq: hz(76),
    gain: 0.055,
    duration: 0.3,
    delay: 0.13,
    attack: 0.018,
  })
}

/**
 * 대전: 누가 한마디 했다.
 *
 * **짧고 낮은 두 음.** 알리되 손을 멈추게 하면 안 된다 — 판이 도는 중에 오는 소리라,
 * 뾰족하면 떨어지는 물건에서 눈을 떼게 만든다. 두 음을 올려 붙여 "말"이라는 느낌만 준다.
 */
function chat(voice: Voice): void {
  tone(voice, { type: 'sine', freq: hz(76), gain: 0.026, duration: 0.1 })
  tone(voice, { type: 'sine', freq: hz(83), gain: 0.02, duration: 0.13, delay: 0.06 })
}

export {
  // 재질별 폭(spread)이 여기 있어서, 개체값이 실제로 몇 반음 벌어지는지는
  // 이 표를 봐야 안다. tests/materials.test.ts가 그 간격을 지킨다
  MATERIAL_VOICES,
  tone,
  burst,
  hz,
  weightClassOf,
  boxLanding,
  woodenDoorOpen,
  woodenDoorClose,
  typeTick,
  wordHit,
  wordMiss,
  dropWhoosh,
  impact,
  quake,
  merge,
  reveal,
  lifeLost,
  collapse,
  gameOver,
  menuMove,
  menuSelect,
  turnCue,
  chat,
}
export type { Voice, WeightClass }
