import type { CSSProperties, ReactNode } from 'react'
import { MenuButton } from '../components/MenuButton.tsx'
import { useMenuKeys } from '../hooks/useMenuKeys.ts'

interface SoloRulesScreenProps {
  onStart: () => void
  onHideAndStart: () => void
}

const RULES: readonly ReactNode[] = [
  '단어를 입력해 상자 안에 분실물을 넣습니다.',
  '합성한 물건과 화이트보드의 동그라미 항목을 찾아 돌려보냅니다.',
  '놓친 단어가 쌓이면 혼잡 경보가 차고 물건이 한꺼번에 떨어집니다.',
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
    { label: '튜토리얼 보기', run: onStart, primary: true },
    { label: '앞으로 튜토리얼 보지 않기', run: onHideAndStart, primary: false },
  ]
  const menu = useMenuKeys({
    count: actions.length,
    onActivate: (index) => actions[index]?.run(),
  })

  return (
    <main style={rootStyle} data-solo-rules>
      <h1 style={titleStyle}>TUTORIAL</h1>

      <div style={contentStyle}>
        <div style={rulesGroupStyle}>
          <p style={introStyle}>튜토리얼을 다시 볼까요?</p>
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
