import { useEffect, useState } from 'react'
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
function useTooNarrow(): boolean {
  const query = `(max-width: ${MIN_VIEWPORT_WIDTH - 1}px)`
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches)

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
