import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { soundBoard } from '../audio/SoundBoard.ts'
import type { BgmTrackName } from '../audio/tracks.ts'
import type { GameEvent } from '../game/types/events.ts'
import type { AudioSettings } from '../storage/audioSettings.ts'

/** 엔진 종류를 가리지 않고 사건만 내주면 된다 — 싱글도 대전도 같은 통로다 */
interface EventSource {
  onEvent: (sink: (event: GameEvent) => void) => void
}

/**
 * 소리를 페이지에 붙인다. 앱에서 한 번만 부른다.
 *
 * 브라우저는 사용자가 무언가를 누르기 전까지 소리를 내주지 않으므로, 첫 제스처를
 * 기다렸다 컨텍스트를 연다. 리스너를 떼지 않는 이유는 `unlock`이 여러 번 불려도
 * 안전하고, 브라우저가 컨텍스트를 다시 재우는 경우까지 같은 길로 되살아나기 때문이다.
 */
function useAudioBoot(): void {
  useEffect(() => {
    const board = soundBoard()
    const unlock = () => board.unlock()
    const onVisibility = () => board.setSuspended(document.hidden)

    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
}

/** 엔진의 사건을 소리로 흘린다 */
function useGameSound(source: EventSource | null): void {
  useEffect(() => {
    if (source === null) {
      return
    }
    const board = soundBoard()
    source.onEvent((event) => board.handle(event))
  }, [source])
}

/**
 * 글자가 들어올 때마다 소리를 낸다.
 * `tapSeq`는 입력칸 타격 연출이 이미 쓰던 값이다 — 눈에 보이는 반응과 귀에 들리는
 * 반응이 같은 신호에서 나와야 어긋나지 않는다.
 */
function useTypingSound(tapSeq: number): void {
  useEffect(() => {
    if (tapSeq === 0) {
      return
    }
    soundBoard().handle({ kind: 'typed' })
  }, [tapSeq])
}

/**
 * 지금 화면이 어떤 곡을 틀 자리인지 알린다. null이면 조용해야 하는 자리다.
 *
 * **한 곳에서만 부른다(App).** 화면마다 각자 부르면 어느 쪽이 마지막으로 렌더됐는지에
 * 따라 곡이 갈리고, 그건 화면 구조를 바꿀 때마다 조용히 뒤집힌다. 어느 화면에서
 * 무엇이 흐르는지는 한눈에 보이는 자리에 모여 있어야 한다.
 */
function useMusic(track: BgmTrackName | null): void {
  useEffect(() => {
    soundBoard().setMusic(track)
  }, [track])
}

/**
 * 설정을 읽고 바꾼다.
 *
 * 설정은 React 바깥(SoundBoard)이 소유한다 — 판이 도는 내내 살아 있어야 하고
 * 화면이 바뀌어도 유지되어야 하기 때문이다. 그래서 상태를 복사해두지 않고
 * 바깥 저장소를 그대로 구독한다.
 */
function useAudioSettings(): {
  readonly settings: AudioSettings
  readonly update: (patch: Partial<AudioSettings>) => void
} {
  const subscribe = useCallback(
    (onChange: () => void) => soundBoard().subscribe(onChange),
    [],
  )
  const settings = useSyncExternalStore(subscribe, () => soundBoard().settings)
  const update = useCallback((patch: Partial<AudioSettings>) => {
    soundBoard().update(patch)
  }, [])
  return { settings, update }
}

export { useAudioBoot, useGameSound, useTypingSound, useMusic, useAudioSettings }
