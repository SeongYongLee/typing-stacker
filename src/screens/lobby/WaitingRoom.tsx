import { useState } from 'react'
import { buttonStyle, ghostButtonStyle, panelStyle, rootStyle } from './lobbyStyle.ts'
import { Blurb } from '../../components/SidePanel.tsx'
import { panelBoxStyle } from '../../components/sidePanelStyle.ts'
import { ACTIVE_MATCH_MODE, type MatchModeChoice } from '../../multi/matchModes.ts'
import { MODE_BLURBS, modeLabel } from './modeRules.tsx'

/** 친선전에서 방을 연 뒤 — 코드를 알려주고 기다린다 */
function WaitingRoom({
  roomCode,
  onBack,
}: {
  roomCode: string
  matchModeChoice?: MatchModeChoice
  onBack: () => void
}) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    void navigator.clipboard?.writeText(roomCode).then(
      () => setCopied(true),
      () => setCopied(false),
    )
  }

  return (
    <div style={rootStyle}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 440px) minmax(300px, 420px)',
          gap: 20,
          alignItems: 'start',
        }}
      >
        <div style={panelStyle}>
          <p style={{ color: '#6a7290', margin: 0, fontSize: 13, letterSpacing: '0.08em' }}>
            이 코드를 같이 할 사람들에게 알려주세요
          </p>
          <div
            data-room-code={roomCode}
            style={{
              font: '700 40px/1.2 var(--mono)',
              letterSpacing: '0.14em',
              color: '#e4e68a',
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
            {copied ? '복사했습니다' : '코드 복사'}
          </button>
          <p
            data-fixed-match-mode="duel"
            style={{ color: '#f2f4fb', margin: 0, fontSize: 17, fontWeight: 700 }}
          >
            모드 · {modeLabel(ACTIVE_MATCH_MODE)}
          </p>
          <p style={{ color: '#b6bdd4', margin: 0, fontSize: 14 }}>
            한 명이라도 들어오면 준비 화면으로 넘어갑니다. 더 기다렸다 시작해도 됩니다
          </p>
          <button type="button" style={ghostButtonStyle} onClick={onBack}>
            취소
          </button>
        </div>
        <aside style={{ ...panelBoxStyle, width: '100%' }} aria-label="게임 설명">
          <Blurb
            kind={`waiting-${ACTIVE_MATCH_MODE}`}
            lines={MODE_BLURBS[ACTIVE_MATCH_MODE]}
            fontSize={17}
          />
        </aside>
      </div>
    </div>
  )
}

export { WaitingRoom }
