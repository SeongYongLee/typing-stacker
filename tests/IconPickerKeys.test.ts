import { describe, expect, it } from 'vitest'
import { iconStepForKey } from '../src/components/iconPickerKeys.ts'

describe('IconPicker 키 이동', () => {
  it('좌우 화살표만 한 칸 이동으로 바꾼다', () => {
    expect(iconStepForKey('ArrowLeft')).toBe(-1)
    expect(iconStepForKey('ArrowRight')).toBe(1)
    expect(iconStepForKey('ArrowUp')).toBe(0)
    expect(iconStepForKey('Enter')).toBe(0)
  })
})
