import type { CSSProperties } from 'react'
import { useLoopbackMatch, type LoopbackSide } from '../hooks/useLoopbackMatch.ts'
import { MatchScreen } from './MatchScreen.tsx'

interface LoopbackScreenProps {
  onBack: () => void
}

const rootStyle: CSSProperties = {
  display: 'grid',
  gridTemplateRows: 'auto 1fr',
  height: '100%',
}

const bannerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 16,
  padding: '6px 12px',
  background: '#3a2a12',
  color: '#ffcf5c',
  fontSize: 12,
  letterSpacing: '0.06em',
}

const splitStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  minHeight: 0,
}

const paneStyle: CSSProperties = {
  position: 'relative',
  minWidth: 0,
  minHeight: 0,
  borderRight: '1px solid #262b3d',
  overflow: 'hidden',
}

/**
 * 개발용. 한 화면에서 방장과 참가자를 나란히 돌린다 — 전송로만 루프백이고
 * 나머지는 실제 대전과 같은 코드다. 치려는 쪽을 클릭해 포커스를 옮기고 입력한다.
 */
function LoopbackScreen({ onBack }: LoopbackScreenProps) {
  const { host, guest } = useLoopbackMatch()

  return (
    <div style={rootStyle}>
      <div style={bannerStyle}>
        <span>루프백 (개발용). 네트워크를 쓰지 않는다. 칠 쪽을 클릭한 뒤 입력한다</span>
        <button
          type="button"
          onClick={onBack}
          style={{
            padding: '2px 10px',
            fontSize: 12,
            borderRadius: 6,
            border: '1px solid #6a5320',
            background: 'transparent',
            color: '#ffcf5c',
          }}
        >
          나가기
        </button>
      </div>
      <div style={splitStyle}>
        <Pane label="방장" side={host} onBack={onBack} />
        <Pane label="참가자" side={guest} onBack={onBack} />
      </div>
    </div>
  )
}

function Pane({
  label,
  side,
  onBack,
}: {
  label: string
  side: LoopbackSide
  onBack: () => void
}) {
  const ready = side.phase?.kind === 'playing' && side.state !== null

  return (
    <div style={paneStyle} data-loopback-pane={label}>
      {ready ? (
        <MatchScreen engine={side.phase.engine} state={side.state} onLeave={onBack} />
      ) : (
        <div style={{ display: 'grid', placeItems: 'center', height: '100%', gap: 8 }}>
          <span style={{ color: '#6a7290', fontSize: 14 }}>
            {label} · {describe(side)}
          </span>
        </div>
      )}
    </div>
  )
}

function describe(side: LoopbackSide): string {
  const phase = side.phase
  if (phase === null) {
    return '준비 중'
  }
  switch (phase.kind) {
    case 'connecting':
      return '연결 중'
    case 'handshaking':
      return '붙었다. 시작 신호를 기다리는 중'
    case 'waiting':
      return '상대를 기다리는 중'
    case 'ready':
      return `준비 확인 중 (${phase.ready.length}/${phase.players.length})`
    case 'playing':
      return '시작됨'
    case 'failed':
      return `실패했다. ${phase.failure.message}`
  }
}

export { LoopbackScreen }
