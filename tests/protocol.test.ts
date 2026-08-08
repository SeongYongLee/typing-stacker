import { describe, expect, it } from 'vitest'
import {
  MAX_PLAYERS,
  NICKNAME_MAX,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  createRoomCode,
  isRoomCode,
  parseMessage,
  sanitizeNickname,
} from '../src/multi/protocol.ts'
import { createRng } from '../src/game/systems/Rng.ts'

describe('parseMessage — 상대가 보낸 것은 전부 거짓일 수 있다', () => {
  it('모르는 메시지는 버린다', () => {
    expect(parseMessage(null)).toBeNull()
    expect(parseMessage('drop')).toBeNull()
    expect(parseMessage(42)).toBeNull()
    expect(parseMessage({})).toBeNull()
    expect(parseMessage({ t: '해킹' })).toBeNull()
  })

  it('drop은 단어와 조준값이 모두 성해야 통과한다', () => {
    expect(parseMessage({ t: 'drop', word: '문어', aimX: 0.3 })).toEqual({
      t: 'drop',
      word: '문어',
      aimX: 0.3,
    })
    expect(parseMessage({ t: 'drop', word: '문어' })).toBeNull()
    expect(parseMessage({ t: 'drop', word: '', aimX: 0 })).toBeNull()
    expect(parseMessage({ t: 'drop', word: '문어', aimX: 'NaN' })).toBeNull()
    expect(parseMessage({ t: 'drop', word: '문어', aimX: Number.NaN })).toBeNull()
    expect(parseMessage({ t: 'drop', word: '문어', aimX: Number.POSITIVE_INFINITY })).toBeNull()
  })

  it('터무니없이 긴 단어는 거부한다', () => {
    expect(parseMessage({ t: 'drop', word: 'ㄱ'.repeat(200), aimX: 0 })).toBeNull()
  })

  it('닉네임은 길이를 자르고 제어문자를 지운다', () => {
    expect(sanitizeNickname('이성용')).toBe('이성용')
    expect(sanitizeNickname('a'.repeat(50)).length).toBe(NICKNAME_MAX)
    expect(sanitizeNickname('줄\n바꿈\t섞임')).toBe('줄바꿈섞임')
    expect(sanitizeNickname('   ')).toBe('이름없음')
    expect(sanitizeNickname(undefined)).toBe('이름없음')
    expect(sanitizeNickname(123)).toBe('이름없음')
  })

  it('hello는 닉네임이 이상해도 안전한 값으로 통과시킨다', () => {
    expect(parseMessage({ t: 'hello', nickname: 42, device: 'dev-1' })).toEqual({
      t: 'hello',
      nickname: '이름없음',
      device: 'dev-1',
      // 아이콘을 안 보낸 옛 클라이언트도 붙을 수 있어야 한다 — 없으면 없는 채로 둔다
      icon: '',
    })
  })

  /*
   * 기기 id가 없으면 빈 문자열로 둔다 — 그 판은 레이팅에 반영되지 않을 뿐,
   * 대전 자체는 되어야 한다. 옛 버전과 붙었을 때 판이 안 열리면 안 된다.
   */
  it('기기 id가 없으면 빈 값으로 통과시킨다', () => {
    expect(parseMessage({ t: 'hello', nickname: '자두' })).toEqual({
      t: 'hello',
      nickname: '자두',
      device: '',
      icon: '',
    })
  })

  it('players는 정원까지만 받는다 — 넘치는 것은 버린다', () => {
    const many = Array.from({ length: MAX_PLAYERS + 5 }, (_, i) => ({
      id: `p${i}`,
      nickname: `n${i}`,
    }))
    const parsed = parseMessage({ t: 'start', seed: 1, players: many })
    expect(parsed?.t).toBe('start')
    expect(parsed?.t === 'start' && parsed.players.length).toBe(MAX_PLAYERS)
  })

  it('lives는 음수를 0으로 눌러 받는다', () => {
    const parsed = parseMessage({
      t: 'lives',
      lives: [
        ['a', 2],
        ['b', -5],
        ['c', 'x'],
        'garbage',
      ],
    })
    expect(parsed?.t === 'lives' && parsed.lives).toEqual([
      ['a', 2],
      ['b', 0],
    ])
  })

  it('sync는 망가진 바디를 골라 버린다', () => {
    const parsed = parseMessage({
      t: 'sync',
      bodies: [
        { itemId: 1, variantId: 'octopus', owner: 'a', x: 0, y: 1, rotation: 0 },
        { itemId: 2, variantId: 'octopus', owner: 'a', x: 'nope', y: 1, rotation: 0 },
        null,
      ],
    })
    expect(parsed?.t === 'sync' && parsed.bodies).toHaveLength(1)
  })

  it('dropped는 itemId까지 있어야 통과한다 — 양쪽이 같은 물건으로 취급하는 기준이다', () => {
    const full = {
      t: 'dropped',
      by: 'a',
      word: '문어',
      aimX: 0.2,
      variantId: 'octopus',
      itemId: 3,
    }
    expect(parseMessage(full)).toEqual(full)
    const { itemId: _omitted, ...missing } = full
    expect(parseMessage(missing)).toBeNull()
  })

  it('over의 winner는 null이 될 수 있다 (무승부)', () => {
    expect(parseMessage({ t: 'over', winner: null })).toEqual({ t: 'over', winner: null })
    expect(parseMessage({ t: 'over', winner: 'a' })).toEqual({ t: 'over', winner: 'a' })
    expect(parseMessage({ t: 'over', winner: 7 })).toBeNull()
  })
})

describe('방 코드', () => {
  it('정해진 길이와 글자만 쓴다', () => {
    const rng = createRng(1)
    for (let i = 0; i < 50; i += 1) {
      const code = createRoomCode(rng.next)
      expect(code).toHaveLength(ROOM_CODE_LENGTH)
      expect(isRoomCode(code)).toBe(true)
    }
  })

  it('헷갈리는 글자를 쓰지 않는다 — 사람이 불러줘야 하는 코드다', () => {
    for (const confusing of ['0', 'o', '1', 'l', 'i']) {
      expect(ROOM_CODE_ALPHABET).not.toContain(confusing)
    }
  })

  it('같은 시드는 같은 코드를 낸다', () => {
    expect(createRoomCode(createRng(99).next)).toBe(createRoomCode(createRng(99).next))
  })

  it('무작위 대입이 비현실적일 만큼 넓다 — 짧은 코드면 남의 방에 들어올 수 있다', () => {
    const space = ROOM_CODE_ALPHABET.length ** ROOM_CODE_LENGTH
    expect(space).toBeGreaterThan(1e10)
  })

  it('잘못된 코드는 거부한다', () => {
    expect(isRoomCode('짧다')).toBe(false)
    expect(isRoomCode('a'.repeat(ROOM_CODE_LENGTH + 1))).toBe(false)
    expect(isRoomCode('0'.repeat(ROOM_CODE_LENGTH))).toBe(false)
    expect(isRoomCode('ABCDEFGH')).toBe(false)
  })
})
