import { describe, expect, it } from 'vitest'
import { titleThemeForHour } from '../src/screens/titleTheme.ts'

describe('titleThemeForHour', () => {
  it.each([6, 12, 17])('%d시는 낮 그림을 고른다', (hour) => {
    expect(titleThemeForHour(hour)).toBe('day')
  })

  it.each([18, 23, 0, 5])('%d시는 밤 그림을 고른다', (hour) => {
    expect(titleThemeForHour(hour)).toBe('night')
  })
})
