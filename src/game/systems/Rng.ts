/**
 * 시드 기반 난수. Math.random()을 직접 쓰지 않는 이유는 나중에 1대1 멀티에서
 * "양쪽에 같은 단어가 같은 순서로 내려오는 매치"를 시드 하나로 재현하기 위함이다.
 */
interface Rng {
  next(): number
  int(maxExclusive: number): number
  pick<T>(items: readonly T[]): T
}

function createRng(seed: number): Rng {
  let state = seed >>> 0

  function next(): number {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  function int(maxExclusive: number): number {
    return Math.floor(next() * maxExclusive)
  }

  function pick<T>(items: readonly T[]): T {
    const item = items[int(items.length)]
    if (item === undefined) {
      throw new Error('빈 배열에서 뽑을 수 없다')
    }
    return item
  }

  return { next, int, pick }
}

export { createRng }
export type { Rng }
