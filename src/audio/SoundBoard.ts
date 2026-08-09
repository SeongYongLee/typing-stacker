import type { GameEvent } from '../game/types/events.ts'
import type { AudioSettings } from '../storage/audioSettings.ts'
import { AudioBus } from './AudioBus.ts'
import { Bgm } from './Bgm.ts'
import { SoundLimiter } from './SoundLimiter.ts'
import type { BgmTrackName } from './tracks.ts'
import * as voices from './voices.ts'
import type { Voice } from './voices.ts'

/**
 * 사건을 소리로 옮긴다. 게임과 WebAudio가 만나는 유일한 자리다.
 *
 * 몇 개를 울릴지는 `SoundLimiter`가 정한다 — 그쪽은 WebAudio를 모르는 순수 로직이라
 * node에서 테스트가 돌고, 여기는 "무슨 소리를 내는가"만 남는다.
 */
class SoundBoard {
  private readonly bus = new AudioBus()
  private readonly music = new Bgm()
  private readonly limiter = new SoundLimiter()
  /** 지금 화면이 틀고 싶어 하는 곡. null이면 조용해야 하는 자리다 */
  private wantedTrack: BgmTrackName | null = null

  get settings(): AudioSettings {
    return this.bus.current
  }

  subscribe(listener: (settings: AudioSettings) => void): () => void {
    return this.bus.subscribe(listener)
  }

  /** 사용자 제스처 안에서 부른다. 이 전에는 브라우저가 소리를 내주지 않는다 */
  unlock(): void {
    this.bus.unlock()
    this.syncMusic()
  }

  update(patch: Partial<AudioSettings>): void {
    this.bus.update(patch)
    this.syncMusic()
  }

  /** 탭이 가려졌다 / 돌아왔다 */
  setSuspended(suspended: boolean): void {
    this.bus.setSuspended(suspended)
  }

  /**
   * 지금 화면이 어떤 곡을 틀 자리인지 알린다. null이면 조용해야 하는 자리다.
   *
   * 일시정지와 결과 화면에서 끄는 것은 취향이 아니라 필요다 — 멈춘 화면에서 음악만
   * 계속 돌면 판이 아직 도는 것처럼 들린다.
   */
  setMusic(track: BgmTrackName | null): void {
    this.wantedTrack = track
    this.syncMusic()
  }

  private syncMusic(): void {
    const ctx = this.bus.context
    const out = this.bus.bgm
    const noise = this.bus.noiseBuffer
    const { bgmVolume } = this.bus.current
    const wanted = bgmVolume > 0 ? this.wantedTrack : null

    if (wanted === null || ctx === null || out === null || noise === null) {
      this.music.stop()
      return
    }
    this.music.play(ctx, out, noise, wanted)
  }

  handle(event: GameEvent): void {
    const ctx = this.bus.context
    const out = this.bus.sfx
    const noise = this.bus.noiseBuffer
    // 첫 제스처 전이거나 효과음을 껐으면 아무것도 예약하지 않는다.
    // 게인이 0이라 들리지 않기도 하지만, 무너질 때 헛도는 노드 수십 개를 아낀다
    if (ctx === null || out === null || noise === null || this.bus.current.sfxVolume <= 0) {
      return
    }

    const now = ctx.currentTime
    const voice: Voice = { ctx, out, noise, at: now }

    /*
     * 판이 시작됐다는 것 자체는 소리를 내지 않는다.
     * 어떤 곡을 틀지는 화면이 정한다 — 사건은 무슨 일이 일어났는지만 말한다.
     */
    if (event.kind === 'runStart') {
      return
    }

    if (!this.limiter.allow(event.kind, now)) {
      return
    }

    switch (event.kind) {
      case 'impact':
        voices.impact(
          voice,
          event.strength,
          event.size,
          event.material,
          event.tone,
          event.grain,
        )
        break
      case 'typed':
        voices.typeTick(voice)
        break
      case 'wordHit':
        voices.wordHit(voice, event.combo)
        break
      case 'wordMiss':
        voices.wordMiss(voice)
        break
      case 'drop':
        voices.dropWhoosh(voice, event.material, event.tone, event.hidden)
        break
      case 'quake':
        voices.quake(voice, event.strength)
        break
      case 'merge':
        voices.merge(voice)
        break
      case 'reveal':
        voices.reveal(voice)
        break
      case 'lifeLost':
        voices.lifeLost(voice)
        break
      case 'collapse':
        voices.collapse(voice)
        break
      case 'gameOver':
        voices.gameOver(voice, event.won)
        break
      case 'menuMove':
        voices.menuMove(voice)
        break
      case 'menuSelect':
        voices.menuSelect(voice)
        break
      case 'turn':
        voices.turnCue(voice)
        break
      case 'chat':
        // 내가 친 것은 이미 안다. 알림은 남의 말에만 필요하다
        if (event.mine) {
          return
        }
        voices.chat(voice)
        break
      default:
        break
    }
  }

  dispose(): void {
    this.music.stop()
    this.bus.dispose()
  }
}

/**
 * 페이지에 하나만 둔다.
 *
 * AudioContext는 브라우저가 개수를 제한하는 자원이고, 화면을 옮길 때마다 새로 만들면
 * 그때마다 첫 제스처를 다시 기다려야 한다. 처음 쓸 때 만드는 이유는 이 모듈을
 * 불러오는 것만으로 localStorage를 건드리지 않게 하려는 것이다.
 */
let shared: SoundBoard | null = null

function soundBoard(): SoundBoard {
  shared ??= new SoundBoard()
  return shared
}

export { SoundBoard, soundBoard }
