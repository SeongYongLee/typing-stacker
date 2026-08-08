/**
 * 한국어 조사를 낱말에 맞춰 고른다.
 *
 * 이름과 물건 이름이 모두 **자동으로 만들어지므로** 조사를 손으로 적을 수 없다.
 * "방장가 먼저 노렸다"처럼 어긋나면 그 한 글자가 문장 전체를 어색하게 만든다.
 *
 * 받침이 있으면 이/을/은, 없으면 가/를/는이다. 한글 음절은 (코드 − 0xAC00) % 28이
 * 0이 아니면 받침이 있다.
 *
 * 한글이 아닌 글자로 끝나면(영문·숫자) **받침 없는 쪽으로 둔다.** 규칙이 갈리는
 * 자리라 어느 쪽이든 틀릴 수 있지만, 이름은 우리가 만든 낱말이라 실제로는 늘 한글이다.
 */
const FIRST = 0xac00
const LAST = 0xd7a3
const JONGSEONG_COUNT = 28

function hasFinalConsonant(word: string): boolean {
  const last = word.trim().at(-1)
  if (last === undefined) {
    return false
  }
  const code = last.codePointAt(0)
  if (code === undefined || code < FIRST || code > LAST) {
    return false
  }
  return (code - FIRST) % JONGSEONG_COUNT !== 0
}

/** 이 / 가 */
function subject(word: string): string {
  return hasFinalConsonant(word) ? '이' : '가'
}

/** 을 / 를 */
function object(word: string): string {
  return hasFinalConsonant(word) ? '을' : '를'
}

/** 은 / 는 */
function topic(word: string): string {
  return hasFinalConsonant(word) ? '은' : '는'
}

/** 낱말과 조사를 붙여 돌려준다 — 부르는 쪽에서 두 번 쓰지 않게 */
function withSubject(word: string): string {
  return `${word}${subject(word)}`
}

function withObject(word: string): string {
  return `${word}${object(word)}`
}

function withTopic(word: string): string {
  return `${word}${topic(word)}`
}

export { hasFinalConsonant, subject, object, topic, withSubject, withObject, withTopic }
