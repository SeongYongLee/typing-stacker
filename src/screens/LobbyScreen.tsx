import { useState } from 'react'
import type { CSSProperties } from 'react'
import { NICKNAME_MAX, ROOM_CODE_LENGTH, isRoomCode } from '../multi/protocol.ts'
import type { SessionPhase } from '../multi/MatchSession.ts'
import type { JoinRequest } from '../hooks/useMatchSession.ts'

interface LobbyScreenProps {
  phase: SessionPhase | null
  onOpen: (request: JoinRequest) => void
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

function LobbyScreen({ phase, onOpen, onBack }: LobbyScreenProps) {
  const [nickname, setNickname] = useState('')
  const [code, setCode] = useState('')

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

  const trimmedCode = code.trim().toLowerCase()
  const codeReady = isRoomCode(trimmedCode)

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
          />
          {nickname.trim().length === 0 && (
            <span style={{ fontSize: 12, color: '#8a7a4a' }}>
              비워두면 <strong>이름없음</strong>으로 들어간다 — 둘 다 같은 이름이 된다.
            </span>
          )}
        </div>

        <button
          type="button"
          style={buttonStyle}
          onClick={() => onOpen({ mode: { kind: 'host' }, nickname })}
        >
          방 만들기
        </button>

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
          />
          <button
            type="button"
            style={{ ...buttonStyle, opacity: codeReady ? 1 : 0.45 }}
            disabled={!codeReady}
            onClick={() =>
              onOpen({ mode: { kind: 'join', code: trimmedCode }, nickname })
            }
          >
            코드로 참가
          </button>
        </div>

        <p style={{ margin: 0, fontSize: 12, color: '#4a5171', lineHeight: 1.7 }}>
          연결은 중계 서버를 거친다. 서로에게 IP가 보이지 않고, 오가는 것은{' '}
          <strong style={{ color: '#6a7290' }}>닉네임과 게임 조작</strong>뿐이다.
        </p>

        <button type="button" style={ghostButtonStyle} onClick={onBack}>
          돌아가기
        </button>
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
