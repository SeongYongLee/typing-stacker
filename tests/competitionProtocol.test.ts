import { describe, expect, it } from 'vitest'
import { parseCompetitionMessage } from '../src/competition/protocol.ts'

describe('경쟁 모드 프로토콜', () => {
  it('개인 단어 밭 메시지를 받는다', () => {
    const parsed = parseCompetitionMessage({
      t: 'cWords',
      for: 'p1',
      matchId: 'competition-1',
      words: [
        { id: 1, word: '사과', side: 'left', slot: 0, y: 0.4, state: 'active', fade: 1 },
      ],
    })
    expect(parsed).toMatchObject({ t: 'cWords', for: 'p1' })
  })

  it('드롭은 단어 문자열이 아니라 개인 밭의 인스턴스 번호로 청한다', () => {
    expect(parseCompetitionMessage({
      t: 'cDrop',
      wordId: 3,
      aimX: 0.2,
      matchId: 'competition-1',
    })).toEqual({ t: 'cDrop', wordId: 3, aimX: 0.2, matchId: 'competition-1' })
  })

  it('음수 단어 번호와 NaN 조준을 거절한다', () => {
    expect(parseCompetitionMessage({
      t: 'cDrop', wordId: -1, aimX: 0, matchId: 'competition-1',
    })).toBeNull()
    expect(parseCompetitionMessage({
      t: 'cDrop', wordId: 1, aimX: Number.NaN, matchId: 'competition-1',
    })).toBeNull()
  })

  it('여섯 명을 넘는 명단을 거절한다', () => {
    const players = Array.from({ length: 7 }, (_, index) => ({
      id: `p${index}`,
      nickname: `사람${index}`,
      device: `d${index}`,
      icon: '',
    }))
    expect(parseCompetitionMessage({ t: 'cRoster', players })).toBeNull()
  })

  it('권위 드롭의 물리 좌표가 범위를 벗어나면 거절한다', () => {
    const base = {
      t: 'cDropped',
      by: 'p0',
      wordId: 1,
      word: '사과',
      aimX: 0,
      spawnY: 2,
      variantId: 'apple',
      itemId: 1,
      applyAtTick: 3,
      matchId: 'competition-1',
    }
    expect(parseCompetitionMessage({ ...base, aimX: 999 })).toBeNull()
    expect(parseCompetitionMessage({ ...base, spawnY: 999 })).toBeNull()
  })

  it('종료 이유는 최후 생존과 물리 한도만 받는다', () => {
    expect(parseCompetitionMessage({
      t: 'cOver', winner: 'p0', reason: 'lastAlive', matchId: 'competition-1',
    })).not.toBeNull()
    expect(parseCompetitionMessage({
      t: 'cOver', winner: null, reason: 'unknown', matchId: 'competition-1',
    })).toBeNull()
  })

  it('하트는 3보다 클 수 없다', () => {
    expect(parseCompetitionMessage({
      t: 'cLives',
      matchId: 'competition-1',
      lives: [['p0', 4]],
      misses: [['p0', 0]],
    })).toBeNull()
  })
})
