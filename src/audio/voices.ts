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
 * 물건이 손을 떠났다.
 *
 * 히든이면 훑는 방향을 뒤집어 위로 올린다 — 무언가 다른 것이 온다는 신호가
 * 물건이 보이기 전에 먼저 도착한다.
 */
function dropWhoosh(voice: Voice, hidden: boolean): void {
  burst(voice, {
    filter: 'bandpass',
    freq: hidden ? 380 : 950,
    toFreq: hidden ? 1450 : 300,
    // Q를 낮추면 훑는 소리가 휘파람이 아니라 바람에 가까워진다
    q: 0.7,
    gain: 0.04,
    duration: 0.3,
    attack: 0.06,
  })
}

/**
 * 무언가에 부딪혔다.
 *
 * 세기는 음량과 길이로, 물건의 크기는 음높이로 간다. 큰 것이 낮게 울리는 것은
 * 실제 물건이 그렇기 때문이고, 그래야 화면을 보지 않아도 무엇이 얹혔는지 안다.
 */
function impact(voice: Voice, strength: number, size: number): void {
  const body = clamp(150 - size * 72, 50, 150)
  tone(voice, {
    type: 'sine',
    freq: body,
    toFreq: body * 0.6,
    gain: 0.05 + strength * 0.28,
    duration: 0.09 + strength * 0.16,
    // 완전히 가파르게 두면 저음이 아니라 딱 소리가 먼저 들린다
    attack: 0.006,
  })
  /*
   * 부딪히는 "탁"은 잡음이 만든다. 예전에는 세게 부딪힐수록 3.8kHz까지 열려서
   * 무거운 물건이 떨어질 때가 가장 날카로웠다 — 정작 묵직하게 들려야 할 순간에.
   * 이제 열리는 폭을 좁히고, 세기는 음량이 아니라 저음 쪽이 받는다.
   */
  burst(voice, {
    filter: 'lowpass',
    freq: 380 + strength * 1150,
    gain: 0.014 + strength * 0.042,
    duration: 0.03,
    attack: 0.004,
  })
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
    [1, 0.05, 1],
    [2.76, 0.016, 0.7],
  ]
  for (const [ratio, gain, duration] of partials) {
    tone(voice, { type: 'sine', freq: base * ratio, gain, duration, attack: 0.012 })
  }
  burst(voice, {
    filter: 'highpass',
    freq: 1800,
    toFreq: 3000,
    gain: 0.012,
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

/** 대전: 상대가 단어를 지목했다. 알리되 손을 멈추게 하지는 않는다 */
function suggested(voice: Voice): void {
  tone(voice, { type: 'sine', freq: hz(79), gain: 0.03, duration: 0.16 })
  tone(voice, { type: 'sine', freq: hz(84), gain: 0.018, duration: 0.13, delay: 0.07 })
}

export {
  tone,
  burst,
  hz,
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
  suggested,
}
export type { Voice }
