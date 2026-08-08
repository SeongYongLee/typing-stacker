import type { CSSProperties, ReactNode } from 'react'
import { tierOf } from '../rank/tiers.ts'
import { loadProfile } from '../storage/profile.ts'
import type { Leaderboard } from '../hooks/useLeaderboard.ts'
import { LIVES } from '../game/config.ts'
import { MAX_PLAYERS } from '../multi/protocol.ts'

/**
 * 시작 화면에서 고른 항목에 딸린 것을 옆에 보여준다.
 *
 * **설명이 여기 산다.** 예전에는 규칙이 메뉴 위에 한 덩어리로 붙어 있었고 대전 규칙은
 * 대전 화면에 들어가야 볼 수 있었다. 그러면 혼자 할 사람도 대전 설명을 지나쳐야 하고,
 * 대전을 고를지 말지는 들어가 봐야 정할 수 있다. 고른 것의 설명만 옆에 세우면
 * 읽을 것이 늘 넷 중 하나다.
 *
 * 자리와 **크기**를 항상 차지한다. 항목을 오갈 때마다 나타났다 사라지거나 늘었다 줄면
 * 메뉴가 흔들려 무엇을 고르는 중인지 놓친다.
 */
interface TitleSidePanelProps {
  kind: PanelKind | null
  board: Leaderboard
}

type PanelKind = 'solo' | 'versus' | 'collection' | 'options'

const PANEL_WIDTH = 300

/**
 * 기둥의 높이를 못 박는다.
 *
 * `minHeight`로 두었더니 항목을 오갈 때마다 판이 늘었다 줄었고, 판이 메뉴보다 크므로
 * **그 변화가 곧 버튼의 위치**가 됐다. 고르려던 것이 손 아래에서 움직이는 셈이다.
 * 자리를 항상 차지하게 만든 것과 같은 이유인데, 폭만 잡고 높이를 놓아둔 것이 빠져 있었다.
 */
const PANEL_HEIGHT = 470

/**
 * 기록과 설명은 **다른 상자**에 담고, **기록이 위**다.
 *
 * 한 상자에 선만 그어 나눠봤더니 "이 게임은 이렇게 하는 것이다"와 "지금 내 기록은
 * 이렇다"가 한 덩어리로 읽혔다. 앞은 판마다 달라지는 것이고 뒤는 한 번 읽고 마는
 * 것이라, 상자를 갈라 눈이 둘을 다른 종류로 받게 한다. 바뀌는 쪽이 위에 있어야
 * 다시 올 때마다 눈이 같은 자리에서 새 값을 만난다.
 *
 * 도감과 옵션에는 기록 상자가 없다. 그래도 기둥 높이는 그대로라 버튼이 움직이지 않는다.
 */
const columnStyle: CSSProperties = {
  width: PANEL_WIDTH,
  height: PANEL_HEIGHT,
  display: 'grid',
  // 두 상자 모두 제 내용만큼만 차지한다. 늘려 채우면 한 줄짜리 설명이 빈 상자로 보인다
  gridTemplateRows: 'auto auto',
  alignContent: 'start',
  gap: 12,
  textAlign: 'left',
}

/**
 * 상자 안에는 스크롤을 두지 않는다.
 *
 * 굴려야 보이는 것은 없는 것과 같다 — 시작 화면에서 순위를 훑는 사람은 스크롤바를
 * 찾지 않는다. 그래서 기둥 높이(`PANEL_HEIGHT`)를 **가장 긴 경우가 그대로 들어가는
 * 값**으로 잡아뒀다. 내용이 늘어 넘치기 시작하면 그 값을 올려야 한다.
 */
const boxStyle: CSSProperties = {
  padding: '16px 18px',
  border: '1px solid #262b3d',
  borderRadius: 12,
  background: '#151824',
}

const titleStyle: CSSProperties = {
  fontSize: 12,
  color: '#6a7290',
  letterSpacing: '0.08em',
  margin: '0 0 14px',
}

function Key({ children }: { children: ReactNode }) {
  return <strong style={{ color: '#ffcf5c' }}>{children}</strong>
}

function Danger({ children }: { children: ReactNode }) {
  return <strong style={{ color: '#ff6b6b' }}>{children}</strong>
}

