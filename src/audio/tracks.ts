/**
 * 배경음악의 악보.
 *
 * 소리를 내는 방법(`Bgm`)과 무엇을 연주할지(여기)를 나눠 둔다. 곡을 하나 더 넣는 것이
 * 표 하나를 더 쓰는 일이 되어야 하고, 그렇지 않으면 재생기가 화면을 알게 된다.
 *
 * ## 곡을 무엇으로 가르는가
 *
 * 처음에는 빠르기와 화음표만 바꿔 넷을 만들었다. 실기로 들으니 **전부 같은 곡으로
 * 들렸다** — 당연했다. 음색이 같고(사인 베이스 + 삼각파 패드 + 삼각파 아르페지오),
 * 박자가 같고(8분음표 여덟 칸), 무엇보다 **멜로디가 없었다.** 화음만 깔린 것들끼리는
 * 코드 진행을 바꿔도 "같은 배경음"으로 뭉뚱그려 들린다.
 *
 * 그래서 네 축을 전부 가른다.
 *
 * | | 조성 중심 | 박자 | 음색 | 멜로디 |
 * |---|---|---|---|---|
 * | 타이틀 | C장조 | 4/4 | 사인 + 두꺼운 패드 | 있다 (느린 노래) |
 * | 대기방 | D도리안 | 4/4 스타카토 | **사각파**, 패드 없음 | 있다 (짧은 되풀이) |
 * | 도감 | F장조 | **3/4 왈츠** | 오르골(사인 2옥타브 위) | 있다 (내려오는 선) |
 * | 판 | A단조 | 4/4 몰아치는 베이스 | 삼각파 | **없다** |
 *
 * 판에만 멜로디를 두지 않는다. 판에서 귀가 쓸 정보는 얹혔는지·놓쳤는지이고,
 * 멜로디는 그 주의를 가져간다. **없는 것 자체가 판의 성격**이 된다.
 *
 * ## 조성은 갈라도 음 집합은 붙여둔다
 *
 * C장조 · A단조 · D도리안은 **같은 흰건반 일곱 음**이고 F장조만 Bb 하나가 다르다.
 * 중심음과 음색은 확실히 다르되 음 집합은 붙어 있어서, 화면을 옮길 때 앞 곡의
 * 여운 위로 다음 곡이 시작해도 부딪히지 않는다(곡을 바꿀 때 예약된 음을 끊지 않는다).
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

interface BgmTrack {
  readonly bpm: number
  readonly bars: readonly Bar[]
  /** 한 마디를 몇 칸으로 나눌지. 8이면 4/4, 6이면 3/4다 */
  readonly stepsPerBar: number
  /**
   * 아르페지오를 놓을 칸. 길이는 stepsPerBar와 같아야 한다.
   * 빈 칸이 곡의 성격을 정하고, 무엇보다 **효과음이 끼어들 자리**가 여기서 나온다.
   */
  readonly pattern: readonly boolean[]
  readonly arp: Layer & { readonly octave: number }
  /** 베이스를 놓을 칸. 여럿이면 마디 안에서 뛴다 */
  readonly bass: Layer & { readonly steps: readonly number[] }
  /** 화음을 길게 깔지. null이면 깔지 않는다 — 성기고 마른 소리가 된다 */
  readonly pad: Layer | null
  readonly melody: (Layer & { readonly notes: readonly MelodyNote[] }) | null
}

/* 화음 — 베이스는 2옥타브대, 화음음은 3~4옥타브대에 둔다 */
const Am = { bass: 45, chord: [52, 57, 60] } as const satisfies Bar
const C = { bass: 36, chord: [52, 55, 60] } as const satisfies Bar
const F = { bass: 41, chord: [53, 57, 60] } as const satisfies Bar
const G = { bass: 43, chord: [50, 55, 59] } as const satisfies Bar
const Dm = { bass: 38, chord: [53, 57, 62] } as const satisfies Bar
const Em = { bass: 40, chord: [52, 55, 59] } as const satisfies Bar
const Bb = { bass: 34, chord: [53, 58, 62] } as const satisfies Bar
/** E장조. A단조로 되돌아가는 힘이 가장 센 화음이라 단락의 끝에만 쓴다 */
const E = { bass: 44, chord: [52, 56, 59] } as const satisfies Bar

/**
 * 판이 도는 동안 — A단조.
 *
 * 16마디(약 46초)다. 처음에는 4마디(11초)였는데 한 판이 1분을 넘기므로 같은 자리가
 * 다섯 번 넘게 돌아왔다 — 그쯤 되면 음악이 배경이 아니라 시계처럼 들린다.
 *
 * 네 마디씩 네 단락이고 단락 끝의 화음이 서로 다르다(G · E · Am · E).
 * 같은 진행을 늘리기만 하면 길어도 길게 느껴지지 않는다 — **어디쯤인지 알 수 있어야**
 * 길이가 길이로 들린다.
 *
 * 이 곡의 표식은 **한 마디에 두 번 뛰는 베이스**다. 다른 곡은 마디마다 한 번만
 * 짚으므로, 판에 들어오는 순간 걸음이 빨라진 것이 먼저 들린다.
 */
