type TitleTheme = 'day' | 'night'

const DAY_START_HOUR = 6
const NIGHT_START_HOUR = 18

/** 사용자의 현지 시각으로 오전 6시부터 오후 6시 전까지를 낮으로 본다. */
function titleThemeForHour(hour: number): TitleTheme {
  return hour >= DAY_START_HOUR && hour < NIGHT_START_HOUR ? 'day' : 'night'
}

export { titleThemeForHour, type TitleTheme }
