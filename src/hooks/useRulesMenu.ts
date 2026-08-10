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

function onOff(value: boolean): string {
  return value ? '켬' : '끔'
}

function useRulesMenu(): readonly RulesMenuItem[] {
  const subscribe = useCallback(
    (onChange: () => void) => subscribeDisplaySettings(onChange),
    [],
  )
  const settings = useSyncExternalStore(subscribe, displaySettings)

  return useMemo(
    () => [
      {
        label: `혼자 하기 · ${onOff(settings.soloRules)}`,
        run: () => updateDisplaySettings({ soloRules: !settings.soloRules }),
      },
    ],
    [settings],
  )
}

export { useRulesMenu }
export type { RulesMenuItem }
