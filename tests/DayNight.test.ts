import { describe, expect, it } from 'vitest'
import { FIRST_NIGHT_SEC, DAY_SEC, NIGHT_SEC } from '../src/game/config.ts'
import { timeOfDay, TWILIGHT_SEC } from '../src/game/systems/DayNight.ts'

/**
 * 시간이 정하는 것은 **어떤 단어가 내려오는가** 하나뿐이다.
 * 여기서 지키는 것은 그 국면이 제때 오고, 화면이 툭 바뀌지 않는다는 것 둘이다.
 */
describe('timeOfDay', () => {
  it('판이 열리면 첫 밤이다', () => {
    expect(timeOfDay(0).phase).toBe('firstNight')
    expect(timeOfDay(FIRST_NIGHT_SEC - 0.1).phase).toBe('firstNight')
  })

  it('첫 밤은 한 번뿐이다 — 그 뒤로는 낮과 밤만 돈다', () => {
    /*
     * 배우는 구간이 되풀이되면 그때부터는 배울 것이 없는데 밭만 좁아진 구간이 된다.
     */
    for (let t = FIRST_NIGHT_SEC; t < FIRST_NIGHT_SEC + (DAY_SEC + NIGHT_SEC) * 5; t += 0.7) {
      expect(timeOfDay(t).phase, `${t.toFixed(1)}초`).not.toBe('firstNight')
    }
  })

  it('첫 밤 다음은 낮, 그다음이 밤', () => {
    expect(timeOfDay(FIRST_NIGHT_SEC).phase).toBe('day')
    expect(timeOfDay(FIRST_NIGHT_SEC + DAY_SEC - 0.1).phase).toBe('day')
    expect(timeOfDay(FIRST_NIGHT_SEC + DAY_SEC).phase).toBe('night')
    expect(timeOfDay(FIRST_NIGHT_SEC + DAY_SEC + NIGHT_SEC - 0.1).phase).toBe('night')
    // 한 바퀴 돌면 다시 낮
    expect(timeOfDay(FIRST_NIGHT_SEC + DAY_SEC + NIGHT_SEC).phase).toBe('day')
  })

  it('낮이 밤보다 길다 — 밤은 몰아치는 구간이라 짧아야 반갑다', () => {
    expect(DAY_SEC).toBeGreaterThan(NIGHT_SEC)
  })

  it('판을 열면 곧바로 밤이다 — 처음 몇 번의 타자로 합성을 본다', () => {
    expect(timeOfDay(0).phase).toBe('firstNight')
    expect(timeOfDay(0).nightfall).toBe(1)
  })

  it('보통 길이의 판이 밤을 만난다', () => {
    /*
     * 첫 밤이 판이 열리자마자 오므로 짧은 판도 밤을 본다. 두 번째 밤은 45초부터라
     * 오래 버틴 판만 만난다 — 그건 잘하는 사람에게 주는 것이라 그대로 둔다.
     */
    const run = 40
    const seen = new Set<string>()
    for (let t = 0; t < run; t += 0.5) {
      seen.add(timeOfDay(t).phase)
    }
    expect(seen.has('firstNight'), `${run}초 판에서 첫 밤을 못 봤다`).toBe(true)
    expect(seen.has('day')).toBe(true)
  })

  it('국면 안의 진행도는 0에서 1로 간다', () => {
    expect(timeOfDay(FIRST_NIGHT_SEC + 0.001).progress).toBeCloseTo(0, 2)
    expect(timeOfDay(FIRST_NIGHT_SEC + DAY_SEC - 0.001).progress).toBeCloseTo(1, 2)
  })

  it('해는 순간이 아니라 걸쳐서 진다', () => {
    // 낮 한복판은 완전히 밝다
    expect(timeOfDay(FIRST_NIGHT_SEC + DAY_SEC / 2).nightfall).toBe(0)
    // 낮이 끝나기 직전에는 이미 저물고 있다
    const dusk = timeOfDay(FIRST_NIGHT_SEC + DAY_SEC - TWILIGHT_SEC / 2).nightfall
    expect(dusk).toBeGreaterThan(0)
    expect(dusk).toBeLessThan(1)
    // 밤 한복판은 완전히 어둡다
    expect(timeOfDay(FIRST_NIGHT_SEC + DAY_SEC + NIGHT_SEC / 2).nightfall).toBe(1)
  })

  it('경계에서 밝기가 튀지 않는다', () => {
    /*
     * 국면이 바뀌는 순간 화면이 툭 바뀌면 "무슨 일이 났나" 하고 손이 멈춘다.
     * 어느 지점에서든 0.1초 사이의 변화가 눈에 띌 만큼 크면 안 된다.
     */
    let worst = 0
    for (let t = 0; t < FIRST_NIGHT_SEC + (DAY_SEC + NIGHT_SEC) * 3; t += 0.1) {
      const jump = Math.abs(timeOfDay(t + 0.1).nightfall - timeOfDay(t).nightfall)
      worst = Math.max(worst, jump)
    }
    expect(worst, `가장 큰 변화 ${worst.toFixed(3)}`).toBeLessThan(0.1)
  })
})
