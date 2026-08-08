import { useEffect, useRef, useState } from 'react'
import { play } from '../components/animate.ts'
import { MenuButton } from '../components/MenuButton.tsx'
import { NameScreen } from './NameScreen.tsx'
import { loadProfile } from '../storage/profile.ts'
import { useStartAlert } from '../hooks/useStartAlert.ts'
import { useMenuKeys } from '../hooks/useMenuKeys.ts'
import type { CSSProperties } from 'react'
import { ROOM_CODE_LENGTH, isRoomCode } from '../multi/protocol.ts'
import { ownerColorAt } from '../multi/ownerColors.ts'
import type { SessionPhase } from '../multi/MatchSession.ts'
import type { JoinRequest } from '../hooks/useMatchSession.ts'

interface LobbyScreenProps {
  phase: SessionPhase | null
  onOpen: (request: JoinRequest) => void
  onReady: () => void
  onBack: () => void
}

const rootStyle: CSSProperties = {
  height: '100%',
  display: 'grid',
  placeItems: 'center',
  padding: 24,
}

const panelStyle: CSSProperties = {
  width: 'min(440px, 90vw)',
  display: 'grid',
  gap: 18,
  textAlign: 'center',
}

const fieldStyle: CSSProperties = {
  width: '100%',
  font: '600 20px/1.3 var(--sans)',
  color: '#f2f4fb',
  background: '#0d0f16',
  border: '1px solid #2e3448',
  borderRadius: 10,
  padding: '12px 14px',
  outline: 'none',
  textAlign: 'center',
}

const buttonStyle: CSSProperties = {
  padding: '13px 20px',
  fontSize: 16,
  fontWeight: 600,
  borderRadius: 10,
  border: '1px solid #48507a',
  background: '#ffcf5c',
  color: '#1a1405',
}

/**
 * 방을 여는 길과 들어가는 길 — 좌우로 나란히.
 *
 * 한 길을 한 덩어리로 감싸지 않고 **줄 단위로 채운다**(라벨·라벨 / 빈칸·코드칸 /
 * 버튼·버튼). 덩어리로 감싸면 한쪽에만 있는 코드 칸 때문에 두 길의 라벨과 버튼
 * 높이가 어긋난다 — 나란히 놓은 이유가 사라진다.
 */
const pathsStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '8px 14px',
  alignItems: 'end',
}

const pathLabelStyle: CSSProperties = {
  fontSize: 12,
  color: '#6a7290',
  letterSpacing: '0.06em',
}

/** 이름 칸을 버튼 무리에서 떼어놓는 판 */
const nameFieldStyle: CSSProperties = {
  display: 'grid',
  gap: 8,
  padding: '14px 16px 16px',
  margin: '6px 0 10px',
  borderRadius: 14,
  background: 'rgba(255, 255, 255, 0.025)',
  border: '1px solid #232839',
  textAlign: 'left',
}

const ghostButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: 'transparent',
  color: '#b6bdd4',
}

