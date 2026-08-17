import { useCallback, useMemo, useSyncExternalStore } from 'react'
import {
  displaySettings,
  subscribeDisplaySettings,
  updateDisplaySettings,
} from '../game/renderer/displayPrefs.ts'

interface RulesMenuItem {
  readonly label: string
  readonly run: () => void
}

function useRulesMenu(): readonly RulesMenuItem[] {
  const subscribe = useCallback(
    (onChange: () => void) => subscribeDisplaySettings(onChange),
    [],
  )
  const settings = useSyncExternalStore(subscribe, displaySettings)

  return useMemo(
    () => {
      const tutorialEnabled = settings.soloTutorial !== 'disabled'
      return [
        {
          label: `튜토리얼 안내 · ${tutorialEnabled ? '켬' : '끔'}`,
          run: () => updateDisplaySettings({
            soloTutorial: tutorialEnabled ? 'disabled' : 'ask',
          }),
        },
      ]
    },
    [settings],
  )
}

export { useRulesMenu }
export type { RulesMenuItem }
