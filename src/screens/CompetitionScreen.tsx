import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Avatar } from '../components/Avatar.tsx'
import { ArenaBackdrop } from '../components/ArenaBackdrop.tsx'
import { MemoInput } from '../components/InputBar.tsx'
import { MenuButton } from '../components/MenuButton.tsx'
import { StackArena } from '../components/StackArena.tsx'
import { TypingLane } from '../components/TypingLane.tsx'
import type { CompetitionEngine, CompetitionViewState } from '../competition/CompetitionEngine.ts'
import { useHangulInput } from '../hooks/useHangulInput.ts'
import { useMenuKeys } from '../hooks/useMenuKeys.ts'
import { ownerColorAt } from '../multi/ownerColors.ts'

const rootStyle: CSSProperties = {
  position: 'relative',
  display: 'grid',
  gridTemplateRows: 'auto 1fr auto',
  height: '100%',
}

const fieldStyle: CSSProperties = {
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 340px) minmax(320px, 480px) minmax(0, 340px)',
  justifyContent: 'center',
  gap: 16,
  width: '100%',
  maxWidth: 1200,
  height: '100%',
  margin: '0 auto',
  padding: '16px 20px 0',
  minHeight: 0,
}

function CompetitionScreen({
  engine,
  state,
  onLeave,
}: {
  engine: CompetitionEngine
  state: CompetitionViewState
  onLeave: () => void
}) {
  const submit = useCallback((text: string) => engine.submit(text), [engine])
  const input = useHangulInput(submit)
  const [nightfall] = useState<0 | 1>(0)
  const misses = new Map(state.misses).get(state.selfId) ?? 0

  useEffect(() => {
    if (state.phase === 'over') input.ref.current?.blur()
  }, [state.phase, input.ref])

  return (
    <div style={rootStyle} onMouseDown={input.keepFocus}>
      <ArenaBackdrop mode="match" nightfall={nightfall} />
      <CompetitionScoreboard state={state} onLeave={onLeave} />

      <div style={{ position: 'relative', minHeight: 0 }}>
        <StackArena engine={engine} />
        <div style={fieldStyle}>
          <TypingLane words={state.words} side="left" missSeq={misses} />
          <div
            style={{ position: 'relative', minHeight: 0 }}
            data-aim={state.aimNormalized.toFixed(3)}
            data-competition-state={state.phase}
          >
            {state.connectionLost && state.phase !== 'over' && (
              <Banner text="방장과의 연결이 끊겨 경쟁을 이어갈 수 없습니다" />
            )}
            {state.phase === 'over' && <CompetitionVerdict state={state} onLeave={onLeave} />}
          </div>
          <TypingLane words={state.words} side="right" missSeq={misses} />
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          justifyItems: 'center',
          gap: 7,
          padding: '14px 20px',
          background:
            'linear-gradient(to bottom, rgba(13, 15, 22, 0) 0%, rgba(13, 15, 22, 0.58) 42%, rgba(13, 15, 22, 0.88) 100%)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {state.phase === 'playing' ? (
          <MemoInput
            input={input}
            nightfall={nightfall}
            ariaLabel="경쟁 단어 입력"
            width="min(420px, 60vw)"
            invalidSeq={state.feedback !== null && !state.feedback.ok ? state.feedback.seq : null}
          />
        ) : (
          <span style={{ height: 38, color: '#6a7290', fontSize: 15 }}>경쟁이 끝났습니다</span>
        )}
        <span style={{ height: 22, color: '#b6bdd4', fontSize: 14 }}>
          {state.feedback === null
            ? '내 화면의 단어를 입력하세요 · 놓치면 하트가 줄어듭니다'
            : state.feedback.ok
              ? `${state.feedback.itemLabel ?? '물건'}을 떨어뜨렸습니다`
              : `${state.feedback.text} — 맞는 단어가 아닙니다`}
        </span>
      </div>
    </div>
  )
}