function LobbyScreen({ phase, onOpen, onReady, onBack }: LobbyScreenProps) {
  /*
   * 이름은 이 화면의 것이 아니라 **기기의 것**이다.
   *
   * 예전에는 여기 자유 입력 칸이 있었고 그 값은 어디에도 저장되지 않았다. 그래서
   * 들어올 때마다 새로 지어야 했고, 무엇보다 그 이름이 그대로 상대 화면에 뜨는데도
   * 아무 검사가 없었다. 지금은 골라둔 이름을 그대로 쓴다.
   */
  const [nickname, setNickname] = useState(() => loadProfile().name)
  const [naming, setNaming] = useState(false)
  const [code, setCode] = useState('')

  const trimmedCode = code.trim().toLowerCase()
  const codeReady = isRoomCode(trimmedCode)

  const host = () => onOpen({ mode: { kind: 'host' }, nickname })
  const join = () => {
    if (codeReady) {
      onOpen({ mode: { kind: 'join', code: trimmedCode }, nickname })
    }
  }
  /*
   * 고를 수 있는 것을 화면에 놓인 순서 그대로 적는다. 이름이 맨 위인 이유는
   * 화면에서도 맨 위이기 때문이다 — ↑↓로 훑는 순서가 눈으로 훑는 순서와 어긋나면
   * 무엇이 골라졌는지 매번 다시 찾아야 한다.
   */
  const items = [
    { run: () => setNaming(true), disabled: false },
    { run: host, disabled: false },
    { run: join, disabled: !codeReady },
    { run: onBack, disabled: false },
  ]

  /*
   * Tab은 가로채지 않는다. 이 화면에는 이름 칸과 방 코드 칸이 있어서,
   * Tab을 메뉴가 먹으면 입력칸으로 갈 길이 막힌다.
   */
  const menu = useMenuKeys({
    count: items.length,
    useTab: false,
    // 여기 온 사람이 하려는 것은 방을 여는 것이다. 이름은 이미 골라둔 값이라 건드릴 일이 드물다
    initialIndex: 1,
    // 이름 화면이 열려 있는 동안에는 그쪽이 키를 갖는다
    active: !naming,
    onActivate: (index) => {
      const item = items[index]
      if (item !== undefined && !item.disabled) {
        item.run()
      }
    },
    onCancel: onBack,
  })

  if (naming) {
    return <NameScreen onBack={() => setNaming(false)} onChange={setNickname} />
  }

  if (phase?.kind === 'connecting') {
    return <Notice title="연결 중…" detail="중개 서버를 거쳐 상대를 찾는다" onBack={onBack} />
  }

  /*
   * 붙은 뒤와 붙기 전을 다르게 보여준다.
   * 멈췄을 때 어느 쪽에서 멈춘 것인지가 이 문장 하나로 갈린다 — "연결 중"에서 멈추면
   * 경로가 안 열린 것이고, 여기서 멈추면 상대가 응답하지 않는 것이다.
   */
  if (phase?.kind === 'handshaking') {
    return <Notice title="방에 붙었다" detail="명단을 기다린다…" onBack={onBack} />
  }

  if (phase?.kind === 'waiting') {
    return <WaitingRoom roomCode={phase.roomCode} onBack={onBack} />
  }

  if (phase?.kind === 'countdown') {
    return <Countdown phase={phase} />
  }

  if (phase?.kind === 'ready') {
    return <ReadyRoom phase={phase} onReady={onReady} onBack={onBack} />
  }

  if (phase?.kind === 'failed') {
    return (
      <Notice
        title="연결하지 못했다"
        detail={phase.failure.message}
        onBack={onBack}
        danger
      />
    )
  }

  return (
    <div style={rootStyle}>
      <div style={panelStyle}>
        <h1 style={{ font: '700 32px/1.2 var(--sans)', color: '#f2f4fb', margin: 0 }}>
          함께 하기
        </h1>
        {/*
          규칙은 시작 화면에서 '함께 하기'를 고르면 옆 판에 뜬다. 여기까지 온 사람은
          이미 읽었고, 지금 할 일은 방을 열거나 코드를 넣는 것뿐이다 —
          그 앞에 규칙을 또 세우면 해야 할 일이 뒤로 밀린다.
        */}

        {/*
          * 내 이름 — 상대에게 이렇게 보인다.
          *
          * 버튼들과 같은 간격으로 세워두면 이것도 누르는 것처럼 읽힌다. 이름은 **고르는
          * 값**이지 행동이 아니므로, 옅은 판에 얹고 아래위로 떼어 무리에서 빼둔다.
          */}
        <div style={nameFieldStyle}>
          <span style={{ fontSize: 12, color: '#8b93b0', letterSpacing: '0.06em' }}>
            내 이름
          </span>
          <div style={{ ...fieldStyle, borderColor: '#3a4160' }}>{nickname}</div>
          <MenuButton
            selected={menu.index === 0}
            onClick={() => setNaming(true)}
            onHover={() => menu.select(0)}
            style={{ padding: '9px 20px', fontSize: 14 }}
          >
            바꾸기
          </MenuButton>
        </div>

        {/*
          * 방을 여는 길과 들어가는 길을 좌우로 나눈다. 세로로 쌓아두면 코드 칸이
          * "방 만들기에 딸린 것"처럼 읽혀서, 코드를 받은 사람이 어디를 봐야 할지 헤맨다.
          * 버튼은 아래로 붙여 두 길의 끝을 같은 높이에 둔다.
          */}
        <div style={pathsStyle}>
          {/* 1행 — 두 길의 이름 */}
          <span style={pathLabelStyle}>새로 연다 (코드를 만든다)</span>
          <span style={pathLabelStyle}>코드를 받았다면</span>

          {/* 2행 — 코드 칸. 왼쪽은 적을 것이 없어 비운다 */}
          <span />
          <input
            style={fieldStyle}
            value={code}
            onChange={(event) => setCode(event.currentTarget.value)}
            placeholder={`방 코드 ${ROOM_CODE_LENGTH}자`}
            maxLength={ROOM_CODE_LENGTH}
            spellCheck={false}
            autoCapitalize="off"
            aria-label="방 코드"
            onKeyDown={(event) => {
              if (event.key === 'Enter') join()
            }}
          />

          {/* 3행 — 두 길의 끝 */}
          <MenuButton
            selected={menu.index === 1}
            onClick={host}
            onHover={() => menu.select(1)}
          >
            방 만들기
          </MenuButton>
          <MenuButton
            selected={menu.index === 2}
            onClick={join}
            onHover={() => menu.select(2)}
            disabled={!codeReady}
          >
            코드로 참가
          </MenuButton>
        </div>

        <MenuButton
          selected={menu.index === 3}
          onClick={onBack}
          onHover={() => menu.select(3)}
        >
          돌아가기 (Esc)
        </MenuButton>
        <span style={{ fontSize: 12, color: '#4a5171', textAlign: 'center' }}>
          ↑↓로 고르고 Enter로 들어간다
        </span>
      </div>
    </div>
  )
}

