import { useState } from 'react'
import { WORDS } from '../game/data/words.ts'
import { MenuButton } from '../components/MenuButton.tsx'
import { useMenuKeys } from '../hooks/useMenuKeys.ts'
import type { CSSProperties } from 'react'
import { NICKNAME_MAX, ROOM_CODE_LENGTH, isRoomCode } from '../multi/protocol.ts'
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

const ghostButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: 'transparent',
  color: '#b6bdd4',
}

/**
 * 이름을 비워두면 둘 다 '이름없음'이 되어 누가 누구인지 알 수 없다.
 * 게임에 나오는 단어 하나를 미리 넣어두면 그대로 시작해도 서로 구분된다 —
 * 이름을 짓는 것이 대전에 들어가는 문턱이 되면 안 된다.
 */
function suggestName(): string {
  const index = Math.floor(Math.random() * WORDS.length)
  return WORDS[index]?.word ?? ''
}

function LobbyScreen({ phase, onOpen, onReady, onBack }: LobbyScreenProps) {
  // 한 번만 뽑는다 — 리렌더마다 이름이 바뀌면 고칠 수가 없다
  const [nickname, setNickname] = useState(suggestName)
  const [code, setCode] = useState('')

  const trimmedCode = code.trim().toLowerCase()
  const codeReady = isRoomCode(trimmedCode)

  const host = () => onOpen({ mode: { kind: 'host' }, nickname })
  const join = () => {
    if (codeReady) {
      onOpen({ mode: { kind: 'join', code: trimmedCode }, nickname })
    }
  }
  const actions = [
    { label: '방 만들기', run: host, primary: true, disabled: false },
    { label: '코드로 참가', run: join, primary: false, disabled: !codeReady },
  ]

  /*
   * Tab은 가로채지 않는다. 이 화면에는 이름 칸과 방 코드 칸이 있어서,
   * Tab을 메뉴가 먹으면 입력칸으로 갈 길이 막힌다.
   */
  const menu = useMenuKeys({
    count: actions.length + 1,
    useTab: false,
    onActivate: (index) => {
      if (index === actions.length) {
        onBack()
        return
      }
      const action = actions[index]
      if (action !== undefined && !action.disabled) {
        action.run()
      }
    },
    onCancel: onBack,
  })

  if (phase?.kind === 'connecting') {
    return <Notice title="연결 중…" detail="중개 서버를 거쳐 상대를 찾는다" onBack={onBack} />
  }

  /*
   * 붙은 뒤와 붙기 전을 다르게 보여준다.
   * 멈췄을 때 어느 쪽에서 멈춘 것인지가 이 문장 하나로 갈린다 — "연결 중"에서 멈추면
   * 경로가 안 열린 것이고, 여기서 멈추면 상대가 응답하지 않는 것이다.
   */
  if (phase?.kind === 'handshaking') {
    return <Notice title="상대와 붙었다" detail="시작 신호를 기다린다…" onBack={onBack} />
  }

  if (phase?.kind === 'waiting') {
    return <WaitingRoom roomCode={phase.roomCode} onBack={onBack} />
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
          1대1 대전
        </h1>
        <p style={{ color: '#6a7290', margin: 0, fontSize: 14, lineHeight: 1.8 }}>
          받침대 하나를 함께 쓴다. 번갈아 쌓고, <strong style={{ color: '#b6bdd4' }}>내가 쌓은 물건이 떨어지면 내 목숨</strong>이 깎인다.
          <br />
          상대 차례에 단어를 치면 그 단어를 지목할 수 있다.
        </p>

        {/* 내 이름 — 비워두면 둘 다 '이름없음'이 되어 누가 누구인지 알 수 없다 */}
        <div style={{ display: 'grid', gap: 6 }}>
          <label
            htmlFor="nickname"
            style={{ fontSize: 12, color: '#8b93b0', letterSpacing: '0.06em' }}
          >
            내 이름
          </label>
          <input
            id="nickname"
            style={{
              ...fieldStyle,
              borderColor: nickname.trim().length === 0 ? '#5a4a2a' : '#3a4160',
            }}
            value={nickname}
            onChange={(event) => setNickname(event.currentTarget.value)}
            placeholder="상대에게 이렇게 보인다"
            maxLength={NICKNAME_MAX}
            autoFocus
            onKeyDown={(event) => {
              // 이름을 치고 Enter를 누르면 방을 만든다 — 손을 떼지 않아도 된다
              if (event.key === 'Enter') host()
            }}
          />
          {nickname.trim().length === 0 && (
            <span style={{ fontSize: 12, color: '#8a7a4a' }}>
              비워두면 <strong>이름없음</strong>으로 들어간다 — 둘 다 같은 이름이 된다.
            </span>
          )}
        </div>

        <MenuButton
          selected={menu.index === 0}
          onClick={host}
          onHover={() => menu.select(0)}
          primary
        >
          방 만들기
        </MenuButton>

        <div style={{ display: 'grid', gap: 8 }}>
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
          <MenuButton
            selected={menu.index === 1}
            onClick={join}
            onHover={() => menu.select(1)}
            disabled={!codeReady}
          >
            코드로 참가
          </MenuButton>
        </div>

        <p style={{ margin: 0, fontSize: 12, color: '#4a5171', lineHeight: 1.7 }}>
          연결은 중계 서버를 거친다. 서로에게 IP가 보이지 않고, 오가는 것은{' '}
          <strong style={{ color: '#6a7290' }}>닉네임과 게임 조작</strong>뿐이다.
        </p>

        <MenuButton
          selected={menu.index === 2}
          onClick={onBack}
          onHover={() => menu.select(2)}
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
          상대를 찾았다
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

        <p style={{ color: '#6a7290', margin: 0, fontSize: 13, lineHeight: 1.7 }}>
          받침대 하나를 함께 쓴다. 번갈아 쌓고,{' '}
          <strong style={{ color: '#b6bdd4' }}>내가 쌓은 물건이 떨어지면 내 목숨</strong>이 깎인다.
        </p>

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
          이 코드를 상대에게 알려주자
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
        <p style={{ color: '#b6bdd4', margin: 0, fontSize: 14 }}>상대가 들어오면 바로 시작한다…</p>
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
