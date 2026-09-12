import { displaySettings, subscribeDisplaySettings } from '../game/renderer/displayPrefs.ts'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { MIN_VIEWPORT_WIDTH } from '../game/config.ts'

/**
 * 화면이 판을 열기에 너무 좁은가.
 *
 * **`resize`가 아니라 `matchMedia`로 듣는다.** 창을 끄는 동안 `resize`는 수십 번
 * 오는데 우리가 알고 싶은 것은 **경계를 넘었는가** 하나뿐이라, 그때마다 리렌더하면
 * 판이 도는 중에 프레임을 갉아먹는다. 미디어 쿼리는 넘는 순간에만 한 번 알린다.
 *
 * 첫 값을 이펙트가 아니라 `useState`의 초기화에서 읽는 이유는, 이펙트로 미루면
 * **좁은 화면에서도 판이 한 프레임 그려졌다가 안내로 바뀌기** 때문이다.
 */
function useTooNarrow(minWidth = MIN_VIEWPORT_WIDTH): boolean {
  const query = `(max-width: ${minWidth - 1}px)`
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)

  useEffect(() => {
    const media = window.matchMedia(query)
    const onChange = (event: MediaQueryListEvent): void => setNarrow(event.matches)
    media.addEventListener('change', onChange)
    // 붙이기 전에 바뀌었을 수 있다 — 첫 렌더와 이 이펙트 사이에 창이 움직이면 놓친다
    setNarrow(media.matches)
    return () => media.removeEventListener('change', onChange)
  }, [query])

  return narrow
}

export { useTooNarrow }

/** Width chooses layout; input capabilities and user preference choose controls. */
export function useMobileControls(): boolean {
  const { inputMode } = useSyncExternalStore(subscribeDisplaySettings, displaySettings, displaySettings)
  const query = '(any-pointer: fine) and (any-hover: hover)'
  const [precise, setPrecise] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  const [coarse, setCoarse] = useState(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches)
  useEffect(() => {
    const pointer = window.matchMedia(query)
    const touch = window.matchMedia('(pointer: coarse)')
    const update = () => { setPrecise(pointer.matches); setCoarse(touch.matches) }
    pointer.addEventListener('change', update)
    touch.addEventListener('change', update)
    update()
    return () => { pointer.removeEventListener('change', update); touch.removeEventListener('change', update) }
  }, [])
  return inputMode === 'mobile' || (inputMode === 'auto' && coarse && !precise)
}
