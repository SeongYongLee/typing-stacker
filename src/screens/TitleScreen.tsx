import type { CSSProperties } from 'react'
import { MenuButton } from '../components/MenuButton.tsx'
import { useMenuKeys } from '../hooks/useMenuKeys.ts'
import { LIVES } from '../game/config.ts'

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

const ruleStyle: CSSProperties = {
  fontSize: 15,
  lineHeight: 1.9,
  color: '#b6bdd4',
  margin: '28px 0 36px',
  textAlign: 'left',
  maxWidth: 460,
}

function TitleScreen({ onStart, onMultiplayer, onCollection, onOptions, ready, progress }: TitleScreenProps) {
  const items = [
    { label: ready ? '혼자 하기' : `준비 중… ${Math.round(progress * 100)}%`, run: onStart, primary: true, disabled: !ready },
    { label: '1대1 대전', run: onMultiplayer, primary: false, disabled: !ready },
    { label: '도감', run: onCollection, primary: false, disabled: false },
    // 소리와 화면 설정은 옵션 안에 있다. 여기 늘어놓으면 시작하는 길이 설정에 묻힌다
    { label: '옵션', run: onOptions, primary: false, disabled: false },
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
          규칙은 넷만 남긴다. 합성·도감·정확도처럼 나중에 알아도 되는 것은
          그 순간 화면에서 알려주므로, 시작 전에는 손이 무엇을 해야 하는지와
          무엇을 잃는지만 있으면 된다.
        */}
        <ul style={ruleStyle}>
          <li>좌우에서 내려오는 한글 단어를 타이핑한다.</li>
          <li>
            <strong style={{ color: '#ffcf5c' }}>Enter를 누른 순간</strong>의 화살표
            위치로 물건이 떨어진다.
          </li>
          <li>
            물건이 쏠려서 받침대를 벗어나면{' '}
            <strong style={{ color: '#ff6b6b' }}>목숨이 하나</strong> 줄어든다.
          </li>
          <li>
            목숨은 <strong style={{ color: '#ff6b6b' }}>{LIVES}개(♥♥♥)</strong>. 다 잃으면
            게임이 끝난다.
          </li>
        </ul>

        <div style={{ display: 'grid', gap: 10, maxWidth: 260, margin: '0 auto' }}>
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

        <p style={{ marginTop: 20, fontSize: 12, color: '#4a5171' }}>
          ↑↓ 또는 Tab으로 고르고 Enter로 들어간다
        </p>
      </div>
    </div>
  )
}

export { TitleScreen }
