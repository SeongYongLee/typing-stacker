import type { CSSProperties } from 'react'
import { MenuButton } from '../components/MenuButton.tsx'
import { useLeaderboard } from '../hooks/useLeaderboard.ts'
import { TitleSidePanel } from './TitleSidePanel.tsx'
import { useMenuKeys } from '../hooks/useMenuKeys.ts'

interface TitleScreenProps {
  onStart: () => void
  onOptions: () => void
  /** 그림을 받은 비율(0~1). 기다리는 동안 얼마나 남았는지 보여준다 */
  progress: number
  onMultiplayer: () => void
  onCollection: () => void
  ready: boolean
}

const rootStyle: CSSProperties = {
  height: '100%',
  display: 'grid',
  placeItems: 'center',
  padding: 24,
}

function TitleScreen({ onStart, onMultiplayer, onCollection, onOptions, ready, progress }: TitleScreenProps) {
  const board = useLeaderboard()

  const items: readonly {
    label: string
    run: () => void
    primary: boolean
    disabled: boolean
    panel: 'solo' | 'versus' | 'collection' | 'options'
  }[] = [
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

  const menu = useMenuKeys({
    count: items.length,
    // 준비되지 않은 항목은 눌러도 아무 일이 없어야 한다 — 키보드도 마우스와 같게
    onActivate: (index) => {
      const item = items[index]
      if (item !== undefined && !item.disabled) {
        item.run()
      }
    },
  })

  return (
    <div style={rootStyle}>
      <div style={{ textAlign: 'center' }}>
        <h1
          style={{
            font: '700 46px/1.1 var(--sans)',
            color: '#f2f4fb',
            letterSpacing: '-0.02em',
            margin: 0,
          }}
        >
          타자 스태커
        </h1>

        {/*
          메뉴와 패널을 나란히 둔다.

          규칙을 여기 한 덩어리로 두지 않는 이유는, 넷 중 하나를 고르러 온 사람에게
          네 개의 설명을 한꺼번에 읽히는 셈이기 때문이다. 지금은 고른 것의 설명만
          패널에 뜬다. 패널은 자리와 크기를 항상 차지한다 — 오갈 때마다 늘었다 줄면
          메뉴가 흔들려 무엇을 고르는 중인지 놓친다.
        */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '260px auto',
            marginTop: 32,
            gap: 20,
            justifyContent: 'center',
            alignItems: 'start',
          }}
        >
          <div style={{ display: 'grid', gap: 10 }}>
            {items.map((item, index) => (
              <MenuButton
                key={item.label}
                selected={menu.index === index}
                onClick={item.run}
                onHover={() => menu.select(index)}
                primary={item.primary}
                disabled={item.disabled}
              >
                {item.label}
              </MenuButton>
            ))}
          </div>
          <TitleSidePanel kind={items[menu.index]?.panel ?? null} board={board} />
        </div>

        <p style={{ marginTop: 20, fontSize: 12, color: '#4a5171' }}>
          ↑↓ 또는 Tab으로 고르고 Enter로 들어간다
        </p>
      </div>
    </div>
  )
}

export { TitleScreen }
