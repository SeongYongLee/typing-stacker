import { useEffect, useRef, useState } from 'react'
import { MenuButton } from '../../components/MenuButton.tsx'
import { Avatar } from '../../components/Avatar.tsx'
import { useMenuKeys } from '../../hooks/useMenuKeys.ts'
import { useRosterTiers } from '../../hooks/useRosterTiers.ts'
import { ownerColorAt } from '../../multi/ownerColors.ts'
import { MAX_TEXT } from '../../multi/ChatLog.ts'
import type { ChatLine } from '../../multi/ChatLog.ts'
import type { SessionPhase } from '../../multi/MatchSession.ts'
import { tierOf } from '../../rank/tiers.ts'
import { fieldStyle, panelStyle, rootStyle } from './lobbyStyle.ts'

/**
 * 붙은 뒤 시작 전 — 명단·티어·채팅·준비.
 *
 * 여섯 화면이 한 파일에 있었을 때 가장 컸다. 여기만 채팅과 티어를 함께 보여주므로
 * `ChatBox`·`TierBadge`도 같이 산다 — 다른 화면은 쓰지 않는다.
 */
/**
 * 붙은 뒤 시작 전.
 *
 * 상대가 들어오자마자 판이 열리면 누구와 붙는지 볼 겨를도, 손을 키보드에 올릴 겨를도
 * 없다 — 첫 단어가 이미 내려오고 있다. 양쪽이 준비를 눌러야 시작한다.
 */
function ReadyRoom({
  phase,
  onReady,
  onChat,
  onBack,
}: {
  phase: Extract<SessionPhase, { kind: 'ready' }>
  onReady: () => void
  onChat: (text: string) => void
  onBack: () => void
}) {
  const ready = new Set(phase.ready)
  const iAmReady = ready.has(phase.selfId)
  /*
   * 누구와 붙는지 **시작 전에** 알아야 한다. 판이 끝나고서야 상대가 어느 티어였는지
   * 아는 것은 늦다 — 그때는 이길지 질지가 이미 정해진 뒤다.
   */
  const ratings = useRosterTiers(phase.players)
  const waitingFor = phase.players.filter((player) => !ready.has(player.id)).length

  useMenuKeys({
    count: 1,
    useTab: false,
    onActivate: () => {
      if (!iAmReady) {
        onReady()
      }
    },
    onCancel: onBack,
  })

  return (
    <div style={rootStyle}>
      <div style={panelStyle} data-ready-room={ready.size}>
        <p style={{ color: '#6a7290', margin: 0, fontSize: 13, letterSpacing: '0.08em' }}>
          같이 할 사람들
        </p>

        <div style={{ display: 'grid', gap: 10 }}>
          {phase.players.map((player, index) => {
            const isReady = ready.has(player.id)
            const mine = player.id === phase.selfId
            return (
              <div
                key={player.id}
                data-ready={isReady ? 'yes' : 'no'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 16px',
                  borderRadius: 12,
                  background: '#0d0f16',
                  border: `1px solid ${isReady ? '#3f7a55' : '#2e3448'}`,
                }}
              >
                {/*
                   색 점 자리에 아이콘을 둔다. 테두리가 그 사람의 색이므로 점이 하던
                   일(누가 누구인지)은 그대로이고, 아이콘을 안 고른 사람은 빈 동그라미가
                   같은 자리를 지킨다 — 줄이 어긋나지 않는다.
                 */}
                <Avatar icon={player.icon} size={26} ring={ownerColorAt(index)} />
                <span
                  style={{
                    flex: 1,
                    textAlign: 'left',
                    fontSize: 17,
                    fontWeight: mine ? 700 : 500,
                    color: '#f2f4fb',
                  }}
                >
                  {player.nickname}
                  {mine && ' (나)'}
                </span>
                <TierBadge rating={ratings.get(player.device)} />
                <span style={{ fontSize: 14, color: isReady ? '#6bffb0' : '#6a7290' }}>
                  {isReady ? '준비됨' : '기다리는 중…'}
                </span>
              </div>
            )
          })}
        </div>

        {/*
          코드로 모인 방에서만 말이 오간다. 랭크 게임은 서로 모르는 사이라 말을 걸
          자리가 아니고, 그 판단은 세션이 해서 여기로 내려온다.
        */}
        {phase.chatEnabled && <ChatBox lines={phase.chat} selfId={phase.selfId} onSend={onChat} />}

        {/* 규칙 설명은 바로 앞 화면에서 이미 읽었다. 여기서 볼 것은 상대와 준비 상태뿐이다 */}
        <MenuButton selected={!iAmReady} onClick={onReady} disabled={iAmReady} primary>
          {iAmReady ? `상대를 기다립니다… (${waitingFor}명)` : '준비 (Enter)'}
        </MenuButton>

        <MenuButton selected={false} onClick={onBack}>
          나가기 (Esc)
        </MenuButton>
      </div>
    </div>
  )
}

