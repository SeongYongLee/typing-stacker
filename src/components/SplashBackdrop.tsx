import { useState, type ReactNode } from 'react'
import backgroundDay from '../assets/splash/background-day.png'
import backgroundNight from '../assets/splash/background-night.png'
import { titleThemeForHour, type TitleTheme } from '../screens/titleTheme.ts'
import '../screens/TitleScreen.css'

const SPLASH_BACKGROUNDS: Record<TitleTheme, string> = {
  day: backgroundDay,
  night: backgroundNight,
}

interface SplashBackdropProps {
  children: ReactNode
  /** 타이틀은 로고까지 받은 뒤 함께 열기 위해 진입 시각을 직접 넘긴다. */
  theme?: TitleTheme
  /** false면 배경과 자식의 진입 연출을 아직 시작하지 않는다. */
  ready?: boolean
  /** false면 배경·로고·메뉴를 바로 제자리에 둔다. */
  animated?: boolean
  onBackgroundSettled?: () => void
}

/**
 * 스플래시와 함께 하기의 모든 선택 화면이 나눠 쓰는 배경.
 *
 * 현재 시각은 이 화면에 들어온 순간에 고정한다. 메뉴를 읽는 중에 정각을 지났다고
 * 그림이 갑자기 갈리면 배경이 아니라 상태 변화로 보이기 때문이다.
 */
function SplashBackdrop({
  children,
  theme,
  ready = true,
  animated = true,
  onBackgroundSettled,
}: SplashBackdropProps) {
  const [entryTheme] = useState<TitleTheme>(() => titleThemeForHour(new Date().getHours()))
  const resolvedTheme = theme ?? entryTheme

  return (
    <div
      className="title-splash"
      data-theme={resolvedTheme}
      data-ready={ready ? 'yes' : 'no'}
      data-motion={animated ? 'animated' : 'static'}
    >
      <img
        className="title-splash__background"
        src={SPLASH_BACKGROUNDS[resolvedTheme]}
        alt=""
        aria-hidden="true"
        onLoad={onBackgroundSettled}
        onError={onBackgroundSettled}
      />
      <div className="title-splash__veil" aria-hidden="true" />
      {children}
    </div>
  )
}

export { SplashBackdrop }
