import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import type { DifficultyProgress } from '../game/core/GameEngine.ts'
import type { RunStats } from '../game/types/game.ts'
import { play } from './animate.ts'

interface HudProps {
  stats: RunStats
  elapsed: number
  difficulty: DifficultyProgress
}

const wrapStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 28,
  padding: '12px 20px',
  borderBottom: '1px solid #262b3d',
  background: '#151824',
}

function Hud({ stats, elapsed, difficulty }: HudProps) {
  return (
    <div style={wrapStyle}>
      {/* 목숨과 콤보는 여기 없다 — 시선이 머무는 입력창 옆(InputBar)으로 옮겼다 */}
      <Metric label="점수" value={stats.score.toLocaleString('ko-KR')} strong />
      <Metric label="쌓기" value={`${stats.stackCount}개`} />
      <Metric label="최고 높이" value={`${stats.maxHeight.toFixed(2)}m`} />
      <Metric label="놓친 단어" value={`${stats.missedWords}개`} />
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 28 }}>
        <StageMeter difficulty={difficulty} />
        <Metric label="타수" value={`${stats.kpm}타`} />
        <Metric label="경과" value={formatTime(elapsed)} />
      </div>
    </div>
  )
}

const STAGE_COLOR = '#ffcf5c'

/**
 * 지금 몇 단계인지와 다음 단계까지 얼마나 남았는지.
 * 난이도는 단계로만 바뀌므로(Difficulty.ts) 게이지가 꽉 차는 순간이 곧 값이 바뀌는 순간이다.
 */
function StageMeter({ difficulty }: { difficulty: DifficultyProgress }) {
  const { stage, total, progress } = difficulty
  const numberRef = useRef<HTMLSpanElement | null>(null)
  const barRef = useRef<HTMLDivElement | null>(null)
  const previousStage = useRef(stage)

  useEffect(() => {
    const raised = stage > previousStage.current
    previousStage.current = stage
    if (!raised) {
      return
    }
    play(
      numberRef.current,
      [
        { transform: 'scale(1)', color: '#f2f4fb' },
        { transform: 'scale(1.7)', color: STAGE_COLOR, offset: 0.25 },
        { transform: 'scale(1)', color: '#f2f4fb' },
      ],
      { duration: 700, easing: 'ease-out' },
    )
    play(
      barRef.current,
      [
        { boxShadow: `0 0 0 0 ${STAGE_COLOR}` },
        { boxShadow: `0 0 10px 3px ${STAGE_COLOR}`, offset: 0.3 },
        { boxShadow: '0 0 0 0 rgba(255, 207, 92, 0)' },
      ],
      { duration: 700, easing: 'ease-out' },
    )
  }, [stage])

  const maxed = stage >= total

  return (
    <div style={{ display: 'grid', gap: 4, justifyItems: 'center', minWidth: 76 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 12, color: '#6a7290', letterSpacing: '0.06em' }}>
          난이도
        </span>
        <span
          ref={numberRef}
          style={{
            display: 'inline-block',
            fontSize: 17,
            fontWeight: 600,
            color: '#f2f4fb',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {stage}
          <span style={{ fontSize: 12, color: '#6a7290' }}>{` / ${total}`}</span>
        </span>
      </div>
      <div
        ref={barRef}
        style={{ width: '100%', height: 3, borderRadius: 2, background: '#262b3d' }}
        role="progressbar"
        aria-label={maxed ? '난이도 최대' : '다음 난이도까지'}
        aria-valuenow={Math.round(progress * 100)}
      >
        <div
          style={{
            width: `${progress * 100}%`,
            height: '100%',
            borderRadius: 2,
            background: maxed ? '#ff6b6b' : STAGE_COLOR,
          }}
        />
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