/**
 * 붙은 뒤 시작 전.
 *
 * 상대가 들어오자마자 판이 열리면 누구와 붙는지 볼 겨를도, 손을 키보드에 올릴 겨를도
 * 없다 — 첫 단어가 이미 내려오고 있다. 양쪽이 준비를 눌러야 시작한다.
 */
function ReadyRoom({
  phase,
  onReady,
  onBack,
}: {
  phase: Extract<SessionPhase, { kind: 'ready' }>
  onReady: () => void
  onBack: () => void
}) {
  const ready = new Set(phase.ready)
  const iAmReady = ready.has(phase.selfId)
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
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    background: ownerColorAt(index),
                  }}
                />
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
                <span style={{ fontSize: 14, color: isReady ? '#6bffb0' : '#6a7290' }}>
                  {isReady ? '준비됨' : '기다리는 중…'}
                </span>
              </div>
            )
          })}
        </div>

        {/* 규칙 설명은 바로 앞 화면에서 이미 읽었다. 여기서 볼 것은 상대와 준비 상태뿐이다 */}
        <MenuButton selected={!iAmReady} onClick={onReady} disabled={iAmReady} primary>
          {iAmReady ? `상대를 기다린다… (${waitingFor}명)` : '준비 (Enter)'}
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
function Countdown({ phase }: { phase: Extract<SessionPhase, { kind: 'countdown' }> }) {
  const ref = useRef<HTMLDivElement | null>(null)

  // 탭을 보고 있지 않으면 소리와 제목으로 부른다 — 첫 차례를 그대로 날리게 된다
  useStartAlert(true)

  useEffect(() => {
    // 숫자가 바뀔 때마다 한 번 크게 튄다. 초 단위라 움직임이 없으면 멈춘 것처럼 보인다
    play(
      ref.current,
      [
        { transform: 'scale(1.4)', opacity: 0.2 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      { duration: 380, easing: 'ease-out' },
    )
  }, [phase.secondsLeft])

  return (
    <div style={rootStyle}>
      <div style={{ ...panelStyle, gap: 10 }} data-countdown={phase.secondsLeft}>
        <p style={{ color: '#6a7290', margin: 0, fontSize: 13, letterSpacing: '0.08em' }}>
          곧 시작한다. 손을 올리자
        </p>
        <div
          ref={ref}
          style={{
            font: '700 96px/1 var(--sans)',
            color: '#ffcf5c',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {phase.secondsLeft}
        </div>
        <p style={{ color: '#4a5171', margin: 0, fontSize: 13 }}>
          {phase.players.map((player) => player.nickname).join(' · ')}
        </p>
      </div>
    </div>
  )
}

function WaitingRoom({ roomCode, onBack }: { roomCode: string; onBack: () => void }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    void navigator.clipboard?.writeText(roomCode).then(
      () => setCopied(true),
      () => setCopied(false),
    )
  }

  return (
    <div style={rootStyle}>
      <div style={panelStyle}>
        <p style={{ color: '#6a7290', margin: 0, fontSize: 13, letterSpacing: '0.08em' }}>
          이 코드를 같이 할 사람들에게 알려주자
        </p>
        <div
          data-room-code={roomCode}
          style={{
            font: '700 40px/1.2 var(--mono)',
            letterSpacing: '0.14em',
            color: '#ffcf5c',
            background: '#0d0f16',
            border: '1px solid #2e3448',
            borderRadius: 12,
            padding: '18px 12px',
            userSelect: 'all',
          }}
        >
          {roomCode}
        </div>
        <button type="button" style={buttonStyle} onClick={copy}>
          {copied ? '복사했다' : '코드 복사'}
        </button>
        <p style={{ color: '#b6bdd4', margin: 0, fontSize: 14 }}>
          한 명이라도 들어오면 준비 화면으로 넘어간다. 더 기다렸다 시작해도 된다
        </p>
        <button type="button" style={ghostButtonStyle} onClick={onBack}>
          취소
        </button>
      </div>
    </div>
  )
}

function Notice({
  title,
  detail,
  onBack,
  danger = false,
}: {
  title: string
  detail: string
  onBack: () => void
  danger?: boolean
}) {
  return (
    <div style={rootStyle}>
      <div style={panelStyle}>
        <h2
          style={{
            font: '700 26px/1.3 var(--sans)',
            color: danger ? '#ff6b6b' : '#f2f4fb',
            margin: 0,
          }}
        >
          {title}
        </h2>
        <p style={{ color: '#b6bdd4', margin: 0, fontSize: 15, lineHeight: 1.7 }}>{detail}</p>
        <button type="button" style={ghostButtonStyle} onClick={onBack}>
          돌아가기
        </button>
      </div>
    </div>
  )
}

export { LobbyScreen }
