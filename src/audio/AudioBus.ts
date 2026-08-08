import { createRng } from '../game/systems/Rng.ts'
import {
  DEFAULT_SETTINGS,
  loadAudioSettings,
  saveAudioSettings,
  type AudioSettings,
} from '../storage/audioSettings.ts'

/**
 * 배경음악이 효과음 대비 갖는 상한.
 *
 * 사용자가 배경음악을 최대로 올려도 효과음의 이만큼까지만 올라간다. 균형을 값 하나로
 * 지키는 자리라, 효과음 전체를 손볼 때는 여기도 함께 봐야 한다 — 한쪽만 내리면
 * 균형이 뒤집혀 음악이 앞으로 나온다.
 */
const BGM_HEADROOM = 0.38

/**
 * 소리가 나가는 길.
 *
 * `renderer/`가 canvas를 아는 유일한 자리이듯, WebAudio를 아는 자리는 `audio/`뿐이다.
 * 게임 로직은 사건만 내놓고 여기까지 내려오지 않는다.
 *
 * ## AudioContext를 미리 만들지 않는 이유
 *
 * 브라우저는 **사용자가 무언가를 누르기 전까지** 소리를 내주지 않는다. 페이지가
 * 열리자마자 만든 컨텍스트는 `suspended`로 시작하고, 그 상태에서 예약한 소리는
 * 그냥 사라진다. 그래서 컨텍스트 자체를 첫 제스처(`unlock`)까지 미룬다 —
 * 만들지 않으면 "왜 소리가 안 나지"를 헷갈릴 여지도 없다.
 *
 * ## 컴프레서를 물려두는 이유
 *
 * 탑이 무너지면 부딪힘이 한 프레임에 여럿 겹친다. 그대로 더하면 진폭이 1을 넘어
 * 찢어지는 소리가 난다. 개수를 제한하는 것만으로는 부족하다 — 남은 소리들이
 * 여전히 겹치기 때문이다. 컴프레서는 그 순간만 눌러주고 평소에는 손대지 않는다.
 */
class AudioBus {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private sfxGain: GainNode | null = null
  private bgmGain: GainNode | null = null
  private noise: AudioBuffer | null = null
  private settings: AudioSettings = DEFAULT_SETTINGS
  private listeners = new Set<(settings: AudioSettings) => void>()

  constructor() {
    this.settings = loadAudioSettings()
  }

  get current(): AudioSettings {
    return this.settings
  }

