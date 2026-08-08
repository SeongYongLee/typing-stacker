import { MenuButton } from '../components/MenuButton.tsx'
import { MenuLayout } from '../components/MenuLayout.tsx'
import { NameGreeting } from '../components/NameGreeting.tsx'
import { useLeaderboard } from '../hooks/useLeaderboard.ts'
import { loadProfile } from '../storage/profile.ts'
import { TitleSidePanel } from './TitleSidePanel.tsx'
import { useMenuKeys } from '../hooks/useMenuKeys.ts'

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

function TitleScreen({ onStart, onName, onMultiplayer, onCollection, onOptions, ready, progress }: TitleScreenProps) {
  const board = useLeaderboard()

  // 이름이 맨 앞이되 버튼 무리에는 끼지 않는다 — 까닭은 NameGreeting에 적었다
  const items: readonly {
    label: string
    run: () => void
    primary: boolean
    disabled: boolean
    panel: 'name' | 'solo' | 'versus' | 'collection' | 'options'
  }[] = [
    { label: '이름 바꾸기', run: onName, primary: false, disabled: false, panel: 'name' },
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

  const greeting = loadProfile().name

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

  return (
    <MenuLayout
      title="타자 스태커"
      titleSize={46}
      hint="↑↓ 또는 Tab으로 고르고 Enter로 들어간다"
      menu={
        <>
          <NameGreeting
            name={greeting}
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
        </>
      }
      panel={<TitleSidePanel kind={items[menu.index]?.panel ?? null} board={board} />}
    />
  )
}

export { TitleScreen }
