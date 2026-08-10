/**
 * 배경음악의 악보.
 *
 * 소리를 내는 방법(`Bgm`)과 무엇을 연주할지(여기)를 나눠 둔다. 곡을 하나 더 넣는 것이
 * 표 하나를 더 쓰는 일이 되어야 하고, 그렇지 않으면 재생기가 화면을 알게 된다.
 *
 * 낮·밤 스플래시와 플레이 곡은 참고 음원의 **멜로디를 옮기지 않았다.** 구간별로 잰
 * 빠르기·밝기·리듬 밀도와 짧은 플럭 음색만 출발점으로 삼고, 화음 진행과 선율은 새로
 * 썼다. 요청대로 각 참고 구간보다 조금 빠르되, 플레이 곡에는 멜로디를 두지 않아
 * 착지음과 타자음을 가리지 않는다.
 */

/** 한 마디의 베이스와 화음 (MIDI 번호) */
interface Bar {
  readonly bass: number
  readonly chord: readonly [number, number, number]
}

/** [시작 스텝, MIDI 번호, 길이(스텝)] — 한 바퀴 안에서의 절대 위치 */
type MelodyNote = readonly [number, number, number]

interface Layer {
  readonly type: OscillatorType
  readonly gain: number
  /** 음 길이를 스텝 길이의 몇 배로 할지. 짧으면 튕기고 길면 이어진다 */
  readonly length: number
}

/** 흰 잡음을 짧게 잘라 만드는 리듬. pattern의 0은 쉼, 1은 가장 센 타격이다 */
interface RhythmLayer {
  readonly pattern: readonly number[]
  readonly filter: BiquadFilterType
  readonly freq: number
  readonly toFreq?: number
  readonly q: number
  readonly gain: number
  readonly duration: number
}

interface BgmTrack {
  readonly bpm: number
  readonly bars: readonly Bar[]
  /** 한 마디를 몇 칸으로 나눌지. 8이면 4/4, 6이면 3/4다 */
  readonly stepsPerBar: number
  /** 아르페지오를 놓을 칸. 길이는 stepsPerBar와 같아야 한다 */
  readonly pattern: readonly boolean[]
  readonly arp: Layer & { readonly octave: number }
  /** 베이스를 놓을 칸. 여럿이면 마디 안에서 뛴다 */
  readonly bass: Layer & { readonly steps: readonly number[] }
  /** 화음을 길게 깔지. null이면 깔지 않는다 */
  readonly pad: Layer | null
  /** 귀여운 짧은 타악 결. 효과음보다 훨씬 작게 둔다 */
  readonly rhythm: RhythmLayer | null
  readonly melody: (Layer & { readonly notes: readonly MelodyNote[] }) | null
}

/* 화음 — 베이스는 2옥타브대, 화음음은 3~4옥타브대에 둔다 */
const Am = { bass: 45, chord: [52, 57, 60] } as const satisfies Bar
const Bm = { bass: 35, chord: [50, 54, 59] } as const satisfies Bar
const C = { bass: 36, chord: [52, 55, 60] } as const satisfies Bar
const D = { bass: 38, chord: [54, 57, 62] } as const satisfies Bar
const F = { bass: 41, chord: [53, 57, 60] } as const satisfies Bar
const G = { bass: 43, chord: [50, 55, 59] } as const satisfies Bar
const A = { bass: 45, chord: [52, 57, 61] } as const satisfies Bar
const Dm = { bass: 38, chord: [53, 57, 62] } as const satisfies Bar
const Em = { bass: 40, chord: [52, 55, 59] } as const satisfies Bar
const Fsm = { bass: 42, chord: [49, 54, 57] } as const satisfies Bar
const Bb = { bass: 34, chord: [53, 58, 62] } as const satisfies Bar
/**
 * 낮 스플래시 — D장조, 72 BPM.
 *
 * 참고 구간은 약 62 BPM의 느긋한 박과 중역 플럭이 중심이었다. 한 박을 더 촘촘히
 * 나누는 대신 속도는 72 BPM까지만 올려, 메뉴를 읽는 사람을 재촉하지 않는다.
 */
