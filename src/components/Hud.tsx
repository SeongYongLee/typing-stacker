import type { CSSProperties } from 'react'
import { LIVES } from '../game/config.ts'
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
      <Metric label="점수" value={stats.score.toLocaleString('ko-KR')} strong />
      <Lives lives={stats.lives} />
      <Combo combo={stats.combo} />
      <Metric label="쌓기" value={`${stats.stackCount}개`} />
      <Metric label="최고 높이" value={`${stats.maxHeight.toFixed(2)}m`} />
      <Metric label="놓친 단어" value={`${stats.missedWords}개`} />
      <div style={{ marginLeft: 'auto' }}>
        <Metric label="경과" value={formatTime(elapsed)} />
      </div>
    </div>
  )
}

function Lives({ lives }: { lives: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 12, color: '#6a7290', letterSpacing: '0.06em' }}>목숨</span>
      <span style={{ fontSize: 17, letterSpacing: '0.12em' }}>
        {Array.from({ length: LIVES }, (_, index) => (
          <span key={index} style={{ color: index < lives ? '#ff6b6b' : '#2e3448' }}>
            ♥
          </span>
        ))}
      </span>
    </div>
  )
}

function Combo({ combo }: { combo: number }) {
  const active = combo > 0
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontSize: 12, color: '#6a7290', letterSpacing: '0.06em' }}>콤보</span>
      <span
        style={{
          fontSize: 17,
          fontWeight: 600,
          color: active ? '#6bffb0' : '#6a7290',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {active ? `x${combo}` : '—'}
      </span>
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
