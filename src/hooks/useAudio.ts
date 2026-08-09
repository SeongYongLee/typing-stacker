import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { soundBoard } from '../audio/SoundBoard.ts'
import type { BgmTrackName } from '../audio/tracks.ts'
import type { AudioSettings } from '../storage/audioSettings.ts'

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

    /*
     * 먼저 제스처 없이 열어본다. 이미 논 적이 있는 사이트면 브라우저가 열어주므로
     * 시작 화면의 곡이 새로고침 직후부터 흐른다 — 예전에는 첫 누름이 대개 메뉴
     * 버튼이라 그 순간 화면이 넘어가, 시작 화면 곡을 들을 틈이 없었다.
     */
    board.tryOpen()

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

/** 스플래시에 드나들 때 사무실 나무문을 열고 닫는다 */
function useSplashDoor(open: boolean): void {
  const previous = useRef<boolean | null>(null)
  useEffect(() => {
    // StrictMode가 이펙트를 다시 돌려도 같은 문을 두 번 열지 않는다
    if (previous.current === open) {
      return
    }
    previous.current = open
    soundBoard().setSplash(open)
  }, [open])
}

/**
 * 소리가 아직 첫 누름을 기다리는가.
 *
 * 브라우저는 사용자가 무언가를 누르기 전까지 소리를 내주지 않는다. 그 사실을 화면이
 * 말해주지 않으면 **시작 화면이 그냥 고장난 것처럼 보인다** — 새로고침하고 가만히
 * 보고 있는 동안이 정확히 그 상태다.
 *
 * `tryOpen`이 성공한 브라우저에서는 처음부터 false다. 알릴 것이 없으면 알리지 않는다.
 */
function useAudioGate(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    // 누른 뒤에 열리므로 한 박자 뒤에 다시 본다
    const check = () => setTimeout(onChange, 120)
    window.addEventListener('pointerdown', check)
    window.addEventListener('keydown', check)
    const timer = setInterval(onChange, 1000)
    return () => {
      window.removeEventListener('pointerdown', check)
      window.removeEventListener('keydown', check)
      clearInterval(timer)
    }
  }, [])
  return !useSyncExternalStore(subscribe, () => soundBoard().running)
}

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

export {
  useAudioBoot,
  useAudioGate,
  useSplashDoor,
  useTypingSound,
  useMusic,
  useAudioSettings,
}