function CompetitionScoreboard({
  state,
  onLeave,
}: {
  state: CompetitionViewState
  onLeave: () => void
}) {
  const lives = new Map(state.lives)
  const misses = new Map(state.misses)
  const crowded = state.players.length > 4
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: crowded ? 'flex-start' : 'center',
        alignItems: 'center',
        gap: crowded ? 8 : 18,
        padding: crowded ? '8px 78px 8px 12px' : '10px 82px 10px 20px',
        borderBottom: '1px solid #262b3d',
        background: '#151824',
        position: 'relative',
        zIndex: 5,
      }}
    >
      {state.players.map((player, index) => {
        const left = lives.get(player.id) ?? 0
        const mine = player.id === state.selfId
        return (
          <div
            key={player.id}
            data-competition-player={player.id}
            data-lives={left}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: crowded ? 5 : 8,
              minWidth: 0,
              opacity: left > 0 ? 1 : 0.42,
              padding: crowded ? '4px 7px' : '5px 10px',
              borderRadius: 999,
              border: `1px solid ${mine ? '#e4e68a' : 'transparent'}`,
            }}
          >
            <Avatar icon={player.icon} size={crowded ? 18 : 22} ring={ownerColorAt(index)} />
            <span
              style={{
                maxWidth: crowded ? 64 : 112,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: '#f2f4fb',
                fontSize: crowded ? 12 : 14,
                fontWeight: mine ? 700 : 500,
              }}
            >
              {player.nickname}{mine && !crowded ? ' (나)' : ''}
            </span>
            <CompactHearts lives={left} />
            {(misses.get(player.id) ?? 0) > 0 && !crowded && (
              <span style={{ color: '#ff9b8f', fontSize: 11 }}>놓침 {misses.get(player.id)}</span>
            )}
          </div>
        )
      })}
      <button
        type="button"
        onClick={onLeave}
        style={{
          position: 'absolute',
          right: 16,
          top: '50%',
          transform: 'translateY(-50%)',
          border: '1px solid #2e3448',
          borderRadius: 8,
          background: 'transparent',
          color: '#8b93ad',
          padding: '6px 10px',
        }}
      >
        나가기
      </button>
    </div>
  )
}

function CompactHearts({ lives }: { lives: number }) {
  return (
    <span aria-label={`하트 ${lives}개`} style={{ display: 'inline-flex', gap: 2, fontSize: 15 }}>
      {[0, 1, 2].map((slot) => (
        <span key={slot} style={{ color: slot < lives ? '#ff6b6b' : '#394057' }}>
          {slot < lives ? '♥' : '♡'}
        </span>
      ))}
    </span>
  )
}

function CompetitionVerdict({
  state,
  onLeave,
}: {
  state: CompetitionViewState
  onLeave: () => void
}) {
  useMenuKeys({ count: 1, onActivate: onLeave, onCancel: onLeave })
  const won = state.winner === state.selfId
  const winner = state.players.find((player) => player.id === state.winner)?.nickname ?? null
  const capacity = state.endReason === 'capacity'
  return (
    <div
      style={{
        position: 'absolute',
        inset: '15% 0 auto',
        zIndex: 4,
        display: 'grid',
        justifyItems: 'center',
        gap: 14,
        padding: '24px 18px',
        borderRadius: 16,
        background: 'rgba(13, 15, 22, 0.9)',
        border: '1px solid #2e3448',
      }}
    >
      <strong style={{ fontSize: 28, color: won ? '#e4e68a' : '#f2f4fb' }}>
        {capacity
          ? '공유 탑 물리 한도에 도달했습니다'
          : won
            ? '마지막까지 살아남았습니다'
            : winner === null
              ? '모두 탈락했습니다'
              : `${winner} 승리`}
      </strong>
      <span style={{ color: '#b6bdd4', fontSize: 14 }}>
        {capacity
          ? '128개 이상 장기전을 위한 동기화 방식은 다음 실험에서 검증합니다'
          : '단어 놓침과 물건 이탈 모두 하트를 잃습니다'}
      </span>
      <MenuButton selected onClick={onLeave} primary>시작 화면으로</MenuButton>
    </div>
  )
}

function Banner({ text }: { text: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '22%',
        left: 0,
        right: 0,
        textAlign: 'center',
        color: '#ff6b6b',
        fontSize: 18,
        fontWeight: 700,
      }}
    >
      {text}
    </div>
  )
}

export { CompetitionScreen }
