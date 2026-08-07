import type { CSSProperties } from 'react'
import type { RunStats } from '../game/types/game.ts'

interface HudProps {
  stats: RunStats
  elapsed: number
}

const wrapStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 28,
  padding: '12px 20px',
  borderBottom: '1px solid #262b3d',
  background: '#151824',
}

function Hud({ stats, elapsed }: HudProps) {
  return (
    <div style={wrapStyle}>
      {/* 점수·목숨·콤보는 여기 없다 — 시선이 머무는 입력창 옆(InputBar)으로 옮겼다 */}
      <Metric label="쌓기" value={`${stats.stackCount}개`} strong />
      <Metric label="최고 높이" value={`${stats.maxHeight.toFixed(2)}m`} />
      <Metric label="놓친 단어" value={`${stats.missedWords}개`} />
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 28 }}>
        <Metric label="타수" value={`${stats.kpm}타`} />
        <Metric label="경과" value={formatTime(elapsed)} />
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  strong = false,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontSize: 12, color: '#6a7290', letterSpacing: '0.06em' }}>
        {label}
      </span>
      <span
        style={{
          fontSize: strong ? 24 : 17,
          fontWeight: 600,
          color: strong ? '#ffcf5c' : '#f2f4fb',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
    </div>
  )
}

function formatTime(seconds: number): string {
  const total = Math.floor(seconds)
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export { Hud }
