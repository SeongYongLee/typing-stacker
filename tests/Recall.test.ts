import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GameEngine, type GameState } from '../src/game/core/GameEngine.ts'
import { FrameClock } from './helpers/frameClock.ts'

/**
 * 화이트보드에 적힌 단어를 치면 **목숨이 깎이지 않는다.**
 *
 * 이 규칙의 전부가 그 한 줄이고, 그것만큼은 엔진을 돌려봐야 안다 — 순수 로직
 * (`Whiteboard`·`Catcher`)은 "무엇이 적히고 판이 어디 서는가"까지만 말한다. 물건이
 * 실제로 판을 타고 나가는지, 나간 것이 목숨으로 세어지는지는 물리와 엔진이 정한다.
 *
 * **가장 나쁜 고장은 조용하다.** 표를 잃어버리면 회수한 물건이 평범한 이탈로 세어져
 * 목숨이 깎이는데, 화면에서는 손이 물건을 가져가는 것으로 똑같이 보인다.
 */
describe('회수된 물건은 목숨을 깎지 않는다', () => {
  const clock = new FrameClock()
  beforeEach(() => clock.install())
  afterEach(() => clock.uninstall())

  /**
   * 보드에 적힌 셋은 단어 107개 중 셋이라 **화면에 잘 안 뜬다.** 한 판만 보면 한 번도
   * 못 치고 끝나서 시험이 아무것도 안 지킨 채 통과한다. 그래서 여러 시드를 돌려
   * 회수를 모으고, 한 번도 못 모았으면 그것 자체를 실패로 본다.
   *
   * 치지 않고 기다리는 이유는 **목숨이 다른 이유로 줄면 안 되기 때문**이다. 아무것도
   * 안 치면 물건이 안 떨어지므로 이탈도 없다 — 그 상태에서 회수만 시켜야 "회수가
   * 목숨을 깎았는가"를 정확히 잰다.
   */
  it('보드 단어를 치면 목숨이 그대로다', async () => {
    let recalls = 0

    for (const seed of [20260810, 7, 4242, 99]) {
      const engine = await GameEngine.create(seed)
      let state: GameState | null = null
      engine.onStateChange((next) => {
        state = next
      })
      engine.startRun()

      for (let t = 0; t < 200; t += 0.25) {
        await clock.advance(0.25)
        const now = state as GameState | null
        if (now === null || now.phase !== 'playing') {
          break
        }
        const board = new Set(now.whiteboard)
        const target = now.words.find((word) => word.state === 'active' && board.has(word.word))
        if (target === undefined) {
          continue
        }

        const before = now.stats.lives
        engine.submit(target.word)
        recalls += 1

        /*
         * 물건이 판을 타고 나갈 시간을 준다. 판은 1.4초 뒤 사라지므로 그보다 넉넉히
         * 본다 — 나가는 순간이 목숨을 세는 순간이다.
         */
        await clock.advance(3)
        const after = state as GameState | null
        expect(
          after?.stats.lives,
          `${target.word}을 회수했는데 목숨이 줄었다 (${before} → ${after?.stats.lives})`,
        ).toBe(before)
      }

      engine.dispose()
      if (recalls >= 3) {
        break
      }
    }

    expect(recalls, '보드 단어를 한 번도 못 쳤다 — 시험이 아무것도 안 지킨다').toBeGreaterThan(0)
  }, 120_000)
})