const SPLASH_DAY: BgmTrack = {
  bpm: 72,
  stepsPerBar: 8,
  bars: [D, Bm, G, A, D, Em, G, A, Bm, G, A, D],
  pattern: [true, false, false, true, false, true, false, false],
  arp: { type: 'sine', gain: 0.026, octave: 12, length: 0.58 },
  bass: { type: 'sine', gain: 0.058, steps: [0], length: 5.5 },
  pad: { type: 'triangle', gain: 0.018, length: 7 },
  rhythm: {
    pattern: [0.75, 0, 0, 0.45, 0, 0.6, 0, 0],
    filter: 'bandpass',
    freq: 950,
    toFreq: 500,
    q: 0.8,
    gain: 0.007,
    duration: 0.045,
  },
  melody: {
    type: 'sine',
    gain: 0.034,
    length: 1,
    notes: [
      [0, 74, 3], [4, 78, 2], [6, 81, 4],
      [12, 78, 3], [16, 76, 2], [19, 74, 4],
      [24, 71, 3], [28, 74, 2], [30, 76, 4],
      [36, 73, 2], [40, 74, 5],
      [48, 78, 3], [52, 81, 3], [56, 83, 5],
      [64, 81, 2], [67, 78, 3], [72, 76, 4],
      [80, 73, 3], [84, 76, 2], [88, 74, 8],
    ],
  },
}

/**
 * 밤 스플래시 — B단조, 108 BPM.
 *
 * 참고 구간의 약 100 BPM, 낮은 중심음과 띄엄띄엄 놓인 타격을 가져오되 선율과 화음은
 * 새로 썼다. 낮보다 빠르지만 빈 칸이 많아 밤 화면의 고요를 깨지 않는다.
 */
const SPLASH_NIGHT: BgmTrack = {
  bpm: 108,
  stepsPerBar: 8,
  bars: [Bm, G, D, A, Bm, Em, Fsm, A, G, D, A, Bm],
  pattern: [true, false, true, false, false, true, false, false],
  arp: { type: 'triangle', gain: 0.019, octave: 12, length: 0.5 },
  bass: { type: 'sine', gain: 0.064, steps: [0], length: 5 },
  pad: { type: 'sine', gain: 0.015, length: 7 },
  rhythm: {
    pattern: [0.8, 0, 0, 0, 0.45, 0, 0, 0],
    filter: 'lowpass',
    freq: 520,
    toFreq: 180,
    q: 0.6,
    gain: 0.009,
    duration: 0.07,
  },
  melody: {
    type: 'sine',
    gain: 0.028,
    length: 1,
    notes: [
      [0, 71, 4], [6, 74, 2], [12, 78, 5],
      [20, 76, 3], [24, 74, 5],
      [32, 71, 3], [36, 69, 3], [40, 67, 5],
      [48, 71, 3], [52, 74, 2], [56, 78, 5],
      [64, 79, 3], [68, 78, 3], [72, 76, 4],
      [80, 74, 4], [88, 71, 8],
    ],
  },
}

/**
 * 낮 플레이 — G장조, 96 BPM, 16마디(40초).
 *
 * 참고 구간의 약 80 BPM보다 빠르고, 짧은 타악 결을 촘촘히 둔다. 멜로디는 비워서
 * 타자·착지음이 앞에 남고, 네 마디마다 끝 화음을 달리해 긴 판에서도 시계처럼 안 들린다.
 */
const GAME_DAY: BgmTrack = {
  bpm: 96,
  stepsPerBar: 8,
  bars: [
    G, C, Em, D,
    G, Am, C, D,
    Em, C, G, D,
    Am, C, D, G,
  ],
  pattern: [true, false, true, true, false, true, false, true],
  arp: { type: 'triangle', gain: 0.027, octave: 12, length: 0.62 },
  bass: { type: 'sine', gain: 0.066, steps: [0, 4], length: 2.7 },
  pad: { type: 'triangle', gain: 0.012, length: 7 },
  rhythm: {
    pattern: [0.9, 0, 0.45, 0.65, 0, 0.55, 0, 0.7],
    filter: 'bandpass',
    freq: 1600,
    toFreq: 900,
    q: 0.7,
    gain: 0.008,
    duration: 0.026,
  },
  melody: null,
}

/**
 * 첫 밤 플레이 — E단조, 112 BPM, 20마디(약 43초).
 *
 * 게임 시작을 알리는 첫 바퀴라 밤 플레이와 거의 같은 저음·음색을 쓰되, 진행을 Em-C만
 * 반복하고 타격을 덜어 더 단조롭게 둔다. 보통 밤으로 넘어갈 때 낯설지 않도록 중심음은
 * 그대로 잡는다.
 */
