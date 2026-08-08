import { useMemo } from 'react'
import { useAudioSettings } from './useAudio.ts'

/**
 * 소리 설정을 **메뉴 항목으로** 내준다.
 *
 * 슬라이더를 두지 않은 이유는 이 게임의 메뉴가 전부 키보드로 움직이기 때문이다.
 * 손이 키보드에 붙어 있는 게임에서 음량 하나 줄이자고 마우스를 잡아야 하면
 * 그 설정은 없는 것이나 같다. 그래서 한 항목을 누를 때마다 단계가 돌아간다 —
 * 끔 → 작게 → 보통 → 크게 → 끔.
 *
 * 타이틀과 일시정지 화면이 같은 항목을 쓴다. 판을 멈추지 않고는 소리를 못 줄이거나
 * 그 반대이면, 정작 줄이고 싶은 순간에 길이 막힌다.
 */
interface SoundMenuItem {
  readonly label: string
  readonly run: () => void
}

/** 끔은 muted로 따로 표시한다 — 0으로 줄이는 것과 끄는 것을 구분할 필요가 없다 */
const LEVELS: readonly { readonly name: string; readonly volume: number }[] = [
  { name: '작게', volume: 0.35 },
  { name: '보통', volume: 0.65 },
  { name: '크게', volume: 1 },
]

function levelIndex(volume: number): number {
  let best = 0
  let closest = Number.POSITIVE_INFINITY
  LEVELS.forEach((level, index) => {
    const distance = Math.abs(level.volume - volume)
    if (distance < closest) {
      closest = distance
      best = index
    }
  })
  return best
}

function useSoundMenu(): readonly SoundMenuItem[] {
  const { settings, update } = useAudioSettings()

  return useMemo(() => {
    const index = levelIndex(settings.volume)
    const current = LEVELS[index]

    return [
      {
        label: `소리 · ${settings.muted ? '끔' : (current?.name ?? '보통')}`,
        run: () => {
          if (settings.muted) {
            // 껐다 켜면 가장 작은 단계부터 — 갑자기 크게 나면 그것대로 놀란다
            update({ muted: false, volume: LEVELS[0]?.volume ?? 0.35 })
            return
          }
          const next = index + 1
          if (next >= LEVELS.length) {
            update({ muted: true })
            return
          }
          update({ volume: LEVELS[next]?.volume ?? 0.65 })
        },
      },
      {
        label: `음악 · ${settings.bgm ? '켬' : '끔'}`,
        run: () => update({ bgm: !settings.bgm }),
      },
    ]
  }, [settings, update])
}

export { useSoundMenu }
export type { SoundMenuItem }
