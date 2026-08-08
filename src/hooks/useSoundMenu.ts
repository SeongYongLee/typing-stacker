import { useMemo } from 'react'
import { useAudioSettings } from './useAudio.ts'

/**
 * 소리 설정을 **메뉴 항목으로** 내준다.
 *
 * 슬라이더를 두지 않은 이유는 이 게임의 메뉴가 전부 키보드로 움직이기 때문이다.
 * 손이 키보드에 붙어 있는 게임에서 음량 하나 줄이자고 마우스를 잡아야 하면
 * 그 설정은 없는 것이나 같다. 그래서 한 항목을 누를 때마다 단계가 돌아간다.
 *
 * ## 셋으로 나눈 이유
 *
 * 전체 하나였을 때는 "음악이 거슬린다"와 "소리가 크다"를 구분할 수 없었다.
 * 해법이 정반대인데도 방법이 하나뿐이라, 음악을 줄이려면 필요한 효과음까지 같이
 * 줄여야 했다. 이 게임에서 효과음은 장식이 아니라 **얹혔는지 알려주는 정보**다.
 *
 * 항목을 쓰는 곳(옵션 화면·타이틀)이 목록을 그대로 그리므로, 여기서 늘리면
 * 화면은 손대지 않아도 따라온다.
 */
interface SoundMenuItem {
  readonly label: string
  readonly run: () => void
}

const LEVELS: readonly { readonly name: string; readonly value: number }[] = [
  { name: '작게', value: 0.35 },
  { name: '보통', value: 0.65 },
  { name: '크게', value: 1 },
]

/** 0을 포함한 단계. 효과음·배경음악은 전체와 달리 각각 0까지 내릴 수 있다 */
const LEVELS_WITH_OFF: readonly { readonly name: string; readonly value: number }[] = [
  { name: '끔', value: 0 },
  ...LEVELS,
]

function nearest(
  levels: readonly { readonly name: string; readonly value: number }[],
  value: number,
): number {
  let best = 0
  let closest = Number.POSITIVE_INFINITY
  levels.forEach((level, index) => {
    const distance = Math.abs(level.value - value)
    if (distance < closest) {
      closest = distance
      best = index
    }
  })
  return best
}

/** 다음 단계로 돌린다. 끝에 닿으면 처음으로 */
function cycle(
  levels: readonly { readonly name: string; readonly value: number }[],
  value: number,
): number {
  const next = (nearest(levels, value) + 1) % levels.length
  return levels[next]?.value ?? 0
}

function nameOf(
  levels: readonly { readonly name: string; readonly value: number }[],
  value: number,
): string {
  return levels[nearest(levels, value)]?.name ?? '보통'
}

function useSoundMenu(): readonly SoundMenuItem[] {
  const { settings, update } = useAudioSettings()

  return useMemo(() => {
    /*
     * 전체 음량 항목은 없앴다. 효과음과 배경음악을 따로 두면 전체는 둘의 곱일 뿐이라,
     * 같은 일을 두 군데서 하게 된다 — 전체를 줄였는데 효과음이 이미 0이면 아무 일도
     * 일어나지 않아 설정이 고장난 것처럼 보인다. 둘 다 끄면 조용해진다.
     */
    return [
      {
        label: `효과음 · ${nameOf(LEVELS_WITH_OFF, settings.sfxVolume)}`,
        run: () => update({ sfxVolume: cycle(LEVELS_WITH_OFF, settings.sfxVolume) }),
      },
      {
        label: `배경음악 · ${nameOf(LEVELS_WITH_OFF, settings.bgmVolume)}`,
        run: () => update({ bgmVolume: cycle(LEVELS_WITH_OFF, settings.bgmVolume) }),
      },
    ]
  }, [settings, update])
}

export { useSoundMenu }
export type { SoundMenuItem }
