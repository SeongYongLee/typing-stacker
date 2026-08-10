import { describe, expect, it } from 'vitest'
import { MAX_BODIES, parseMessage } from '../src/multi/protocol.ts'

const BODY = {
  itemId: 1,
  variantId: 'apple',
  owner: 'p1',
  x: 0.5,
  y: 1.2,
  rotation: 0.1,
}

const CURRENT = {
  ...BODY,
  stateVersion: 1,
  vx: 0.3,
  vy: -0.4,
  angularVelocity: 0.2,
  sleeping: false,
  settled: true,
  anchored: true,
  lost: false,
  settleTimer: 0.35,
  restX: 0.5,
  restY: 1.2,
  previousSpeed: 0.5,
  dislodged: false,
  impacted: true,
  struck: true,
}

const body = (itemId: number) => ({ ...BODY, itemId })
const currentBody = (itemId: number) => ({ ...CURRENT, itemId })

describe('sync 키프레임', () => {
  it('붙어 있는 짝과 운동 상태를 함께 나른다', () => {
    const parsed = parseMessage({
      t: 'sync',
      bodies: [currentBody(1), currentBody(2), currentBody(3)],
      welds: [[1, 2], [2, 3]],
      tick: 42,
      matchId: 'round-1',
    })
    expect(parsed).toMatchObject({
      t: 'sync', matchId: 'round-1', tick: 42, welds: [[1, 2], [2, 3]],
    })
    expect(parsed?.t === 'sync' && parsed.bodies[0]).toMatchObject({
      stateVersion: 1,
      vx: CURRENT.vx,
      vy: CURRENT.vy,
      angularVelocity: CURRENT.angularVelocity,
      sleeping: false,
      settled: true,
      anchored: true,
    })
  })

  it('새 필드와 관절이 없는 옛 키프레임은 로컬 상태를 보존할 수 있게 그대로 통과시킨다', () => {
    const parsed = parseMessage({ t: 'sync', bodies: [BODY] })
    expect(parsed).toMatchObject({ t: 'sync', welds: [], bodies: [BODY] })
    expect(parsed?.t === 'sync' && 'stateVersion' in parsed.bodies[0]!).toBe(false)
  })

  it('tick은 있으면 안전한 정수여야 한다', () => {
    expect(parseMessage({ t: 'sync', bodies: [BODY], tick: -1 })).toBeNull()
    expect(parseMessage({ t: 'sync', bodies: [BODY], tick: 1.2 })).toBeNull()
  })

  it('현재 상태 필드가 일부만 온 프레임은 통째로 거부한다', () => {
    expect(parseMessage({
      t: 'sync', bodies: [{ ...BODY, vx: 1 }], welds: [],
    })).toBeNull()
    const { struck: _missing, ...partial } = CURRENT
    expect(parseMessage({ t: 'sync', bodies: [partial], welds: [] })).toBeNull()
  })

  it.each([
    { bodies: [body(1), body(1)], welds: [] },
    { bodies: [body(1), body(2)], welds: [[1, 1]] },
    { bodies: [body(1)], welds: [[1, 2]] },
    { bodies: [body(1), body(2)], welds: [[1, 2], [2, 1]] },
    { bodies: [body(1), body(2)], welds: [[1, 'x']] },
  ])('파괴적 키프레임은 일부가 잘못돼도 통째로 버린다', (value) => {
    expect(parseMessage({ t: 'sync', ...value })).toBeNull()
  })

  it('물건과 관절을 상한보다 많이 받지 않는다', () => {
    const bodies = Array.from({ length: MAX_BODIES + 1 }, (_, index) => body(index + 1))
    expect(parseMessage({ t: 'sync', bodies, welds: [] })).toBeNull()

    const validBodies = Array.from({ length: MAX_BODIES }, (_, index) => body(index + 1))
    const welds = Array.from({ length: 257 }, (_, index) => [1, (index % (MAX_BODIES - 1)) + 2])
    expect(parseMessage({ t: 'sync', bodies: validBodies, welds })).toBeNull()
  })
})
