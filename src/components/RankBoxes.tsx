import { Avatar } from './Avatar.tsx'
import { panelTitleStyle } from './sidePanelStyle.ts'
import { tierOf } from '../rank/tiers.ts'
import type { Leaderboard } from '../hooks/useLeaderboard.ts'

/**
 * 서버에서 받아온 기록을 그리는 상자 속.
 *
 * 화면이 아니라 **내용**이라 여기 따로 둔다 — 시작 화면과 대전 대기방이 같은 티어를
 * 보여주므로, 화면 파일 안에 두면 한쪽이 다른 쪽을 가져다 쓰는 모양이 된다.
 */
function Waiting({ board }: { board: Leaderboard }) {
  if (board.status === 'loading') {
    return <p style={{ fontSize: 13, color: '#4a5171', margin: 0 }}>불러오는 중…</p>
  }
  // 순위를 못 받아도 게임은 할 수 있다. 그 사실만 조용히 알린다
  return <p style={{ fontSize: 13, color: '#4a5171', margin: 0 }}>순위를 불러오지 못했습니다</p>
}

function SoloRanking({ board }: { board: Leaderboard }) {
  const view = board.view

  if (view === null) {
    return (
      <>
        <p style={panelTitleStyle}>점수 순위</p>
        <Waiting board={board} />
      </>
    )
  }

  return (
    <>
      <p style={panelTitleStyle}>점수 순위</p>
      {view.top.length === 0 ? (
        <p style={{ fontSize: 13, color: '#4a5171', margin: 0 }}>아직 기록이 없습니다</p>
      ) : (
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 7 }}>
          {view.top.slice(0, 5).map((record, index) => (
            <li
              key={record.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '18px 22px 1fr auto',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                color: index === 0 ? '#e4e68a' : '#b6bdd4',
              }}
            >
              <span style={{ color: '#6a7290' }}>{index + 1}</span>
              {/* 안 고른 사람은 빈 동그라미가 같은 자리를 지킨다 — 줄이 어긋나지 않는다 */}
              <Avatar icon={record.icon ?? ''} size={22} />
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
        <p style={{ ...panelTitleStyle, margin: '0 0 6px' }}>내 최고</p>
        {view.best === null ? (
          <p style={{ fontSize: 13, color: '#4a5171', margin: 0 }}>아직 없습니다</p>
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

/**
 * 대전 쪽 순위표.
 *
 * **혼자 하기의 점수 순위와 같은 짜임이다** — 위에 남들의 목록, 아래에 내 자리.
 * 같은 자리에 번갈아 뜨는 두 칸이라, 짜임이 다르면 항목을 옮길 때마다 어디를 봐야
 * 하는지 다시 찾게 된다.
 *
 * 예전에는 내 티어만 있었다. 그러면 1120이 높은 값인지 알 수 없다 — 티어 이름이 그
 * 비교를 대신해주지만, 위에 누가 있는지 보이는 것과는 다르다.
 */
function VersusTier({ board }: { board: Leaderboard }) {
  const view = board.view
  if (view === null) {
    return (
      <>
        <p style={panelTitleStyle}>티어 순위</p>
        <Waiting board={board} />
      </>
    )
  }

  const tier = tierOf(view.rating)
  const played = view.wins + view.losses

  return (
    <>
      <p style={panelTitleStyle}>티어 순위</p>
      {view.ladder.length === 0 ? (
        <p style={{ fontSize: 13, color: '#4a5171', margin: 0 }}>아직 기록이 없습니다</p>
      ) : (
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 7 }}>
          {view.ladder.slice(0, 5).map((record, index) => {
            const theirs = tierOf(record.rating)
            return (
              <li
                key={record.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '18px 22px 1fr auto',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  color: index === 0 ? '#e4e68a' : '#b6bdd4',
                }}
              >
                <span style={{ color: '#6a7290' }}>{index + 1}</span>
                {/* 혼자 하기를 안 한 사람은 빈 동그라미가 자리를 지킨다 — 줄이 어긋나지 않는다 */}
                <Avatar icon={record.icon ?? ''} size={22} />
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {record.name}
                </span>
                {/* 숫자만 두면 그 값이 어느 등급인지 매번 표를 떠올려야 한다 */}
                <span style={{ fontVariantNumeric: 'tabular-nums', color: theirs.color }}>
                  {Math.round(record.rating)}
                </span>
              </li>
            )
          })}
        </ol>
      )}

      {/* 내 자리는 따로 떼어 보여준다 — 5등 밖이면 위 목록에 없다 */}
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #262b3d' }}>
        <p style={{ ...panelTitleStyle, margin: '0 0 6px' }}>내 티어</p>
        <p style={{ fontSize: 14, margin: 0 }}>
          <span style={{ color: tier.color, fontWeight: 700 }}>{tier.name}</span>
          <span style={{ color: '#6a7290' }}> · </span>
          <span style={{ color: '#f2f4fb', fontVariantNumeric: 'tabular-nums' }}>
            {Math.round(view.rating)}
          </span>
        </p>
        {played === 0 ? (
          <p style={{ fontSize: 13, color: '#4a5171', margin: '4px 0 0' }}>
            아직 붙어본 적이 없습니다
          </p>
        ) : (
          <p style={{ fontSize: 13, margin: '4px 0 0' }}>
            <span style={{ color: '#6bffb0' }}>{view.wins}승</span>
            <span style={{ color: '#6a7290' }}> · </span>
            <span style={{ color: '#ff6b6b' }}>{view.losses}패</span>
          </p>
        )}
      </div>
    </>
  )
}

export { SoloRanking, VersusTier }
