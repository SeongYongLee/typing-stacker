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
const SPLASH_TRACKS = ['splashDay', 'splashNight'] as const
const GAME_TRACKS = ['gameDay', 'gameFirstNight', 'gameNight'] as const

describe('배경음악 악보', () => {
  it('플레이 곡은 한 바퀴가 40초 이상이다', () => {
    for (const name of GAME_TRACKS) {
      expect(loopSeconds(TRACKS[name]), name).toBeGreaterThanOrEqual(40)
    }
  })

  it('모든 곡이 한 바퀴 20초를 넘는다', () => {
    for (const [name, track] of entries) {
      expect(loopSeconds(track), name).toBeGreaterThan(20)
    }
  })

  it('모든 마디에 베이스와 세 음 화음이 있다', () => {
    for (const [name, track] of entries) {
      expect(track.bars.length, name).toBeGreaterThan(0)
      for (const bar of track.bars) {
        expect(bar.chord, name).toHaveLength(3)
        expect(bar.bass, name).toBeLessThan(Math.min(...bar.chord))
      }
    }
  })

  /** 음악이 칸을 다 채우면 타자·착지음이 끼어들 틈이 없다. */
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

  it('타악 패턴은 마디 길이와 같고 세기는 0~1이다', () => {
    for (const [name, track] of entries) {
      if (track.rhythm === null) continue
      expect(track.rhythm.pattern, name).toHaveLength(track.stepsPerBar)
      expect(track.rhythm.pattern.some((value) => value > 0), name).toBe(true)
      for (const velocity of track.rhythm.pattern) {
        expect(velocity, name).toBeGreaterThanOrEqual(0)
        expect(velocity, name).toBeLessThanOrEqual(1)
      }
    }
  })

  it('멜로디 음은 한 바퀴 안의 사람 목소리 범위에 있다', () => {
    for (const [name, track] of entries) {
      const melody = track.melody
      if (melody === null) continue
      const steps = totalSteps(track)
      const seen = new Set<number>()
      for (const [at, midi, length] of melody.notes) {
        expect(at, `${name} @${at}`).toBeGreaterThanOrEqual(0)
        expect(at, `${name} @${at}`).toBeLessThan(steps)
        expect(length, `${name} @${at}`).toBeGreaterThan(0)
        expect(midi, `${name} @${at}`).toBeGreaterThanOrEqual(55)
        expect(midi, `${name} @${at}`).toBeLessThanOrEqual(88)
        expect(seen.has(at), `${name} @${at}`).toBe(false)
        seen.add(at)
      }
    }
  })
})

describe('낮·밤 네 곡', () => {
  it('참고 구간보다 조금 빠르다', () => {
    expect(TRACKS.splashDay.bpm).toBeGreaterThan(62)
    expect(TRACKS.splashNight.bpm).toBeGreaterThan(100)
    expect(TRACKS.gameDay.bpm).toBeGreaterThan(80)
    expect(TRACKS.gameFirstNight.bpm).toBeGreaterThan(105)
    expect(TRACKS.gameNight.bpm).toBeGreaterThan(105)
  })

  it('스플래시는 대응하는 플레이 곡보다 느리다', () => {
    expect(TRACKS.splashDay.bpm).toBeLessThan(TRACKS.gameDay.bpm)
    expect(TRACKS.splashNight.bpm).toBeLessThan(TRACKS.gameNight.bpm)
  })

  it('낮과 밤의 중심음과 리듬이 다르다', () => {
    expect(TRACKS.splashDay.bars[0]?.bass).not.toBe(TRACKS.splashNight.bars[0]?.bass)
    expect(TRACKS.gameDay.bars[0]?.bass).not.toBe(TRACKS.gameNight.bars[0]?.bass)
    expect(TRACKS.gameFirstNight.bars[0]?.bass).toBe(TRACKS.gameNight.bars[0]?.bass)
    expect(TRACKS.gameFirstNight.rhythm?.pattern).not.toEqual(TRACKS.gameNight.rhythm?.pattern)
    expect(TRACKS.splashDay.rhythm?.pattern).not.toEqual(TRACKS.splashNight.rhythm?.pattern)
    expect(TRACKS.gameDay.rhythm?.pattern).not.toEqual(TRACKS.gameNight.rhythm?.pattern)
  })

  it('스플래시는 노래하고 플레이는 효과음을 위해 멜로디를 비운다', () => {
    for (const name of SPLASH_TRACKS) {
      expect(TRACKS[name].melody, name).not.toBeNull()
    }
    for (const name of GAME_TRACKS) {
      expect(TRACKS[name].melody, name).toBeNull()
    }
  })

  it('네 곡 모두 짧은 타악 결을 갖는다', () => {
    for (const name of [...SPLASH_TRACKS, ...GAME_TRACKS]) {
      expect(TRACKS[name].rhythm, name).not.toBeNull()
    }
  })
})

describe('곡끼리 서로 다르다', () => {
  it('빠르기가 전부 다르다', () => {
    const bpms = entries.map(([, track]) => track.bpm)
    expect(new Set(bpms).size).toBe(entries.length)
  })

  it('박자가 하나로 통일되지 않았다', () => {
    expect(new Set(entries.map(([, track]) => track.stepsPerBar)).size).toBeGreaterThan(1)
  })

  it('아르페지오 음색이 적어도 셋으로 갈린다', () => {
    expect(new Set(entries.map(([, track]) => track.arp.type)).size).toBeGreaterThanOrEqual(3)
  })

  it('대기방만 화음을 깔지 않는다', () => {
    expect(TRACKS.lobby.pad).toBeNull()
    for (const name of ['splashDay', 'splashNight', 'gameDay', 'gameFirstNight', 'gameNight', 'collection'] as const) {
      expect(TRACKS[name].pad, name).not.toBeNull()
    }
  })
})
