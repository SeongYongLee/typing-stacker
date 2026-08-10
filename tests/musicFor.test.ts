import { describe, expect, it } from 'vitest'
import { musicFor, type MusicScene } from '../src/screenMusic.ts'

/** 어느 화면에서 무엇이 흐르는지는 `musicFor` 한 곳이 정한다. */
function scene(overrides: Partial<MusicScene>): MusicScene {
  return {
    route: 'title',
    titleTheme: 'day',
    soloPhase: null,
    soloTimeOfDay: null,
    matchPhase: null,
    ...overrides,
  }
}

describe('스플래시 낮·밤 음악', () => {
  it('그림과 같은 낮·밤 곡을 고른다', () => {
    expect(musicFor(scene({ route: 'title', titleTheme: 'day' }))).toBe('splashDay')
    expect(musicFor(scene({ route: 'title', titleTheme: 'night' }))).toBe('splashNight')
  })

  it('옵션과 이름 화면에서도 들어온 스플래시 곡을 이어간다', () => {
    expect(musicFor(scene({ route: 'options', titleTheme: 'night' }))).toBe('splashNight')
    expect(musicFor(scene({ route: 'name', titleTheme: 'day' }))).toBe('splashDay')
  })
})

describe('플레이 낮·밤 음악', () => {
  it('첫 밤은 시작 곡, 보통 밤은 밤 곡, 낮은 낮 곡이다', () => {
    expect(musicFor(scene({ route: 'solo', soloPhase: 'playing', soloTimeOfDay: 'firstNight' }))).toBe('gameFirstNight')
    expect(musicFor(scene({ route: 'solo', soloPhase: 'playing', soloTimeOfDay: 'night' }))).toBe('gameNight')
    expect(musicFor(scene({ route: 'solo', soloPhase: 'playing', soloTimeOfDay: 'day' }))).toBe('gameDay')
  })

  it('판이 끝나도 마지막 낮·밤 곡은 이어진다', () => {
    expect(musicFor(scene({ route: 'solo', soloPhase: 'over', soloTimeOfDay: 'firstNight' }))).toBe('gameFirstNight')
    expect(musicFor(scene({ route: 'solo', soloPhase: 'over', soloTimeOfDay: 'day' }))).toBe('gameDay')
    expect(musicFor(scene({ route: 'solo', soloPhase: 'over', soloTimeOfDay: 'night' }))).toBe('gameNight')
  })

  it('일시정지만 조용하다', () => {
    expect(musicFor(scene({ route: 'solo', soloPhase: 'paused', soloTimeOfDay: 'day' }))).toBeNull()
  })

  it('대전은 낮에 머물고 시작 전에는 대기방 곡이다', () => {
    expect(musicFor(scene({ route: 'lobby', matchPhase: null }))).toBe('lobby')
    expect(musicFor(scene({ route: 'lobby', matchPhase: 'playing' }))).toBe('gameDay')
    expect(musicFor(scene({ route: 'lobby', matchPhase: 'over' }))).toBe('gameDay')
  })
})

describe('다른 화면', () => {
  it('도감은 전용 곡이고 loopback은 조용하다', () => {
    expect(musicFor(scene({ route: 'collection' }))).toBe('collection')
    expect(musicFor(scene({ route: 'loopback' }))).toBeNull()
  })
})
