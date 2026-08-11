import { Countdown } from '../../components/Countdown.tsx'
import { ArenaBackdrop } from '../../components/ArenaBackdrop.tsx'
import { Avatar } from '../../components/Avatar.tsx'
import { LIVES } from '../../game/config.ts'
import { useStartAlert } from '../../hooks/useStartAlert.ts'
import type { SessionPhase } from '../../multi/MatchSession.ts'
import { ownerColorAt } from '../../multi/ownerColors.ts'
import type { PlayerId, PlayerInfo } from '../../multi/protocol.ts'
import type { TitleTheme } from '../titleTheme.ts'
import { DuelCountdownArena } from './DuelCountdownArena.tsx'

/** 모두 준비한 뒤 시작까지 세는 화면 */
/**
 * 시작까지 세는 화면.
 *
 * 준비를 누르는 순간 바로 시작하면 첫 단어가 이미 내려오고 있다 — 누른 사람은
 * 마우스에 손이 가 있고 키보드로 옮길 틈이 없다. 특히 마지막에 누른 사람이 아니면
 * 언제 열리는지 모른 채 당한다.
 *
 * 숫자를 크게 두는 이유는 시작 순간을 놓치지 않게 하기 위해서다. 대결은 예외로
 * 게임판 순서를 함께 보여준다. 시작 뒤 처음 찾을 정보가 자기 판의 위치이기 때문이다.
 */
function MatchCountdown({
  phase,
  theme,
}: {
  phase: Extract<SessionPhase, { kind: 'countdown' }>
  theme: TitleTheme
}) {
  // 탭을 보고 있지 않으면 소리와 제목으로 부른다 — 첫 차례를 그대로 날리게 된다
  useStartAlert(true)
  const starter = phase.players.find((player) => player.id === phase.starter)?.nickname ?? '누군가'
  const focus = phase.matchMode === 'duel' ? '동시 시작' : `${starter} 턴으로 시작`
  if (phase.matchMode !== 'duel') {
    return <Countdown secondsLeft={phase.secondsLeft} focus={focus} />
  }

  return (
    <div
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateRows: 'auto 1fr auto',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <ArenaBackdrop mode="match" nightfall={theme === 'night' ? 1 : 0} />
      <CountdownScoreboard players={phase.players} selfId={phase.selfId} />
      <div style={{ position: 'relative', minHeight: 0 }}>
        <DuelCountdownArena
          players={phase.players}
          selfId={phase.selfId}
          seed={phase.seed}
          nightfall={theme === 'night' ? 1 : 0}
        />
        <div
          style={{
            position: 'absolute',
            zIndex: 2,
            pointerEvents: 'none',
            top: 0,
            left: 0,
            right: 0,
            height: '44%',
          }}
        >
          <Countdown secondsLeft={phase.secondsLeft} />
        </div>
      </div>
      <CountdownInputRow />
    </div>
  )
}

function CountdownScoreboard({
  players,
  selfId,
}: {
  players: readonly PlayerInfo[]
  selfId: PlayerId
}) {
  const crowded = players.length > 4
  return (
    <div
      data-countdown-scoreboard
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: crowded ? 'flex-start' : 'center',
        gap: crowded ? 10 : 24,
        padding: crowded ? '8px 14px' : '12px 20px',
        borderBottom: '1px solid #262b3d',
        background: '#151824',
        position: 'relative',
        zIndex: 5,
      }}
    >
      {players.map((player, index) => {
        const mine = player.id === selfId
        return (
          <div
            key={player.id}
            data-countdown-player={mine ? 'self' : 'other'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: crowded ? 6 : 10,
              padding: crowded ? '4px 8px' : '6px 12px',
              border: mine ? '1px solid rgba(107, 255, 176, 0.78)' : '1px solid transparent',
              borderRadius: 999,
              minWidth: 0,
              opacity: mine ? 1 : 0.28,
              background: mine ? 'rgba(107, 255, 176, 0.08)' : 'transparent',
            }}
          >
            <Avatar icon={player.icon} size={crowded ? 18 : 24} ring={ownerColorAt(index)} />
            <span
              style={{
                maxWidth: crowded ? 72 : 160,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: '#f2f4fb',
                fontSize: crowded ? 13 : 15,
                fontWeight: mine ? 700 : 500,
              }}
            >
              {player.nickname}{mine && !crowded && ' (나)'}
            </span>
            <span
              style={{
                color: '#ff6b78',
                fontSize: 17,
                letterSpacing: '0.1em',
                whiteSpace: 'nowrap',
              }}
            >
              {'♥'.repeat(LIVES)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function CountdownInputRow() {
  return (
    <div
      aria-hidden
      data-countdown-input-row
      style={{
        display: 'grid',
        justifyItems: 'center',
        gap: 6,
        padding: '14px 20px',
        position: 'relative',
        zIndex: 1,
        background:
          'linear-gradient(to bottom, rgba(13, 15, 22, 0) 0%, rgba(13, 15, 22, 0.58) 42%, rgba(13, 15, 22, 0.88) 100%)',
      }}
    >
      <div
        style={{
          width: 'min(420px, 60vw)',
          height: 40,
          borderBottom: '2px solid rgba(90, 74, 46, 0.45)',
        }}
      />
      <span style={{ height: 17, fontSize: 14, color: '#6a7290' }}>곧 입력할 수 있습니다</span>
    </div>
  )
}

export { MatchCountdown }
