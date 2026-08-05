/**
 * 한글 타수 계산.
 *
 * 타자게임이니 속도는 한국 타자연습의 관례대로 **분당 타수(타/분)**로 센다.
 * 글자 수가 아니라 실제로 누른 키 수여야 "가"(2타)와 "뚫"(5타)의 노동량 차이가 드러난다.
 *
 * 두벌식 기준이고, 쌍자음·겹받침·복합모음은 2타다(shift 또는 두 키). 예:
 *   사과 = ㅅㅏ + ㄱㅗㅏ = 2 + 3 = 5
 *   번개 = ㅂㅓㄴ + ㄱㅐ = 3 + 2 = 5
 *
 * Enter는 세지 않는다. 이 게임에서 Enter는 타이핑이 아니라 조준이다.
 */

const HANGUL_BASE = 0xac00
const HANGUL_LAST = 0xd7a3
const JUNG_COUNT = 21
const JONG_COUNT = 28

/** 초성 19개: ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ */
const CHO_KEYS = [1, 2, 1, 1, 2, 1, 1, 1, 2, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1]

/** 중성 21개: ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ */
const JUNG_KEYS = [1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 2, 2, 2, 1, 1, 2, 1]

/** 종성 28개: (없음)ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ */
const JONG_KEYS = [
  0, 1, 2, 2, 1, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 1, 1, 2, 1, 2, 1, 1, 1, 1, 1, 1, 1,
]

/** 이 문자열을 두벌식으로 치는 데 필요한 키 수. 한글이 아닌 글자는 1타로 본다 */
function countKeystrokes(text: string): number {
  let total = 0
  for (const char of text) {
    const code = char.codePointAt(0)
    if (code === undefined) {
      continue
    }
    if (code < HANGUL_BASE || code > HANGUL_LAST) {
      total += 1
      continue
    }
    const offset = code - HANGUL_BASE
    const cho = Math.floor(offset / (JUNG_COUNT * JONG_COUNT))
    const jung = Math.floor(offset / JONG_COUNT) % JUNG_COUNT
    const jong = offset % JONG_COUNT
    total += (CHO_KEYS[cho] ?? 1) + (JUNG_KEYS[jung] ?? 1) + (JONG_KEYS[jong] ?? 0)
  }
  return total
}

/**
 * 분당 타수. 판이 시작된 뒤 흐른 시간으로 나눈다.
 *
 * 첫 단어가 내려오기까지도 시간이 흐르므로 시작 직후에는 값이 요란하게 튄다.
 * 1초가 지나기 전에는 0을 준다 — 표시할 수 없는 값을 표시하지 않는 편이 낫다.
 */
function keystrokesPerMinute(keystrokes: number, elapsedSec: number): number {
  if (elapsedSec < 1) {
    return 0
  }
  return Math.round((keystrokes / elapsedSec) * 60)
}

export { countKeystrokes, keystrokesPerMinute }
