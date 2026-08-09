import { useState } from 'react'
import backgroundDay from '../assets/splash/background-day.png'
import backgroundNight from '../assets/splash/background-night.png'
import titleDay from '../assets/splash/title-day.png'
import titleNight from '../assets/splash/title-night.png'
import { MenuButton } from '../components/MenuButton.tsx'
import { NameGreeting } from '../components/NameGreeting.tsx'
import { useLeaderboard } from '../hooks/useLeaderboard.ts'
import { useMenuKeys } from '../hooks/useMenuKeys.ts'
import { loadProfile } from '../storage/profile.ts'
import { TitleSidePanel } from './TitleSidePanel.tsx'
import { titleThemeForHour, type TitleTheme } from './titleTheme.ts'
import './TitleScreen.css'

interface TitleScreenProps {
  onStart: () => void
  onName: () => void
  onOptions: () => void
  /** 그림을 받은 비율(0~1). 기다리는 동안 얼마나 남았는지 보여준다 */
  progress: number
  onMultiplayer: () => void
  onCollection: () => void
  ready: boolean
}

const SPLASH_ASSETS: Record<TitleTheme, { background: string; title: string }> = {
  day: { background: backgroundDay, title: titleDay },
  night: { background: backgroundNight, title: titleNight },
}

function TitleScreen({ onStart, onName, onMultiplayer, onCollection, onOptions, ready, progress }: TitleScreenProps) {
  const board = useLeaderboard()
  // 타이틀에 머무는 동안 낮·밤 그림이 갑자기 바뀌지 않도록 진입 시각으로 고정한다
  const [theme] = useState<TitleTheme>(() => titleThemeForHour(new Date().getHours()))
  const [loadedAssets, setLoadedAssets] = useState(0)
  const assets = SPLASH_ASSETS[theme]

  // 이름이 맨 앞이되 버튼 무리에는 끼지 않는다 — 까닭은 NameGreeting에 적었다
  const items: readonly {
    label: string
    run: () => void
    primary: boolean
    disabled: boolean
    panel: 'name' | 'solo' | 'versus' | 'collection' | 'options'
  }[] = [
    { label: '프로필 바꾸기', run: onName, primary: false, disabled: false, panel: 'name' },
    {
      label: ready ? '혼자 하기' : `준비 중… ${Math.round(progress * 100)}%`,
      run: onStart,
      primary: true,
      disabled: !ready,
      panel: 'solo',
    },
    // 여덟까지 붙는다. "1대1"은 정원을 늘린 뒤로 사실이 아니다
    { label: '함께 하기', run: onMultiplayer, primary: false, disabled: !ready, panel: 'versus' },
    { label: '도감', run: onCollection, primary: false, disabled: false, panel: 'collection' },
    // 소리와 화면 설정은 옵션 안에 있다. 여기 늘어놓으면 시작하는 길이 설정에 묻힌다
    { label: '옵션', run: onOptions, primary: false, disabled: false, panel: 'options' },
  ]

  const me = loadProfile()

  const menu = useMenuKeys({
    count: items.length,
    // 손은 '혼자 하기'에서 시작한다. 이름은 위에 있되 하러 온 일은 게임이다
    initialIndex: 1,
    // 준비되지 않은 항목은 눌러도 아무 일이 없어야 한다 — 키보드도 마우스와 같게
    onActivate: (index) => {
      const item = items[index]
      if (item !== undefined && !item.disabled) {
        item.run()
      }
    },
  })

  const markAssetLoaded = () => {
    setLoadedAssets((count) => Math.min(count + 1, 2))
  }

  return (
    <div
      className="title-splash"
      data-theme={theme}
      data-ready={loadedAssets === 2 ? 'yes' : 'no'}
    >
      <img
        className="title-splash__background"
        src={assets.background}
        alt=""
        aria-hidden="true"
        onLoad={markAssetLoaded}
        onError={markAssetLoaded}
      />
      <div className="title-splash__veil" aria-hidden="true" />

      <main className="title-splash__stage">
        <h1 className="sr-only">수상한 분실물 보관소</h1>
        <img
          className="title-splash__logo"
          src={assets.title}
          alt=""
          aria-hidden="true"
          onLoad={markAssetLoaded}
          onError={markAssetLoaded}
        />

        <div className="title-splash__content">
          <div className="title-splash__menu">
            <NameGreeting
              name={me.name}
              icon={me.icon}
              selected={menu.index === 0}
              onSelect={() => menu.select(0)}
              onActivate={onName}
            />
            {items.slice(1).map((item, index) => (
              <MenuButton
                key={item.label}
                selected={menu.index === index + 1}
                onClick={item.run}
                onHover={() => menu.select(index + 1)}
                primary={item.primary}
                disabled={item.disabled}
              >
                {item.label}
              </MenuButton>
            ))}
          </div>
          <TitleSidePanel kind={items[menu.index]?.panel ?? null} board={board} />
        </div>

        <p className="title-splash__hint">↑↓ 또는 Tab으로 고르고 Enter로 들어갑니다</p>
      </main>
    </div>
  )
}

export { TitleScreen }
