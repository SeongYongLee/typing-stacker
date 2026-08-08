import type { CSSProperties } from 'react'
import { tierOf } from '../rank/tiers.ts'
import type { Leaderboard } from '../hooks/useLeaderboard.ts'

/**
 * 시작 화면에서 고른 항목에 딸린 것을 옆에 보여준다.
 *
 * 혼자 하기에는 점수 순위를, 1대1 대전에는 티어를 붙인다. 메뉴 안에 숫자를 늘어놓지
 * 않는 이유는 고르는 길이 길어지기 때문이다 — 옆에 두면 눈은 닿되 손은 방해받지 않는다.
 *
 * 자리를 항상 차지한다. 항목을 오갈 때마다 나타났다 사라지면 메뉴가 좌우로 흔들려
 * 무엇을 고르는 중인지 놓친다.
 */
interface TitleSidePanelProps {
  kind: 'solo' | 'versus' | null
  board: Leaderboard
}

const PANEL_WIDTH = 260

const rootStyle: CSSProperties = {
  width: PANEL_WIDTH,
  minHeight: 260,
  padding: '18px 20px',
  border: '1px solid #262b3d',
  borderRadius: 12,
  background: '#151824',
  textAlign: 'left',
}

const titleStyle: CSSProperties = {
  fontSize: 12,
  color: '#6a7290',
  letterSpacing: '0.08em',
  margin: '0 0 14px',
}

function TitleSidePanel({ kind, board }: TitleSidePanelProps) {
  return (
    <div style={rootStyle} data-side-panel={kind ?? 'none'}>
      {kind === 'solo' && <SoloRanking board={board} />}
      {kind === 'versus' && <VersusTier board={board} />}
      {kind === null && <p style={titleStyle}>&nbsp;</p>}
    </div>
  )
}

function Waiting({ board }: { board: Leaderboard }) {
  if (board.status === 'loading') {
    return <p style={{ fontSize: 13, color: '#4a5171', margin: 0 }}>불러오는 중…</p>
  }
  // 순위를 못 받아도 게임은 할 수 있다. 그 사실만 조용히 알린다
  return <p style={{ fontSize: 13, color: '#4a5171', margin: 0 }}>순위를 불러오지 못했다</p>
}

function SoloRanking({ board }: { board: Leaderboard }) {
  const view = board.view
  if (view === null) {
    return (
      <>
        <p style={titleStyle}>점수 순위</p>
        <Waiting board={board} />
      </>
    )
  }

  return (
    <>
      <p style={titleStyle}>점수 순위</p>
      {view.top.length === 0 ? (
        <p style={{ fontSize: 13, color: '#4a5171', margin: 0 }}>아직 기록이 없다</p>
      ) : (
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 7 }}>
          {view.top.slice(0, 5).map((record, index) => (
            <li
              key={record.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '18px 1fr auto',
                gap: 8,
                fontSize: 13,
                color: index === 0 ? '#ffcf5c' : '#b6bdd4',
              }}
            >
              <span style={{ color: '#6a7290' }}>{index + 1}</span>
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {record.name}
              </span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                {record.score.toLocaleString('ko-KR')}
              </span>
            </li>
          ))}
        </ol>
      )}

      {/* 내 자리는 따로 떼어 보여준다 — 5등 밖이면 위 목록에 없다 */}
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #262b3d' }}>
        <p style={{ ...titleStyle, margin: '0 0 6px' }}>내 최고</p>
        {view.best === null ? (
          <p style={{ fontSize: 13, color: '#4a5171', margin: 0 }}>아직 없다</p>
        ) : (
          <p style={{ fontSize: 14, color: '#f2f4fb', margin: 0 }}>
            {view.best.score.toLocaleString('ko-KR')}
            {view.rank !== null && (
              <span style={{ color: '#6a7290', fontSize: 12 }}> · {view.rank}위</span>
            )}
          </p>
        )}
      </div>
    </>
  )
}

function VersusTier({ board }: { board: Leaderboard }) {
  const view = board.view
  if (view === null) {
    return (
      <>
        <p style={titleStyle}>티어</p>
        <Waiting board={board} />
      </>
    )
  }

  const tier = tierOf(view.rating)
  const played = view.wins + view.losses

  return (
    <>
      <p style={titleStyle}>티어</p>
      <p style={{ fontSize: 26, fontWeight: 700, color: tier.color, margin: '0 0 4px' }}>
        {tier.name}
      </p>
      <p style={{ fontSize: 13, color: '#6a7290', margin: 0 }}>
        레이팅 {Math.round(view.rating)}
      </p>

      <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #262b3d' }}>
        <p style={{ ...titleStyle, margin: '0 0 6px' }}>전적</p>
        {played === 0 ? (
          <p style={{ fontSize: 13, color: '#4a5171', margin: 0 }}>아직 붙어본 적이 없다</p>
        ) : (
          <p style={{ fontSize: 14, color: '#f2f4fb', margin: 0 }}>
            <span style={{ color: '#6bffb0' }}>{view.wins}승</span>
            <span style={{ color: '#6a7290' }}> · </span>
            <span style={{ color: '#ff6b6b' }}>{view.losses}패</span>
          </p>
        )}
      </div>
    </>
  )
}

export { TitleSidePanel }
