import { TRACKS, type Bar, type BgmTrack, type BgmTrackName } from './tracks.ts'
import { burst, hz, tone, type Voice } from './voices.ts'

/**
 * 배경음악 재생기. 이것도 파일이 아니라 코드다.
 *
 * 녹음된 곡을 쓰지 않으므로 "루프 이음매"가 없다 — 진행을 계속 다시 걸 뿐이라
 * 어디가 끝이고 어디가 시작인지 들리지 않는다.
 *
 * 무엇을 연주할지는 `tracks.ts`가 정한다. 여기는 연주하는 방법만 안다 —
 * 베이스·화음·아르페지오·짧은 타악·멜로디를 악보가 시킨 자리에 놓을 뿐이다.
 *
 * ## 앞질러 예약하는 이유
 *
 * `setInterval`로 음을 그때그때 울리면 타이밍이 밀린다 — 타이머는 프레임과 GC에
 * 밀려 수십 ms씩 늦고, 그 흔들림이 박자로 그대로 들린다. 그래서 타이머는 **예약만**
 * 하고, 실제 시각은 오디오 시계(`ctx.currentTime`)로 못 박는다. 타이머가 늦게 깨도
 * 이미 예약된 음은 제 시각에 울린다.
 *
 * ## 곡마다 자기 게인을 갖는 이유
 *
 * 곡을 바꿀 때 자연스럽게 넘어가려면 **두 곡이 잠시 동시에 울려야 한다.** 하나의
 * 게인을 나눠 쓰면 그 구간에서 둘의 음량을 따로 움직일 수 없어서, 옛 곡을 줄이면
 * 새 곡도 같이 줄어든다. 그래서 곡 하나가 자기 게인 노드를 들고 시작하고,
 * 그 노드를 서로 반대 방향으로 움직여 겹쳐 넘긴다.
 */

/**
 * 지금부터 이만큼 앞의 음까지 예약해둔다.
 * 타이머가 밀려도 이 시간 안에 다시 깨면 소리에 구멍이 나지 않는다.
 */
const LOOKAHEAD_SEC = 0.4
const TIMER_MS = 100

/**
 * 곡을 바꿀 때 겹치는 시간.
 *
 * 짧으면 바뀌었다는 것이 사건처럼 들리고, 길면 두 곡이 뒤섞인 구간이 길어져
 * 어느 쪽도 아닌 소리가 된다. 1.4초는 화음 한 마디쯤이라 옛 곡이 한 번 더
 * 마무리하고 물러나는 것으로 들린다.
 */
const CROSSFADE_SEC = 1.4

/**
 * 첫 곡이 들리기까지의 시간.
 *
 * 첫 제스처가 혼자 하기 버튼이면 스플래시는 0.6초 뒤 가려진다. 여기까지 1.4초로
 * 밀려들면 음량이 절반에도 못 닿아 배경음이 없는 것처럼 들리므로, 첫 곡만 빠르게 연다.
 */
const INITIAL_FADE_IN_SEC = 0.24

/**
 * 조용해질 때 잦아드는 시간.
 *
 * 곡을 바꿀 때보다 짧다. 일시정지는 **지금 멈췄다**는 것이 바로 전해져야 하는데,
 * 1초 넘게 끌면 멈춘 뒤에도 판이 이어지는 것처럼 들린다. 그렇다고 잘라내면
 * 뚝 하는 소리가 나므로 0으로 두지는 않는다.
 */
const FADE_OUT_SEC = 0.45

/** 램프가 끝난 뒤 노드를 떼기까지의 여유 */
const CLEANUP_MS = 150

/** 지금 울리고 있는 곡 하나 */
interface Playing {
  readonly name: BgmTrackName
  readonly track: BgmTrack
  readonly gain: GainNode
  readonly ctx: AudioContext
  readonly out: AudioNode
  readonly noise: AudioBuffer
  timer: number | null
  step: number
  nextStepAt: number
  /** 이미 물러나기 시작했는지. 빠르게 화면을 옮기면 같은 곡에 두 번 걸릴 수 있다 */
  retiring: boolean
}

class Bgm {
  private current: Playing | null = null
  /** 앱에서 첫 곡만 빠르게 열고, 이후 재개·전환은 기존 1.4초 호흡을 지킨다 */
  private hasPlayed = false
  /**
   * 곡마다 마지막으로 있던 자리.
   *
   * 다시 틀 때 처음으로 되돌리지 않는다. 일시정지했다 돌아올 때마다 첫 마디부터
   * 다시 시작하면 그 자체가 "끊겼다"는 신호가 되고, 자주 멈추는 사람은 곡의
   * 앞부분만 듣게 된다. 이어서 시작하면 **자리를 비운 동안에도 음악이 계속 흐르고
   * 있었던 것처럼** 들린다.
   */
  private readonly resumeStep = new Map<BgmTrackName, number>()

