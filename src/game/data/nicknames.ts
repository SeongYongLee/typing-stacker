import { ALL_VARIANTS } from './words.ts'

/**
 * 이름은 **짓는 것이 아니라 고르는 것**이다.
 *
 * 순위표는 이 게임을 하는 모두가 본다. 자유 입력을 두면 언젠가 누군가는 욕을 적고,
 * 그것을 막으려면 금칙어 목록을 들고 계속 손봐야 한다. 한국어는 자모를 흩거나
 * 초성만 쓰거나 숫자를 끼우는 것만으로 목록을 빠져나가고, 반대로 멀쩡한 이름이
 * 막히는 일도 생긴다. 지키는 사람이 하나뿐인 게임에서 이길 수 없는 싸움이다.
 *
 * 그래서 재료를 우리가 정한다. 고를 수 있는 것이 2,000가지가 넘으므로 남과 겹치는
 * 느낌은 거의 없고, 재료가 전부 이 게임의 물건이라 세계관과도 이어진다.
 *
 * 브라우저도 저장소도 모르는 순수 데이터라 node에서 그대로 시험한다.
 */

/**
 * 꾸미말. 물건의 성격에서 가져온 것들이라 어떤 물건에 붙어도 말이 된다.
 * 사람을 가리키는 말(귀여운, 멍청한 같은)은 넣지 않는다 — 남을 부르는 데 쓰이면
 * 재료만으로도 놀리는 이름이 만들어진다.
 */
const ADJECTIVES: readonly string[] = [
  '굴러가는',
  '반짝이는',
  '조용한',
  '단단한',
  '가벼운',
  '묵직한',
  '느긋한',
  '재빠른',
  '둥근',
  '뾰족한',
  '따뜻한',
  '차가운',
  '끈적한',
  '메마른',
  '흔들리는',
  '기울어진',
  '쌓아올린',
  '떨어지는',
  '숨어있는',
  '빛나는',
]

/** 이름의 뒷자리. 게임에 나오는 물건 이름을 그대로 쓴다 */
function nouns(): readonly string[] {
  // 같은 이름을 가진 변형이 있어 중복을 걷어낸다
  return [...new Set(ALL_VARIANTS.map((item) => item.label))]
}

interface NameParts {
  readonly adjective: string
  readonly noun: string
}

function joinName(parts: NameParts): string {
  return `${parts.adjective} ${parts.noun}`
}

/**
 * 무작위로 하나 고른다.
 *
 * `Math.random`을 쓰는 이유는 이 값이 판의 진행과 무관하기 때문이다 — 물건이 나오는
 * 순서처럼 양쪽이 같아야 하는 값이 아니라 사람이 자기 이름을 뽑는 자리다.
 */
function randomName(pick: () => number = Math.random): NameParts {
  const list = nouns()
  const adjective = ADJECTIVES[Math.floor(pick() * ADJECTIVES.length)] ?? ADJECTIVES[0]!
  const noun = list[Math.floor(pick() * list.length)] ?? list[0]!
  return { adjective, noun }
}

/** 고를 수 있는 이름의 가짓수 */
function nameCount(): number {
  return ADJECTIVES.length * nouns().length
}

/**
 * 저장된 이름이 지금 재료로 만들 수 있는 것인지.
 *
 * 저장소는 사용자가 손으로 고칠 수 있는 자리다. 검사 없이 믿으면 자유 입력을
 * 막아둔 의미가 사라진다 — 순위표로 가는 값은 여기를 통과한 것이어야 한다.
 */
function isMadeName(name: string): boolean {
  const gap = name.indexOf(' ')
  if (gap < 0) {
    return false
  }
  const adjective = name.slice(0, gap)
  const noun = name.slice(gap + 1)
  return ADJECTIVES.includes(adjective) && nouns().includes(noun)
}

export { ADJECTIVES, nouns, randomName, joinName, nameCount, isMadeName }
export type { NameParts }