/**
 * 시작까지 세는 화면.
 *
 * 준비를 누르는 순간 바로 시작하면 첫 단어가 이미 내려오고 있다 — 누른 사람은
 * 마우스에 손이 가 있고 키보드로 옮길 틈이 없다. 특히 마지막에 누른 사람이 아니면
 * 언제 열리는지 모른 채 당한다.
 *
 * 숫자를 크게 두는 이유는 **눈이 여기 하나에만 있게** 하려는 것이다. 명단이나 규칙을
 * 같이 두면 그것을 읽다가 시작을 놓친다.
 */

/**
 * 준비 화면에서 주고받는 말.
 *
 * 판이 도는 동안에는 이름표 위 말풍선으로 뜨지만 여기서는 **목록으로 쌓는다** —
 * 시작을 기다리는 자리라 시선을 뺏길 것이 없고, 오간 말을 한 번에 훑는 편이 낫다.
 *
 * Enter만으로 보낸다. 이 화면에서 Enter는 준비를 뜻하기도 하는데, 칸에 글자가 있을
 * 때는 말이 먼저다 — 적어둔 것을 버리고 판이 시작되면 되돌릴 길이 없다.
 */
function ChatBox({
  lines,
  selfId,
  onSend,
}: {
  lines: readonly ChatLine[]
  selfId: string
  onSend: (text: string) => void
}) {
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement | null>(null)

  // 새 말이 오면 아래로 따라간다. 안 그러면 방금 온 말이 접힌 채로 남는다
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [lines.length])

  const send = (): void => {
    if (text.trim().length === 0) {
      return
    }
    onSend(text)
    setText('')
  }

  return (
    <div style={{ display: 'grid', gap: 8 }} data-chat={lines.length}>
      <div
        style={{
          height: 120,
          overflowY: 'auto',
          textAlign: 'left',
          padding: '8px 10px',
          borderRadius: 10,
          background: '#0d0f16',
          border: '1px solid #2e3448',
          display: 'grid',
          gap: 4,
          alignContent: 'start',
        }}
      >
        {lines.length === 0 ? (
          <span style={{ fontSize: 13, color: '#4a5171' }}>
            시작 전에 한마디 나눌 수 있습니다.
          </span>
        ) : (
          lines.map((line) => (
            <span key={line.seq} style={{ fontSize: 14, color: '#b6bdd4', lineHeight: 1.5 }}>
              <b style={{ color: line.from === selfId ? '#ffcf5c' : '#8bd6ff' }}>
                {line.nickname}
              </b>{' '}
              {line.text}
            </span>
          ))
        )}
        <div ref={endRef} />
      </div>
      <input
        style={{ ...fieldStyle, fontSize: 15, textAlign: 'left', padding: '10px 12px' }}
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
        placeholder="한마디 (Enter로 보냅니다)"
        maxLength={MAX_TEXT}
        aria-label="채팅 입력"
        onKeyDown={(event) => {
          if (event.key !== 'Enter') {
            return
          }
          /*
           * 칸에 글자가 있으면 준비가 아니라 보내기다. 여기서 막지 않으면 적어둔 말이
           * 사라지고 판이 시작된다 — 되돌릴 길이 없는 쪽을 먼저 막는다.
           */
          if (text.trim().length > 0) {
            event.stopPropagation()
            send()
          }
        }}
      />
    </div>
  )
}

/**
 * 줄에 서서 상대를 기다리는 동안.
 *
 * **숫자를 보여주는 것이 이 화면의 일이다.** 돌아가는 표시만 두면 기다리는 사람은
 * 고장난 것과 구분할 수 없고, 언제까지 기다려야 하는지도 모른다. 몇 명이 줄에 서
 * 있는지, 얼마나 기다렸는지, 지금 어디까지 찾고 있는지를 함께 알린다 — 특히 마지막
 * 것은 "기다리면 넓어진다"는 규칙이 실제로 움직이고 있다는 증거다.
 */

/**
 * 그 사람의 티어.
 *
 * **아직 못 받았으면 아무것도 두지 않는다.** "브론즈"를 미리 깔아두면 서버에 닿기
 * 전까지 모두가 브론즈로 보이고, 그 짧은 순간이 곧 잘못된 정보다. 자리만 비워두면
 * 값이 들어올 때 조용히 채워진다.
 */
function TierBadge({ rating }: { rating: number | undefined }) {
  if (rating === undefined) {
    return null
  }
  const tier = tierOf(rating)
  return (
    <span
      data-tier-badge={tier.name}
      style={{
        fontSize: 12,
        fontWeight: 700,
        color: tier.color,
        border: `1px solid ${tier.color}`,
        borderRadius: 999,
        padding: '2px 8px',
        whiteSpace: 'nowrap',
      }}
    >
      {tier.name} {Math.round(rating)}
    </span>
  )
}

/**
 * 준비 화면에서 주고받는 말.
 *
 * 판이 도는 동안에는 이름표 위 말풍선으로 뜨지만 여기서는 **목록으로 쌓는다** —
 * 시작을 기다리는 자리라 시선을 뺏길 것이 없고, 오간 말을 한 번에 훑는 편이 낫다.
 *
 * Enter만으로 보낸다. 이 화면에서 Enter는 준비를 뜻하기도 하는데, 칸에 글자가 있을
 * 때는 말이 먼저다 — 적어둔 것을 버리고 판이 시작되면 되돌릴 길이 없다.
 */

export { ReadyRoom }