  /** 지금 무엇을 틀고 있는지. 아무것도 안 틀면 null */
  get playing(): BgmTrackName | null {
    return this.current?.name ?? null
  }

  /**
   * 곡을 튼다. **같은 곡이면 아무것도 하지 않는다** —
   * 화면이 매 렌더마다 불러도 음악이 처음부터 다시 시작되면 안 된다.
   *
   * 다른 곡이면 옛 곡을 물리면서 새 곡을 밀어 넣는다. 둘이 겹치는 동안 옛 곡도
   * **계속 연주한다** — 예약을 바로 끊으면 겹치는 구간에서 옛 곡이 화음만 남아
   * 앙상해지고, 그러면 부드럽게 넘어가는 것이 아니라 한쪽이 고장난 것처럼 들린다.
   */
  play(ctx: AudioContext, out: AudioNode, noise: AudioBuffer, name: BgmTrackName): void {
    if (this.current !== null && this.current.name === name && !this.current.retiring) {
      return
    }

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.connect(out)

    const next: Playing = {
      name,
      track: TRACKS[name],
      gain,
      ctx,
      out,
      noise,
      timer: null,
      step: this.resumeStep.get(name) ?? 0,
      // 첫 음까지 잠깐 여유를 둔다. 지금 시각에 걸면 예약이 이미 지난 시각이 된다
      nextStepAt: ctx.currentTime + 0.12,
      retiring: false,
    }

    const previous = this.current
    this.retire(previous, CROSSFADE_SEC)
    this.current = next

    // 첫 곡은 스플래시가 가려지기 전에 들려야 하고, 이후 재개·전환은 길게 잇는다
    const fadeInSec = this.hasPlayed ? CROSSFADE_SEC : INITIAL_FADE_IN_SEC
    this.hasPlayed = true
    ramp(gain.gain, ctx, 1, fadeInSec)
    this.schedule(next)
    next.timer = window.setInterval(() => this.schedule(next), TIMER_MS)
  }

  /**
   * 잦아들며 멈춘다.
   *
   * 예전에는 예약만 끊고 이미 예약된 음은 그대로 두었다. 그러면 남은 음들이 **제
   * 음량 그대로** 울리다 갑자기 아무것도 없어져서, 부드럽기는커녕 구멍이 하나 더
   * 생겼다. 지금은 음량 자체를 내리므로 남은 음도 함께 잦아든다.
   */
  stop(): void {
    this.retire(this.current, FADE_OUT_SEC)
    this.current = null
  }

  /** 물러나는 곡. 음량을 내리고, 다 내려간 뒤에 예약과 노드를 정리한다 */
  private retire(playing: Playing | null, seconds: number): void {
    if (playing === null || playing.retiring) {
      return
    }
    playing.retiring = true
    ramp(playing.gain.gain, playing.ctx, 0, seconds)

    window.setTimeout(() => {
      /*
       * 자리를 여기서 적어둔다. 물러나는 동안에도 계속 연주하므로, 예약을 끊는
       * 이 순간이 실제로 소리가 끝난 자리다 — 물러나기 시작한 시점을 적으면
       * 겹치는 1.4초만큼 뒤로 밀린 자리에서 다시 시작하게 된다.
       */
      this.resumeStep.set(playing.name, playing.step)
      if (playing.timer !== null) {
        window.clearInterval(playing.timer)
        playing.timer = null
      }
      playing.gain.disconnect()
    }, seconds * 1000 + CLEANUP_MS)
  }

  private readonly schedule = (playing: Playing): void => {
    const { ctx, track } = playing
    /*
     * 컨텍스트가 멈춰 있으면 currentTime이 흐르지 않으므로 이 루프는 돌지 않는다.
     * 탭을 떠나 있는 동안 음이 쌓였다가 돌아오는 순간 한꺼번에 터지는 일이 없다.
     */
    const stepSec = 60 / track.bpm / 2
    const totalSteps = track.bars.length * track.stepsPerBar
    while (playing.nextStepAt < ctx.currentTime + LOOKAHEAD_SEC) {
      this.playStep(
        { ctx, out: playing.gain, noise: playing.noise, at: playing.nextStepAt },
        track,
        playing.step,
        stepSec,
      )
      playing.nextStepAt += stepSec
      playing.step = (playing.step + 1) % totalSteps
    }
  }