const GAME_FIRST_NIGHT: BgmTrack = {
  bpm: 112,
  stepsPerBar: 8,
  bars: [
    Em, C, Em, C,
    Em, C, Em, C,
    Em, C, Em, C,
    Em, C, Em, C,
    Em, C, Em, C,
  ],
  pattern: [true, false, false, false, true, false, true, false],
  arp: { type: 'sine', gain: 0.022, octave: 12, length: 0.58 },
  bass: { type: 'triangle', gain: 0.068, steps: [0, 4], length: 2.4 },
  pad: { type: 'sine', gain: 0.009, length: 7 },
  rhythm: {
    pattern: [0.82, 0, 0, 0, 0.5, 0, 0, 0.42],
    filter: 'lowpass',
    freq: 700,
    toFreq: 220,
    q: 0.65,
    gain: 0.009,
    duration: 0.052,
  },
  melody: null,
}

/**
 * 밤 플레이 — E단조, 116 BPM, 20마디(약 41초).
 *
 * 참고 구간의 약 105 BPM보다 한 걸음 빠르고 저음 비중을 높였다. 낮과 같은 음 집합을
 * 써서 1.4초 크로스페이드 동안 부딪히지 않되, 세 번 뛰는 베이스로 밤의 긴장만 올린다.
 */
const GAME_NIGHT: BgmTrack = {
  bpm: 116,
  stepsPerBar: 8,
  bars: [
    Em, C, G, Bm,
    Em, C, Am, Bm,
    G, D, Em, Bm,
    C, G, Am, Bm,
    Em, D, C, Bm,
  ],
  pattern: [true, false, true, false, true, true, false, true],
  arp: { type: 'sine', gain: 0.026, octave: 12, length: 0.52 },
  bass: { type: 'triangle', gain: 0.074, steps: [0, 3, 6], length: 1.8 },
  pad: { type: 'sine', gain: 0.01, length: 7 },
  rhythm: {
    pattern: [1, 0, 0.5, 0, 0.72, 0.55, 0, 0.75],
    filter: 'lowpass',
    freq: 780,
    toFreq: 240,
    q: 0.7,
    gain: 0.011,
    duration: 0.045,
  },
  melody: null,
}

/** 대전 대기방 — D도리안. 사각파와 패드 없는 스타카토가 기다리는 시간을 알린다. */
const LOBBY: BgmTrack = {
  bpm: 76,
  stepsPerBar: 8,
  bars: [Dm, G, Dm, C, Dm, G, Am, C],
  pattern: [true, false, true, false, true, false, true, false],
  arp: { type: 'square', gain: 0.022, octave: 12, length: 0.45 },
  bass: { type: 'triangle', gain: 0.062, steps: [0, 4], length: 3 },
  pad: null,
  rhythm: null,
  melody: {
    type: 'sine',
    gain: 0.036,
    length: 1,
    notes: [
      [0, 74, 2], [2, 77, 2], [4, 81, 5],
      [16, 74, 2], [18, 77, 2], [20, 79, 5],
      [32, 76, 2], [34, 79, 2], [36, 83, 5],
      [48, 81, 2], [50, 79, 2], [52, 76, 7],
    ],
  },
}

/** 도감 — F장조 3/4 왈츠. 두 옥타브 위 아르페지오가 오르골처럼 들린다. */
const COLLECTION: BgmTrack = {
  bpm: 66,
  stepsPerBar: 6,
  bars: [F, C, Dm, Bb, F, Bb, C, F],
  pattern: [false, false, true, false, true, false],
  arp: { type: 'sine', gain: 0.026, octave: 24, length: 0.8 },
  bass: { type: 'sine', gain: 0.06, steps: [0], length: 2 },
  pad: { type: 'triangle', gain: 0.02, length: 5 },
  rhythm: null,
  melody: {
    type: 'sine',
    gain: 0.03,
    length: 1,
    notes: [
      [0, 77, 6],
      [6, 76, 3], [9, 74, 3],
      [12, 72, 6],
      [18, 74, 6],
      [24, 77, 6],
      [30, 79, 3], [33, 77, 3],
      [36, 76, 6],
      [42, 72, 6],
    ],
  },
}

const TRACKS = {
  splashDay: SPLASH_DAY,
  splashNight: SPLASH_NIGHT,
  gameDay: GAME_DAY,
  gameFirstNight: GAME_FIRST_NIGHT,
  gameNight: GAME_NIGHT,
  lobby: LOBBY,
  collection: COLLECTION,
} as const

type BgmTrackName = keyof typeof TRACKS

export { TRACKS }
export type { Bar, BgmTrack, BgmTrackName, Layer, MelodyNote, RhythmLayer }
