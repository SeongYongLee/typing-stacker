import { describe, expect, it } from 'vitest'
import { musicFor } from '../src/screenMusic.ts'

/**
 * 어느 화면에서 무엇이 흐르는지는 `musicFor` 한 곳이 정한다.
 *
 * 화면마다 각자 부르게 두면 어느 쪽이 마지막으로 렌더됐는지에 따라 곡이 갈리고,
 * 화면 구조를 바꿀 때마다 그 순서가 조용히 뒤집힌다. 규칙이 한자리에 있으니
 * 그 규칙을 여기서 지킨다 — 소리는 귀로만 확인할 수 있지만 **어느 곡을 고르는가**는 잴 수 있다.
 */
describe('판이 끝나도 곡은 이어진다', () => {
  it('혼자 하기 — 끝난 뒤에도 판 곡이다', () => {
    /*
     * 결과를 보고 바로 다시 시작하는 것이 이 게임의 보통 흐름이다. 끝날 때마다 곡이
     * 물러났다가 다시 시작할 때 처음부터 들어오면 그 사이가 매번 끊김으로 남는다.
     */
    expect(musicFor('solo', 'playing', null)).toBe('game')
    expect(musicFor('solo', 'collapsing', null)).toBe('game')
    expect(musicFor('solo', 'over', null)).toBe('game')
  })

  it('함께 하기 — 끝난 뒤에도 판 곡이다', () => {
    expect(musicFor('lobby', null, 'playing')).toBe('game')
    expect(musicFor('lobby', null, 'over')).toBe('game')
  })

  it('일시정지만 조용하다 — 멈췄다는 것 자체가 알려야 할 것이다', () => {
    expect(musicFor('solo', 'paused', null)).toBeNull()
  })

  it('판을 떠나면 그 화면의 곡으로 넘어간다', () => {
    expect(musicFor('title', 'over', null)).toBe('title')
    expect(musicFor('collection', 'over', null)).toBe('collection')
    expect(musicFor('options', 'over', null)).toBe('title')
    expect(musicFor('name', 'over', null)).toBe('title')
    // 판이 시작되기 전(방 만들기·준비)에는 대기방 곡
    expect(musicFor('lobby', null, null)).toBe('lobby')
  })
})