  private playStep(voice: Voice, track: BgmTrack, step: number, stepSec: number): void {
    const bar = track.bars[Math.floor(step / track.stepsPerBar) % track.bars.length]
    if (bar === undefined) {
      return
    }
    const beat = step % track.stepsPerBar

    if (beat === 0 && track.pad !== null) {
      this.playPad(voice, track.pad, bar, stepSec)
    }
    if (track.bass.steps.includes(beat)) {
      tone(voice, {
        type: track.bass.type,
        freq: hz(bar.bass),
        gain: track.bass.gain,
        duration: stepSec * track.bass.length,
        attack: 0.03,
      })
    }
    this.playRhythm(voice, track, beat)
    this.playMelody(voice, track, step, stepSec)
    this.playArp(voice, track, bar, beat, stepSec)
  }

  private playArp(
    voice: Voice,
    track: BgmTrack,
    bar: Bar,
    beat: number,
    stepSec: number,
  ): void {
    if (track.pattern[beat] !== true) {
      return
    }
    const note = bar.chord[beat % bar.chord.length]
    if (note === undefined) {
      return
    }
    tone(voice, {
      type: track.arp.type,
      freq: hz(note + track.arp.octave),
      gain: track.arp.gain,
      duration: stepSec * track.arp.length,
      attack: 0.02,
    })
  }

  /** 악보의 0~1 세기로 흰 잡음을 짧게 잘라 귀여운 타악 결을 만든다 */
  private playRhythm(voice: Voice, track: BgmTrack, beat: number): void {
    const rhythm = track.rhythm
    const velocity = rhythm?.pattern[beat] ?? 0
    if (rhythm === null || velocity <= 0) {
      return
    }
    burst(voice, {
      filter: rhythm.filter,
      freq: rhythm.freq,
      toFreq: rhythm.toFreq,
      q: rhythm.q,
      gain: rhythm.gain * velocity,
      duration: rhythm.duration,
      attack: Math.min(0.006, rhythm.duration * 0.3),
    })
  }

  /** 화음을 마디 내내 길게 깐다 */
  private playPad(
    voice: Voice,
    pad: NonNullable<BgmTrack['pad']>,
    bar: Bar,
    stepSec: number,
  ): void {
    for (const note of bar.chord) {
      tone(voice, {
        type: pad.type,
        freq: hz(note),
        gain: pad.gain,
        duration: stepSec * pad.length,
        // 천천히 밀려들어와야 화음이 앞으로 튀어나오지 않는다
        attack: 0.3,
        detune: 4,
      })
    }
  }

  /**
   * 멜로디는 화음과 달리 **한 바퀴 안의 절대 위치**로 적힌다.
   * 마디에 매이지 않아야 마디를 넘어가는 긴 음을 쓸 수 있고, 그래야 노래처럼 들린다.
   */
  private playMelody(voice: Voice, track: BgmTrack, step: number, stepSec: number): void {
    const melody = track.melody
    if (melody === null) {
      return
    }
    for (const [at, midi, length] of melody.notes) {
      if (at !== step) {
        continue
      }
      tone(voice, {
        type: melody.type,
        freq: hz(midi),
        gain: melody.gain,
        duration: stepSec * length * melody.length,
        // 멜로디는 부드럽게 들어와야 화음 위에 얹힌 것으로 들린다
        attack: 0.05,
      })
    }
  }
}

/**
 * 음량을 목표까지 밀어 옮긴다.
 *
 * 지금 값을 붙잡고(`cancelAndHoldAtTime`) 시작하는 것이 핵심이다. 그냥 램프를 걸면
 * 앞서 걸어둔 램프가 살아 있어서, 밀려들어오는 중에 곡이 또 바뀌면 음량이 튄다 —
 * 화면을 빠르게 오갈 때 실제로 밟는 경로다.
 */
function ramp(param: AudioParam, ctx: AudioContext, target: number, seconds: number): void {
  const now = ctx.currentTime
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(now)
  } else {
    // 오래된 브라우저용. 지금 값을 읽어 그 자리에 못 박고 다시 건다
    const held = param.value
    param.cancelScheduledValues(now)
    param.setValueAtTime(held, now)
  }
  param.linearRampToValueAtTime(target, now + seconds)
}

export { Bgm, CROSSFADE_SEC, INITIAL_FADE_IN_SEC, FADE_OUT_SEC }
