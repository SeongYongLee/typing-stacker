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

interface Level {
  readonly name: string
  readonly value: number
}

/** 두 설정이 같은 단계를 쓴다 — 고르는 감각이 항목마다 다르면 메뉴가 어수선해진다 */
const LEVELS: readonly Level[] = [
  { name: '끔', value: 0 },
  { name: '약하게', value: 0.5 },
  { name: '보통', value: 1 },
]

function levelIndex(value: number): number {
  let best = 0
  let closest = Number.POSITIVE_INFINITY
  LEVELS.forEach((level, index) => {
    const distance = Math.abs(level.value - value)
    if (distance < closest) {
      closest = distance
      best = index
    }
  })
  return best
}

/** 누를 때마다 다음 단계로 돌아가는 항목 하나 */
function cycleItem(
  label: string,
  value: number,
  apply: (next: number) => void,
): DisplayMenuItem {
  const index = levelIndex(value)
  return {
    label: `${label} · ${LEVELS[index]?.name ?? '보통'}`,
    run: () => apply(LEVELS[(index + 1) % LEVELS.length]?.value ?? 1),
  }
}

function useDisplayMenu(): readonly DisplayMenuItem[] {
  const subscribe = useCallback(
    (onChange: () => void) => subscribeDisplaySettings(onChange),
    [],
  )
  const settings = useSyncExternalStore(subscribe, displaySettings)

  return useMemo(
    () => [
      cycleItem('화면 흔들림', settings.shake, (shake) =>
        updateDisplaySettings({ shake }),
      ),
      cycleItem('색번짐', settings.glow, (glow) => updateDisplaySettings({ glow })),
      cycleItem('꼬리', settings.trail, (trail) => updateDisplaySettings({ trail })),
    ],
    [settings],
  )
}

export { useDisplayMenu }
export type { DisplayMenuItem }
