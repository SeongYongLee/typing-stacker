import type { CSSProperties, ReactNode } from 'react'
import { MenuButton } from '../components/MenuButton.tsx'
import { Danger, Key } from '../components/SidePanel.tsx'
import { LIVES } from '../game/config.ts'
import { useMenuKeys } from '../hooks/useMenuKeys.ts'

interface SoloRulesScreenProps {
  onStart: () => void
}

const RULES: readonly ReactNode[] = [
  '좌우에서 내려오는 한글 단어를 타이핑합니다.',
  <>
    <Key>Enter를 누른 순간</Key>의 화살표 위치로 물건이 떨어집니다.
  </>,
  <>
    물건이 쏠려서 받침대를 벗어나면 <Danger>목숨이 하나</Danger> 줄어듭니다.
  </>,
  <>
    목숨은 <Danger>{LIVES}개(♥♥♥)</Danger>. 다 잃으면 게임이 끝납니다.
  </>,
]

const rootStyle: CSSProperties = {
  height: '100%',
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr) auto',
  gap: 24,
  padding: 'clamp(28px, 4vh, 48px) 48px',
}

const titleStyle: CSSProperties = {
  margin: 0,
  textAlign: 'center',
  font: '400 42px/1 var(--display)',
  letterSpacing: '0.12em',
  textIndent: '0.12em',
  color: '#f2f4fb',
  textShadow: '0 2px 14px rgba(5, 9, 17, 0.86)',
}

const panelStyle: CSSProperties = {
  width: 'min(760px, calc(100vw - 96px))',
  alignSelf: 'center',
  justifySelf: 'center',
  padding: '24px 28px',
  border: '1px solid #262b3d',
  borderRadius: 16,
  background: '#151824',
  boxShadow: '0 18px 48px rgba(5, 9, 17, 0.24)',
}

const listStyle: CSSProperties = {
  margin: 0,
  padding: '0 0 0 20px',
  display: 'grid',
  gap: 12,
  // 혼자 하기 Primary 버튼과 같은 크기로 읽히게 한다
  fontSize: 17,
  lineHeight: 1.65,
  color: '#b6bdd4',
}

function SoloRulesScreen({ onStart }: SoloRulesScreenProps) {
  const menu = useMenuKeys({ count: 1, onActivate: onStart })

  return (
    <main style={rootStyle} data-solo-rules>
      <h1 style={titleStyle}>GAME RULES</h1>

      <section style={panelStyle} aria-label="게임 규칙">
        <ul style={listStyle} data-blurb="solo">
          {RULES.map((rule, index) => (
            <li key={index}>{rule}</li>
          ))}
        </ul>
      </section>

      <div style={{ width: 360, maxWidth: '100%', justifySelf: 'center' }}>
        <MenuButton
          selected={menu.index === 0}
          onClick={onStart}
          onHover={() => menu.select(0)}
          primary
        >
          게임 시작
        </MenuButton>
      </div>
    </main>
  )
}

export { SoloRulesScreen }