/**
 * 항목마다의 설명.
 *
 * 한자리에 모아두는 이유는 넷을 나란히 놓고 길이와 결을 맞춰야 하기 때문이다 —
 * 하나만 길면 그 항목이 어려운 것처럼 읽힌다.
 */
const BLURBS: Record<PanelKind, readonly ReactNode[]> = {
  solo: [
    '좌우에서 내려오는 한글 단어를 타이핑한다.',
    <>
      <Key>Enter를 누른 순간</Key>의 화살표 위치로 물건이 떨어진다.
    </>,
    <>
      물건이 쏠려서 받침대를 벗어나면 <Danger>목숨이 하나</Danger> 줄어든다.
    </>,
    <>
      목숨은 <Danger>{LIVES}개(♥♥♥)</Danger>. 다 잃으면 게임이 끝난다.
    </>,
  ],
  versus: [
    <>받침대 하나를 최대 {MAX_PLAYERS}명이 함께 쓴다. 목숨은 각자 {LIVES}개다.</>,
    <>
      내가 쌓은 물건이 받침대를 벗어나면 <Danger>내 목숨</Danger>이 하나 깎인다.
    </>,
    <>
      떨군 직후에는 잠깐 떨굴 수 없다. 그동안 친 단어는 <Key>방해</Key>가 되어, 남이 그
      단어를 떨구면 그 사람 하트가 <Danger>반 칸</Danger> 깎인다.
    </>,
  ],
  // 도감과 옵션은 규칙이 아니라 자리다. 무엇이 있는 곳인지만 알면 들어가서 보면 된다
  collection: ['그동안 만난 물건이 모이는 곳이다.'],
  options: ['소리와 화면, 이름 같은 게임 설정을 바꾼다.'],
}

function Blurb({ kind }: { kind: PanelKind }) {
  return (
    <ul
      style={{
        margin: 0,
        padding: '0 0 0 16px',
        display: 'grid',
        gap: 8,
        fontSize: 13,
        lineHeight: 1.65,
        color: '#b6bdd4',
      }}
      data-blurb={kind}
    >
      {BLURBS[kind].map((line, index) => (
        <li key={index}>{line}</li>
      ))}
    </ul>
  )
}

function TitleSidePanel({ kind, board }: TitleSidePanelProps) {
  const hasRecord = kind === 'solo' || kind === 'versus'
  return (
    <div style={columnStyle} data-side-panel={kind ?? 'none'}>
      {hasRecord && (
        <div style={boxStyle} data-record={kind}>
          {kind === 'solo' ? <SoloRanking board={board} /> : <VersusTier board={board} />}
        </div>
      )}
      {kind !== null && (
        <div style={boxStyle}>
          <Blurb kind={kind} />
        </div>
      )}
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

  /*
   * 이름은 순위와 함께 묶지 않는다. 순위는 서버에서 오지만 이름은 이 기기에 있어서,
   * 서버가 답하지 않는다고 자기 이름까지 사라지면 바꾸러 갈 길이 화면에서 없어진다.
   */
  if (view === null) {
    return (
      <>
        <p style={titleStyle}>점수 순위</p>
        <Waiting board={board} />
        <MyName />
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

      {/*
        내 자리는 따로 떼어 보여준다 — 5등 밖이면 위 목록에 없다.
        이름을 함께 두는 이유는 목록에서 자기 줄을 찾으려면 자기 이름을 알아야 하기
        때문이다. 이름은 옵션에서 고른다.
      */}
      <MyName>
        <p style={{ ...titleStyle, margin: '10px 0 6px' }}>내 최고</p>
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
      </MyName>
    </>
  )
}

/** 이 기기의 이름. 순위표에서 자기 줄을 찾으려면 이것을 알아야 한다 */
function MyName({ children }: { children?: ReactNode }) {
  return (
    <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #262b3d' }}>
      <p style={{ ...titleStyle, margin: '0 0 6px' }}>내 이름</p>
      <p style={{ fontSize: 14, color: '#f2f4fb', margin: 0 }} data-my-name>
        {loadProfile().name}
      </p>
      {children}
    </div>
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