const GAME: BgmTrack = {
  bpm: 84,
  stepsPerBar: 8,
  bars: [
    Am, F, C, G,
    Am, F, C, E,
    Dm, G, C, Am,
    F, G, Am, E,
  ],
  pattern: [true, false, true, true, false, true, false, true],
  arp: { type: 'triangle', gain: 0.04, octave: 12, length: 0.9 },
  bass: { type: 'sine', gain: 0.075, steps: [0, 4], length: 3 },
  pad: { type: 'triangle', gain: 0.022, length: 7 },
  // 멜로디를 두지 않는다. 판에서 귀가 쓸 것은 음악이 아니다
  melody: null,
}

/**
 * 타이틀과 옵션 — C장조.
 *
 * 유일하게 **밝은 장조**이고 화음을 두껍게 깐다. 처음 들어온 사람이 만나는 소리라
 * 여기만 환영하는 쪽으로 기울여 뒀다. 멜로디가 느리게 흐르고 아르페지오는 두 칸만
 * 남겨서, 읽고 고르는 동안 재촉하지 않는다.
 */
const TITLE: BgmTrack = {
  bpm: 60,
  stepsPerBar: 8,
  bars: [C, G, Am, F, C, Em, G, C],
  pattern: [true, false, false, false, true, false, false, false],
  arp: { type: 'sine', gain: 0.03, octave: 12, length: 1.6 },
  bass: { type: 'sine', gain: 0.07, steps: [0], length: 6 },
  pad: { type: 'triangle', gain: 0.032, length: 7 },
  // 마지막 두 마디가 G → C로 닫힌다. 되돌아올 때 매듭이 지어져야 맴돈다는 느낌이 없다
  melody: {
    type: 'sine',
    gain: 0.042,
    length: 1,
    notes: [
      [0, 72, 4], [4, 76, 4],
      [8, 79, 6],
      [16, 76, 4], [20, 72, 4],
      [24, 74, 6],
      [32, 76, 4], [36, 79, 4],
      [40, 83, 6],
      [48, 79, 4], [52, 76, 4],
      [56, 72, 8],
    ],
  },
}

/**
 * 대전 대기방 — D도리안.
 *
 * **사각파에 패드가 없다.** 넷 중 유일하게 마른 소리이고, 스타카토로 또박또박
 * 4분음표를 짚는다 — 상대를 기다리는 동안 **시간이 흐르고 있다는 것**이 들려야 한다.
 * 음악까지 멎어 있으면 연결이 끊긴 것처럼 느껴진다.
 *
 * 멜로디가 매번 풀리지 않은 음으로 끝난다. 아직 시작 전이라는 것이 그렇게 들린다.
 */
const LOBBY: BgmTrack = {
  bpm: 76,
  stepsPerBar: 8,
  bars: [Dm, G, Dm, C, Dm, G, Am, C],
  pattern: [true, false, true, false, true, false, true, false],
  // 사각파는 배음이 세지만 버스의 고역 깎기가 눌러준다. 여기서는 그 성질이 표식이다
  arp: { type: 'square', gain: 0.022, octave: 12, length: 0.45 },
  bass: { type: 'triangle', gain: 0.062, steps: [0, 4], length: 3 },
  pad: null,
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

/**
 * 도감 — F장조, **3/4 왈츠**.
 *
 * 유일하게 박자가 다르다. 세 박은 네 박과 걸음걸이 자체가 달라서, 조성이나 음색보다
 * 먼저 "다른 곡"으로 들린다. 베이스가 첫 박을 짚고 화음이 둘째·셋째 박에 얹히는
 * 왈츠의 기본형이다.
 *
 * 아르페지오를 두 옥타브 위에 올려 오르골처럼 만들었다. 가운데가 비면 소리가 넓게
 * 퍼져 들려서, 같은 음량이라도 덜 눌린다 — 모은 것을 들여다보는 자리다.
 */
const COLLECTION: BgmTrack = {
  bpm: 66,
  stepsPerBar: 6,
  bars: [F, C, Dm, Bb, F, Bb, C, F],
  pattern: [false, false, true, false, true, false],
  arp: { type: 'sine', gain: 0.026, octave: 24, length: 0.8 },
  bass: { type: 'sine', gain: 0.06, steps: [0], length: 2 },
  pad: { type: 'triangle', gain: 0.02, length: 5 },
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
  game: GAME,
  title: TITLE,
  lobby: LOBBY,
  collection: COLLECTION,
} as const

type BgmTrackName = keyof typeof TRACKS

export { TRACKS }
export type { Bar, BgmTrack, BgmTrackName, Layer, MelodyNote }
