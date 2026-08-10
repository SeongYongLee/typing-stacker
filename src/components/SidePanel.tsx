import type { ReactNode } from 'react'
import { panelBoxStyle, panelColumnStyle } from './sidePanelStyle.ts'

/**
 * 메뉴 옆에 서는 판.
 *
 * **설명이 여기 산다.** 예전에는 규칙이 메뉴 위에 한 덩어리로 붙어 있었고 대전 규칙은
 * 대전 화면에 들어가야 볼 수 있었다. 그러면 혼자 할 사람도 대전 설명을 지나쳐야 하고,
 * 대전을 고를지 말지는 들어가 봐야 정할 수 있다. 고른 것의 설명만 옆에 세우면
 * 읽을 것이 늘 하나다.
 *
 * 자리와 **크기**를 항상 차지한다. 항목을 오갈 때마다 나타났다 사라지거나 늘었다 줄면
 * 메뉴가 흔들려 무엇을 고르는 중인지 놓친다.
 */
interface SidePanelProps {
  /** 판마다 달라지는 것(순위·티어). 없는 항목도 있다 */
  record?: ReactNode
  /** 고른 항목의 설명 */
  blurb?: ReactNode
  /** 자동화 검증이 지금 무엇이 골라졌는지 읽는 통로 */
  kind: string
}

function SidePanel({ record, blurb, kind }: SidePanelProps) {
  return (
    <div style={panelColumnStyle} data-side-panel={kind}>
      {record !== undefined && record !== null && (
        <div style={panelBoxStyle} data-record={kind}>
          {record}
        </div>
      )}
      {blurb !== undefined && blurb !== null && <div style={panelBoxStyle}>{blurb}</div>}
    </div>
  )
}

/** 설명 줄들. 화면마다 목록만 다르고 생김새는 같다 */
function Blurb({
  lines,
  kind,
  fontSize = 13,
}: {
  lines: readonly ReactNode[]
  kind: string
  fontSize?: number
}) {
  return (
    <ul
      style={{
        margin: 0,
        padding: '0 0 0 16px',
        display: 'grid',
        gap: 8,
        fontSize,
        lineHeight: 1.65,
        color: '#b6bdd4',
      }}
      data-blurb={kind}
    >
      {lines.map((line, index) => (
        <li key={index}>{line}</li>
      ))}
    </ul>
  )
}

function Key({ children }: { children: ReactNode }) {
  return <strong style={{ color: '#e4e68a' }}>{children}</strong>
}

function Danger({ children }: { children: ReactNode }) {
  return <strong style={{ color: '#ff6b6b' }}>{children}</strong>
}

export { SidePanel, Blurb, Key, Danger }
