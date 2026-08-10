import type { CSSProperties, ReactNode } from 'react'
import { MenuButton } from '../components/MenuButton.tsx'
import { Danger, Key } from '../components/SidePanel.tsx'
import { SOLO_LIVES } from '../game/config.ts'
import { useMenuKeys } from '../hooks/useMenuKeys.ts'

interface SoloRulesScreenProps {
  onStart: () => void
  onHideAndStart: () => void
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
    목숨은 <Danger>{SOLO_LIVES}개({'♥'.repeat(SOLO_LIVES)})</Danger>. 다 잃으면 게임이 끝납니다.
  </>,
  <>
    밤에는 <Key>Night Fever</Key>. 별빛 재료 6개가 쏟아지고 3초 쉬며 목숨이 무적이 됩니다.
  </>,
]

const rootStyle: CSSProperties = {
  height: '100%',
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr)',
  gap: 24,
  padding: 'clamp(28px, 4vh, 48px) 48px',
}

const contentStyle: CSSProperties = {
  minHeight: 0,
  display: 'grid',
  alignContent: 'center',
  gap: 96,
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

const rulesGroupStyle: CSSProperties = {
  display: 'grid',
  justifyItems: 'center',
  gap: 28,
}

const introStyle: CSSProperties = {
  margin: 0,
  fontSize: 30,
  fontWeight: 700,
  lineHeight: 1.4,
  color: '#f2f4fb',
  textAlign: 'center',
  textShadow: '0 2px 14px rgba(5, 9, 17, 0.78)',
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

function SoloRulesScreen({ onStart, onHideAndStart }: SoloRulesScreenProps) {
  const actions = [
    { label: '게임 시작', run: onStart, primary: true },
    { label: '다시 보지 않기', run: onHideAndStart, primary: false },
  ]
  const menu = useMenuKeys({
    count: actions.length,
    onActivate: (index) => actions[index]?.run(),
  })

  return (
    <main style={rootStyle} data-solo-rules>
      <h1 style={titleStyle}>GAME RULES</h1>

      <div style={contentStyle}>
        <div style={rulesGroupStyle}>
          <p style={introStyle}>타자를 쳐서 물건이 떨어지지 않게 높게 쌓아보세요!</p>
          <section style={panelStyle} aria-label="게임 규칙">
            <ul style={listStyle} data-blurb="solo">
              {RULES.map((rule, index) => (
                <li key={index}>{rule}</li>
              ))}
            </ul>
          </section>
        </div>

        <div style={{ width: 360, maxWidth: '100%', justifySelf: 'center', display: 'grid', gap: 10 }}>
          {actions.map((action, index) => (
            <MenuButton
              key={action.label}
              selected={menu.index === index}
              onClick={action.run}
              onHover={() => menu.select(index)}
              primary={action.primary}
            >
              {action.label}
            </MenuButton>
          ))}
        </div>
      </div>
    </main>
  )
}

export { SoloRulesScreen }
