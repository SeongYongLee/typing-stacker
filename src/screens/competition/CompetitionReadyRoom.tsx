import { Avatar } from '../../components/Avatar.tsx'
import { MenuButton } from '../../components/MenuButton.tsx'
import { useMenuKeys } from '../../hooks/useMenuKeys.ts'
import { ownerColorAt } from '../../multi/ownerColors.ts'
import type { CompetitionSessionPhase } from '../../competition/CompetitionSession.ts'
import { panelStyle, rootStyle } from '../lobby/lobbyStyle.ts'

function CompetitionReadyRoom({
  phase,
  onReady,
  onBack,
}: {
  phase: Extract<CompetitionSessionPhase, { kind: 'ready' }>
  onReady: () => void
  onBack: () => void
}) {
  const ready = new Set(phase.ready)
  const mine = ready.has(phase.selfId)
  const waiting = phase.players.filter((player) => !ready.has(player.id)).length

  useMenuKeys({
    count: 1,
    useTab: false,
    onActivate: () => {
      if (!mine) onReady()
    },
    onCancel: onBack,
  })

  return (
    <div style={rootStyle}>
      <div style={panelStyle} data-competition-ready={ready.size}>
        <p style={{ color: '#6a7290', margin: 0, fontSize: 13, letterSpacing: '0.08em' }}>
          경쟁 모드 · 최대 6명
        </p>
        <div style={{ display: 'grid', gap: 10 }}>
          {phase.players.map((player, index) => {
            const isReady = ready.has(player.id)
            return (
              <div
                key={player.id}
                data-ready={isReady ? 'yes' : 'no'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '13px 15px',
                  borderRadius: 12,
                  background: '#0d0f16',
                  border: `1px solid ${isReady ? '#3f7a55' : '#2e3448'}`,
                }}
              >
                <Avatar icon={player.icon} size={26} ring={ownerColorAt(index)} />
                <span style={{ flex: 1, textAlign: 'left', color: '#f2f4fb', fontWeight: 600 }}>
                  {player.nickname}{player.id === phase.selfId ? ' (나)' : ''}
                </span>
                <span style={{ color: isReady ? '#6bffb0' : '#6a7290', fontSize: 13 }}>
                  {isReady ? '준비됨' : '기다리는 중…'}
                </span>
              </div>
            )
          })}
        </div>
        <p style={{ color: '#b6bdd4', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          각자 다른 단어를 계속 입력해 하나의 탑에 동시에 쌓습니다. 단어를 놓치거나
          내 물건이 떨어지면 하트를 잃고, 마지막 생존자가 이깁니다.
        </p>
        <MenuButton selected={!mine} onClick={onReady} disabled={mine} primary>
          {mine ? `상대를 기다립니다… (${waiting}명)` : '준비 (Enter)'}
        </MenuButton>
        <MenuButton selected={false} onClick={onBack}>나가기 (Esc)</MenuButton>
      </div>
    </div>
  )
}

export { CompetitionReadyRoom }
