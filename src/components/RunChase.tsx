import { useLayoutEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { play } from './animate.ts'
import { useLeaderboard } from '../hooks/useLeaderboard.ts'
import { chaseOf, crownOf, rankOf } from '../rank/chase.ts'

/**
 * 판이 도는 동안 **지금 쫓고 있는 것**을 알린다.
 *
 * 무엇을 쫓게 할지의 규칙은 `rank/chase.ts`에 있다. 여기는 그것을 어떻게 보일지만 정한다.
 *
 * **조용히 있다가 알린다.** 숫자가 매 프레임 바뀌면 시선을 끄는데 눈은 아레나와
 * 입력창에 있어야 한다. 그래서 평소에는 작고 흐리게 두고, **쫓는 대상이 바뀌는
 * 순간에만** 한 번 튄다 — 그건 하나를 넘어섰다는 뜻이라 그때는 볼 값이 있다.
 *
 * 순위를 못 받아오면 자리를 비운다. 판은 순위를 몰라도 돌아가야 한다.
 */
const wrapStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  fontVariantNumeric: 'tabular-nums',
}

function RunChase({ score }: { score: number }) {
  const board = useLeaderboard()
  const ref = useRef<HTMLDivElement | null>(null)

  const view = board.view
  const chase = view === null ? null : chaseOf(score, view.best, view.top)
  const crown = view === null ? null : crownOf(score, view.best, view.top)
  const rank = view === null ? null : rankOf(score, view.top)
  const label = chase?.label ?? crown

  useLayoutEffect(() => {
    if (label === null) {
      return
    }
    play(
      ref.current,
      [
        { transform: 'scale(1.25)', opacity: 0.4 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      { duration: 420, easing: 'ease-out' },
    )
  }, [label])

  if (label === null) {
    return null
  }

  return (
    <div ref={ref} style={wrapStyle} data-chase={label} data-rank={rank ?? 'out'}>
      {/*
        지금 몇 위인지. 상위 목록 밖이면 등수를 알 수 없으므로 지어내지 않고
        "순위권 밖"이라고 말한다 — 그 자리에 숫자를 넣으면 그 숫자를 믿게 된다.
      */}
      <span style={{ fontSize: 13, color: rank === null ? '#5a6284' : '#8b93b4' }}>
        {rank === null ? '순위권 밖' : `지금 ${rank}위`}
      </span>
      <span style={{ color: '#333a52' }}>|</span>
      {chase !== null && (
        <span style={{ fontSize: 12, color: '#6a7290', letterSpacing: '0.06em' }}>
          목표
        </span>
      )}
      <span style={{ fontSize: 17, fontWeight: 600, color: '#e4e68a' }}>
        {chase === null ? label : `${label}까지`}
      </span>
      {chase !== null && (
        <span style={{ fontSize: 13, color: '#8b93b4' }}>
          {chase.gap.toLocaleString()}점
        </span>
      )}
    </div>
  )
}

export { RunChase }
