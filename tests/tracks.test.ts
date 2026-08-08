import { describe, expect, it } from 'vitest'
import { TRACKS, type BgmTrack } from '../src/audio/tracks.ts'

/** 한 바퀴 도는 데 걸리는 시간(초) */
function loopSeconds(track: BgmTrack): number {
  const stepSec = 60 / track.bpm / 2
  return track.bars.length * track.stepsPerBar * stepSec
}

function totalSteps(track: BgmTrack): number {
  return track.bars.length * track.stepsPerBar
}

const entries = Object.entries(TRACKS)

describe('배경음악 악보', () => {
  /**
   * 처음에는 4마디(11초)였다. 한 판이 1분을 넘기므로 같은 자리가 다섯 번 넘게
   * 돌아왔고, 그쯤 되면 음악이 배경이 아니라 시계처럼 들린다.
   */
  it('판이 도는 동안의 곡은 한 바퀴가 40초를 넘는다', () => {
    expect(loopSeconds(TRACKS.game)).toBeGreaterThan(40)
  })

  it('모든 곡이 한 바퀴 20초를 넘는다', () => {
    for (const [name, track] of entries) {
      expect(loopSeconds(track), name).toBeGreaterThan(20)
    }
  })

  /**
   * 화음 자리가 비어 있으면 그 마디에서 소리가 사라진다.
   * 표를 손으로 쓰므로 한 칸을 빠뜨리기 쉽다.
   */
  it('모든 마디에 베이스와 세 음 화음이 있다', () => {
    for (const [name, track] of entries) {
      expect(track.bars.length, name).toBeGreaterThan(0)
      for (const bar of track.bars) {
        expect(bar.chord, name).toHaveLength(3)
        // 베이스가 화음보다 위로 올라가면 소리의 아래가 비어 허전해진다
        expect(bar.bass, name).toBeLessThan(Math.min(...bar.chord))
      }
    }
  })

  /**
   * 아르페지오가 칸을 다 채우면 효과음이 끼어들 틈이 없다.
   * 이 게임에서 귀가 실제로 쓰는 정보는 음악이 아니라 얹혔는지·놓쳤는지다.
   */
  it('아르페지오는 마디의 칸을 다 채우지 않는다', () => {
    for (const [name, track] of entries) {
      expect(track.pattern, name).toHaveLength(track.stepsPerBar)
      const filled = track.pattern.filter(Boolean).length
      expect(filled, name).toBeGreaterThan(0)
      expect(filled, name).toBeLessThan(track.stepsPerBar)
    }
  })

  it('베이스 자리는 마디 안에 있다', () => {
    for (const [name, track] of entries) {
      expect(track.bass.steps.length, name).toBeGreaterThan(0)
      for (const step of track.bass.steps) {
        expect(step, name).toBeGreaterThanOrEqual(0)
        expect(step, name).toBeLessThan(track.stepsPerBar)
      }
    }
  })

  /**
   * 멜로디는 한 바퀴 안의 절대 위치로 적는다. 범위를 벗어난 음은 영영 울리지 않는데,
   * 그 실패는 조용하다 — 소리가 안 나는 것 말고는 아무 표시도 없다.
   */
  it('멜로디 음은 전부 한 바퀴 안에 있다', () => {
    for (const [name, track] of entries) {
      const melody = track.melody
      if (melody === null) {
        continue
      }
      const steps = totalSteps(track)
      for (const [at, midi, length] of melody.notes) {
        expect(at, `${name} @${at}`).toBeGreaterThanOrEqual(0)
        expect(at, `${name} @${at}`).toBeLessThan(steps)
        expect(length, `${name} @${at}`).toBeGreaterThan(0)
        // 사람이 노래로 들을 수 있는 범위. 너무 높으면 그것만으로 뾰족해진다
        expect(midi, `${name} @${at}`).toBeGreaterThanOrEqual(55)
        expect(midi, `${name} @${at}`).toBeLessThanOrEqual(88)
      }
    }
  })

  it('같은 자리에서 멜로디 음이 겹치지 않는다', () => {
    for (const [name, track] of entries) {
      const melody = track.melody
      if (melody === null) {
        continue
      }
      const seen = new Set<number>()
      for (const [at] of melody.notes) {
        expect(seen.has(at), `${name} @${at}`).toBe(false)
        seen.add(at)
      }
    }
  })
})

/**
 * 넷이 서로 다른 곡으로 들려야 한다.
 *
 * 처음에는 빠르기와 화음표만 바꿔 만들었는데 실기로 들으니 전부 같은 곡이었다 —
 * 음색이 같고 박자가 같고 멜로디가 없으면, 코드 진행을 바꿔도 뭉뚱그려 들린다.
 * 여기서 지키는 것은 "무엇으로 갈랐는가"다.
 */
describe('곡끼리 서로 다르다', () => {
  it('메뉴 곡은 판보다 느리다', () => {
    for (const name of ['title', 'lobby', 'collection'] as const) {
      expect(TRACKS[name].bpm, name).toBeLessThan(TRACKS.game.bpm)
    }
  })

  it('빠르기가 넷 다 다르다', () => {
    const bpms = entries.map(([, track]) => track.bpm)
    expect(new Set(bpms).size).toBe(entries.length)
  })

  it('박자가 넷 다 같지는 않다', () => {
    const meters = new Set(entries.map(([, track]) => track.stepsPerBar))
    expect(meters.size).toBeGreaterThan(1)
  })

  /** 아르페지오 음색이 전부 같으면 조성을 바꿔도 같은 곡으로 들린다 */
  it('아르페지오 음색이 적어도 셋으로 갈린다', () => {
    const types = new Set(entries.map(([, track]) => track.arp.type))
    expect(types.size).toBeGreaterThanOrEqual(3)
  })

  it('첫 화음이 곡마다 다르다 — 중심음이 갈린다는 뜻이다', () => {
    const roots = entries.map(([, track]) => track.bars[0]?.bass)
    expect(new Set(roots).size).toBe(entries.length)
  })

  /**
   * 판에는 멜로디를 두지 않는다. 귀가 쓸 정보는 얹혔는지·놓쳤는지이고
   * 멜로디는 그 주의를 가져간다 — 없는 것 자체가 판의 성격이다.
   */
  it('판만 멜로디가 없고 나머지는 있다', () => {
    expect(TRACKS.game.melody).toBeNull()
    for (const name of ['title', 'lobby', 'collection'] as const) {
      expect(TRACKS[name].melody, name).not.toBeNull()
    }
  })

  it('대기방만 화음을 깔지 않는다 — 넷 중 유일하게 마른 소리다', () => {
    expect(TRACKS.lobby.pad).toBeNull()
    for (const name of ['game', 'title', 'collection'] as const) {
      expect(TRACKS[name].pad, name).not.toBeNull()
    }
  })
})