  /** 소리를 낼 수 있는 상태인가. 첫 제스처 전에는 false다 */
  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running'
  }

  get context(): AudioContext | null {
    return this.ctx
  }

  /** 효과음이 들어가는 자리 */
  get sfx(): GainNode | null {
    return this.sfxGain
  }

  /** 배경음악이 들어가는 자리. 효과음과 따로 두어 각각 끌 수 있다 */
  get bgm(): GainNode | null {
    return this.bgmGain
  }

  /** 잡음 한 통. 부딪힘·바람 소리가 매번 새로 만들지 않고 이것을 잘라 쓴다 */
  get noiseBuffer(): AudioBuffer | null {
    return this.noise
  }

  /**
   * 사용자 제스처 안에서 부른다.
   * 이미 만들어져 있으면 멈춰 있던 것만 깨운다 — 탭을 떠났다 돌아오는 경로다.
   */
  unlock(): void {
    if (this.ctx === null) {
      this.build()
      return
    }
    if (this.ctx.state !== 'running') {
      void this.ctx.resume()
    }
  }

  private build(): void {
    if (typeof AudioContext === 'undefined') {
      return
    }
    const ctx = new AudioContext()

    /*
     * 마스터에만 컴프레서를 문다. 소리마다 걸면 개별 소리가 서로를 눌러
     * 가벼운 것이 무거운 것에 먹힌다 — 여기서 필요한 것은 합쳐진 뒤의 상한뿐이다.
     */
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -14
    limiter.knee.value = 14
    limiter.ratio.value = 8
    limiter.attack.value = 0.003
    limiter.release.value = 0.2

    const master = ctx.createGain()
    const sfx = ctx.createGain()
    const bgm = ctx.createGain()

    /*
     * 효과음의 고역을 깎는다.
     *
     * 합성음이 날카롭게 들리는 것은 대개 음량이 아니라 **고역**이다. 오실레이터의
     * 배음과 잡음의 윗부분이 그대로 나오면 3~6kHz에 에너지가 몰리는데, 사람 귀가
     * 가장 예민한 대역이 정확히 거기다. 소리마다 값을 낮추는 것으로는 이걸 못 잡는다 —
     * 작아지기만 하고 여전히 뾰족하다.
     *
     * 그래서 개별 소리가 아니라 버스에서 한 번에 깎는다. 여기 두면 새 소리를
     * 추가할 때도 저절로 같은 성질을 갖는다.
     */
    const softener = ctx.createBiquadFilter()
    softener.type = 'highshelf'
    softener.frequency.value = 2400
    softener.gain.value = -8

    const ceiling = ctx.createBiquadFilter()
    ceiling.type = 'lowpass'
    // Q를 낮게 둔다. 높으면 차단 지점이 오히려 솟아올라 그 대역이 새로 뾰족해진다
    ceiling.frequency.value = 5200
    ceiling.Q.value = 0.4

    sfx.connect(softener)
    softener.connect(ceiling)
    ceiling.connect(master)
    bgm.connect(master)
    master.connect(limiter)
    limiter.connect(ctx.destination)

    this.ctx = ctx
    this.master = master
    this.sfxGain = sfx
    this.bgmGain = bgm
    this.noise = buildNoise(ctx)
    this.applyGains()

    if (ctx.state !== 'running') {
      void ctx.resume()
    }
  }

  /** 화면이 설정을 바꿨다. 저장까지 여기서 함께 한다 */
  update(patch: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...patch }
    saveAudioSettings(this.settings)
    this.applyGains()
    for (const listener of this.listeners) {
      listener(this.settings)
    }
  }

  /** 설정이 바뀔 때마다 알려준다. 화면이 토글 상태를 그리는 통로 */
  subscribe(listener: (settings: AudioSettings) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * 탭이 가려졌을 때 통째로 멈춘다.
   * 배경음악만 멈추면 안 된다 — 예약해둔 효과음이 돌아오는 순간 한꺼번에 터진다.
   */
  setSuspended(suspended: boolean): void {
    const ctx = this.ctx
    if (ctx === null) {
      return
    }
    if (suspended) {
      if (ctx.state === 'running') {
        void ctx.suspend()
      }
      return
    }
    if (ctx.state === 'suspended') {
      void ctx.resume()
    }
  }

  private applyGains(): void {
    if (this.master === null || this.bgmGain === null || this.sfxGain === null) {
      return
    }
    const { sfxVolume, bgmVolume } = this.settings
    // 마스터는 이제 통로일 뿐이다. 음량은 효과음과 배경음악이 각자 정한다
    this.master.gain.value = 1
    this.sfxGain.gain.value = sfxVolume
    /*
     * 배경음악은 효과음과 같은 1로 두지 않는다. 이 게임에서 귀가 실제로 쓰는 정보는
     * 얹혔는지·놓쳤는지이고, 음악은 그 뒤에 깔려 있기만 하면 된다. 사용자가 고르는
     * 값에 이 비율을 곱해서, "보통"으로 둬도 음악이 효과음을 덮지 않게 한다.
     */
    this.bgmGain.gain.value = bgmVolume * BGM_HEADROOM
  }

  dispose(): void {
    this.listeners.clear()
    void this.ctx?.close()
    this.ctx = null
    this.master = null
    this.sfxGain = null
    this.bgmGain = null
    this.noise = null
  }
}

/**
 * 1초짜리 흰 잡음. 부딪힘·낙하 바람 소리의 재료다.
 * 한 번만 만들어 돌려 쓴다 — 소리마다 새로 만들면 그것만으로 프레임이 튄다.
 *
 * `Math.random()` 대신 시드 난수를 쓰는 이유는 이 프로젝트의 규칙이기도 하지만,
 * 잡음 한 통이 매번 달라야 할 이유가 없기 때문이기도 하다.
 */
function buildNoise(ctx: AudioContext): AudioBuffer {
  const rng = createRng(0x5eed_a1d0)
  const frames = ctx.sampleRate
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < frames; i += 1) {
    data[i] = rng.next() * 2 - 1
  }
  return buffer
}

export { AudioBus }
