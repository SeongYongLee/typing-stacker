import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  loadDisplaySettings,
  saveDisplaySettings,
  STORAGE_KEY,
} from '../src/storage/displaySettings.ts'

/**
 * 저장된 값은 사용자가 손으로 고칠 수 있는 자리에 있다.
 * 무엇이 들어와도 게임이 열려야 한다 — 화면 설정 하나 때문에 못 들어가면 안 된다.
 */

function withStorage(raw: string | null, run: () => void): void {
  const store = new Map<string, string>()
  if (raw !== null) {
    store.set(STORAGE_KEY, raw)
  }
  const fake = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  }
  const globals = globalThis as unknown as Record<string, unknown>
  const previous = globals['localStorage']
  globals['localStorage'] = fake
  try {
    run()
  } finally {
    globals['localStorage'] = previous
  }
}

describe('화면 설정 저장', () => {
  it('아무것도 없으면 기본값이다', () => {
    withStorage(null, () => {
      expect(loadDisplaySettings()).toEqual(DEFAULT_SETTINGS)
    })
  })

  it('기본은 흔들림이 켜져 있다 — 끄고 싶은 사람이 끄는 것이다', () => {
    expect(DEFAULT_SETTINGS.shake).toBe(1)
  })

  it('저장한 값을 그대로 읽는다', () => {
    withStorage(null, () => {
      saveDisplaySettings({ shake: 0, glow: 0, trail: 0 })
      expect(loadDisplaySettings().shake).toBe(0)
    })
  })

  it('범위를 벗어난 값은 잘라낸다', () => {
    withStorage(JSON.stringify({ shake: 99 }), () => {
      expect(loadDisplaySettings().shake).toBe(1)
    })
    withStorage(JSON.stringify({ shake: -5 }), () => {
      expect(loadDisplaySettings().shake).toBe(0)
    })
  })

  it('망가진 값이면 기본값으로 돌아간다', () => {
    for (const raw of ['{{{', 'null', '"문자열"', '{"shake":"크게"}', '[]']) {
      withStorage(raw, () => {
        expect(loadDisplaySettings(), raw).toEqual(DEFAULT_SETTINGS)
      })
    }
  })

  it('저장소가 막혀 있어도 기본값을 준다', () => {
    const globals = globalThis as unknown as Record<string, unknown>
    const previous = globals['localStorage']
    globals['localStorage'] = {
      getItem: () => {
        throw new Error('막힘')
      },
      setItem: () => {
        throw new Error('막힘')
      },
    }
    try {
      expect(loadDisplaySettings()).toEqual(DEFAULT_SETTINGS)
      expect(() => saveDisplaySettings({ shake: 0, glow: 0, trail: 0 })).not.toThrow()
    } finally {
      globals['localStorage'] = previous
    }
  })
})
