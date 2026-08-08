import { useCallback, useMemo, useSyncExternalStore } from 'react'
import {
  displaySettings,
  subscribeDisplaySettings,
  updateDisplaySettings,
} from '../game/renderer/displayPrefs.ts'

/**
 * 화면 설정을 메뉴 항목으로 내준다.
 *
 * `useSoundMenu`와 같은 모양이다 — 슬라이더 대신 누를 때마다 단계가 돌아간다.
 * 이 게임의 메뉴는 전부 키보드로 움직이므로, 값을 고르자고 마우스를 잡아야 하면
 * 그 설정은 없는 것이나 같다.
 */
interface DisplayMenuItem {
  readonly label: string
  readonly run: () => void
}

const SHAKE_LEVELS: readonly { readonly name: string; readonly value: number }[] = [
  { name: '끔', value: 0 },
  { name: '약하게', value: 0.5 },
  { name: '보통', value: 1 },
]

function levelIndex(value: number): number {
  let best = 0
  let closest = Number.POSITIVE_INFINITY
  SHAKE_LEVELS.forEach((level, index) => {
    const distance = Math.abs(level.value - value)
    if (distance < closest) {
      closest = distance
      best = index
    }
  })
  return best
}

function useDisplayMenu(): readonly DisplayMenuItem[] {
  const subscribe = useCallback(
    (onChange: () => void) => subscribeDisplaySettings(onChange),
    [],
  )
  const settings = useSyncExternalStore(subscribe, displaySettings)

  return useMemo(() => {
    const index = levelIndex(settings.shake)
    return [
      {
        label: `화면 흔들림 · ${SHAKE_LEVELS[index]?.name ?? '보통'}`,
        run: () => {
          const next = SHAKE_LEVELS[(index + 1) % SHAKE_LEVELS.length]
          updateDisplaySettings({ shake: next?.value ?? 1 })
        },
      },
    ]
  }, [settings])
}

export { useDisplayMenu }
export type { DisplayMenuItem }
