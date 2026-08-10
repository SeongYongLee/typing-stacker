import { describe, expect, it, vi } from 'vitest'
import { CatPickup, DURATION, GRAB_AT, KINDS, catPickupY } from '../src/game/systems/CatPickup.ts'
import { catPose } from '../src/game/renderer/catPose.ts'
import { ARENA_ART } from '../src/game/renderer/arenaArt.generated.ts'
import { ARENA } from '../src/game/config.ts'
import { ALL_VARIANTS } from '../src/game/data/words.ts'

/**
 * 물건을 놓치면 뛰어드는 고양이.
 *
 * 여기서 지키는 것은 **눈으로 볼 수 없는 것들**이다 — 몇 마리가 나오는지, 언제
 * 사라지는지, 판의 난수를 건드리는지. 뛰는 곡선이 예쁜지는 실기로만 알 수 있고,
 * 이 파일이 그것까지 지키는 척하면 값을 손볼 때마다 헛되이 깨진다.
 */

const ITEM = ALL_VARIANTS[0]!

function cat(): CatPickup {
  return new CatPickup()
}

describe('고양이는 한 마리만 나온다', () => {
  /**
   * 탑이 무너지면 한 프레임에 여럿이 떨어진다. 그때마다 부르면 고양이가 여럿
   * 교차해 **무엇이 목숨을 깎았는지 오히려 안 보인다.**
   */
  it('뛰는 중에 또 놓쳐도 늘어나지 않는다', () => {
    const cats = cat()
    cats.take(ITEM, -1.5, 0.4)
    const first = cats.view
    cats.take(ITEM, 2.2, 0.1)
    expect(cats.view?.x).toBe(first?.x)
  })

  it('다 지나가면 사라진다', () => {
    const cats = cat()
    cats.take(ITEM, -1.5, 0.4)
    cats.update(DURATION * 0.5)
    expect(cats.view).not.toBeNull()
    cats.update(DURATION * 0.6)
    expect(cats.view).toBeNull()
  })

  /** 앞 판의 고양이가 새 판에 남아 있으면 안 된다 */
  it('판을 다시 시작하면 비워진다', () => {
    const cats = cat()
    cats.take(ITEM, -1.5, 0.4)
    cats.reset()
    expect(cats.view).toBeNull()
  })

  /**
   * 무적이 이어지는 동안 끝나야 한다. 그보다 길면 다음 이탈이 왔을 때 앞 고양이가
   * 아직 화면에 있어, 방금 깎인 목숨이 아니라 지난 것을 보고 있게 된다.
   */
  it('무적 시간 안에 끝난다', () => {
    expect(DURATION).toBeLessThan(2)
  })

  it('카메라가 올라가도 현재 화면 아래쪽에서 물어 간다', () => {
    const cameraY = 8
    expect(catPickupY(ARENA.killY - 0.1, cameraY)).toBeGreaterThan(cameraY + ARENA.killY)
  })

  it('이미 보이는 높이에서 떨어진 물건은 그 자리를 유지한다', () => {
    expect(catPickupY(3.2, 0)).toBe(3.2)
  })
})

describe('판의 난수를 쓰지 않는다', () => {
  /**
   * 연출이 판의 난수열에 끼어들면 **고양이 한 마리 때문에 같은 시드가 같은 판을
   * 못 만든다.** 부스러기(`TrailField`)와 같은 규칙이다.
   */
  it('Math.random을 부르지 않는다', () => {
    const spy = vi.spyOn(Math, 'random')
    const cats = cat()
    cats.take(ITEM, -1.5, 0.4)
    cats.update(0.2)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  /** 나올 때마다 무작위다. 한 마리만 계속 나오면 네 마리를 그린 뜻이 없다 */
  it('되풀이하면 여러 마리가 나온다', () => {
    const cats = cat()
    const seen = new Set<string>()
    for (let i = 0; i < 40; i += 1) {
      cats.reset()
      cats.take(ITEM, -1.5, 0.4)
      seen.add(cats.view!.kind)
    }
    expect(seen.size).toBeGreaterThan(1)
  })
})

describe('떨어진 쪽에서 들어온다', () => {
  /**
   * 반대쪽에서 오면 화면을 가로질러 와야 해서 뛰어드는 것이 아니라 지나가는 것으로
   * 보이고, 물건에 닿는 순간도 늦다.
   */
  it('왼쪽에서 놓치면 왼쪽 고양이다', () => {
    const cats = cat()
    cats.take(ITEM, -1.8, 0.2)
    expect(cats.view?.from).toBe('left')
  })

  it('오른쪽에서 놓치면 오른쪽 고양이다', () => {
    const cats = cat()
    cats.take(ITEM, 1.8, 0.2)
    expect(cats.view?.from).toBe('right')
  })
})

describe('뛰는 모양', () => {
  function poseAt(progress: number, x = -1.8) {
    const cats = cat()
    cats.take(ITEM, x, 0.2)
    cats.update(DURATION * progress)
    return catPose(cats.view!)
  }

  /**
   * **물기 전에는 물건이 고양이에게 붙지 않는다.** 붙여 그리면 고양이가 빈손으로
   * 다가가 이미 물고 있는 것이 되어, 무는 순간 자체가 사라진다.
   */
  it('물기 전에는 아무것도 안 들고 있다', () => {
    expect(poseAt(GRAB_AT * 0.5).carry).toBeNull()
    expect(poseAt(GRAB_AT + 0.1).carry).not.toBeNull()
  })

  /**
   * 무는 자리가 **가장 높다.** 올라가며 무는 것이 아니라 다 올라가서 물어야
   * 뛰어올라 낚아챈 것으로 읽힌다.
   */
  it('무는 순간이 꼭대기다', () => {
    const apex = poseAt(GRAB_AT).y
    expect(poseAt(GRAB_AT * 0.6).y).toBeLessThan(apex)
    expect(poseAt(GRAB_AT + 0.3).y).toBeLessThan(apex)
  })

  /** 화면 밖 아래에서 올라와 아래로 내려간다 — 허공에서 생겼다 사라지면 안 된다 */
  it('시작과 끝은 물건보다 한참 아래다', () => {
    expect(poseAt(0).y).toBeLessThan(0.2 - 1.3)
    // 1.0에서는 이미 치워져 있다 — 마지막으로 보이는 프레임을 본다
    expect(poseAt(0.99).y).toBeLessThan(0.2 - 1.3)
  })

  /** 물건을 갖고 바깥으로 물러난다. 안쪽으로 가면 받침대를 밟고 지나간다 */
  it('물고 나서 바깥으로 간다', () => {
    expect(poseAt(0.99, -1.8).x).toBeLessThan(-1.8)
    expect(poseAt(0.99, 1.8).x).toBeGreaterThan(1.8)
  })

  /**
   * **그림이 실제로 있어야 한다.**
   *
   * 고양이는 `prepare-arena.cjs`를 거쳐 들어오는데, 마리를 하나 더 그려 `KINDS`에만
   * 적고 파이프라인 등록을 잊으면 **그 고양이가 나온 판에서만 아무것도 안 그려진다** —
   * 넷 중 하나라 손으로는 좀처럼 못 만난다.
   */
  it('네 마리 여덟 장이 모두 있다', () => {
    for (const kind of KINDS) {
      for (const from of ['left', 'right'] as const) {
        expect(ARENA_ART, `${kind}/${from}`).toHaveProperty(`cat-${kind}-${from}`)
      }
    }
  })
})
