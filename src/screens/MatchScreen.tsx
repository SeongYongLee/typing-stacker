import { useCallback, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { StackArena } from '../components/StackArena.tsx'
import { TypingLane } from '../components/TypingLane.tsx'
import { LIVES } from '../game/config.ts'
import type { MatchEngine, MatchViewState } from '../multi/MatchEngine.ts'
import { ownerColorAt } from '../multi/ownerColors.ts'
import { useHangulInput } from '../hooks/useHangulInput.ts'

interface MatchScreenProps {
  engine: MatchEngine
  state: MatchViewState
  onLeave: () => void
}

const rootStyle: CSSProperties = {
  display: 'grid',
  gridTemplateRows: 'auto 1fr auto',
  height: '100%',
}

const fieldLayerStyle: CSSProperties = { position: 'relative', minHeight: 0 }

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

function MatchScreen({ engine, state, onLeave }: MatchScreenProps) {
  const submit = useCallback((text: string) => engine.submit(text), [engine])
  const input = useHangulInput(submit)
  const { focus, clear } = input

  // 턴이 바뀔 때마다 입력칸을 비우고 포커스를 되돌린다 — 지목하던 글자가 남으면 헷갈린다
  useEffect(() => {
    clear()
    focus()
  }, [state.current, clear, focus])

  return (
    <div style={rootStyle} onPointerDown={focus}>
      <Scoreboard state={state} onLeave={onLeave} />

      <div style={fieldLayerStyle}>
        <StackArena engine={engine} />
        <div style={fieldStyle}>
          <TypingLane words={state.words} side="left" suggested={state.suggestion?.word ?? null} />
          <div
            style={{ position: 'relative', minHeight: 0 }}
            data-aim={state.aimNormalized.toFixed(3)}
            data-my-turn={state.myTurn ? 'yes' : 'no'}
          >
            {state.phase === 'over' && <Verdict state={state} onLeave={onLeave} />}
            {state.connectionLost && state.phase !== 'over' && (
              <Banner text="상대와의 연결이 끊겼다" danger />
            )}
          </div>
          <TypingLane words={state.words} side="right" suggested={state.suggestion?.word ?? null} />
        </div>
      </div>

      <InputRow input={input} state={state} />
    </div>
  )
}

/** 양쪽 이름·목숨·현재 턴. 색 점이 아레나의 물건 윤곽색과 대조된다 */
function Scoreboard({ state, onLeave }: { state: MatchViewState; onLeave: () => void }) {
  const livesOf = new Map(state.lives)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        padding: '12px 20px',
        borderBottom: '1px solid #262b3d',
        background: '#151824',
      }}
    >
      {state.players.map((player, index) => {
        const mine = player.id === state.selfId
        const active = state.current === player.id
        const lives = livesOf.get(player.id) ?? 0
        return (
          <div
            key={player.id}
            data-player={mine ? 'me' : 'opponent'}
            data-lives={lives}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '6px 12px',
              borderRadius: 999,
              border: `1px solid ${active ? '#ffcf5c' : 'transparent'}`,
              background: active ? 'rgba(255, 207, 92, 0.1)' : 'transparent',
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
            <span style={{ fontSize: 15, color: '#f2f4fb', fontWeight: mine ? 700 : 500 }}>
              {player.nickname}
              {mine && ' (나)'}
            </span>
            <span style={{ fontSize: 17, letterSpacing: '0.1em' }}>
              {Array.from({ length: LIVES }, (_, slot) => (
                <span key={slot} style={{ color: slot < lives ? '#ff6b6b' : '#2e3448' }}>
                  {slot < lives ? '♥' : '♡'}
                </span>
              ))}
            </span>
          </div>
        )
      })}
      <button
        type="button"
        onClick={onLeave}
        style={{
          marginLeft: 'auto',
          background: 'transparent',
          border: '1px solid #2e3448',
          borderRadius: 8,
          color: '#6a7290',
          fontSize: 13,
          padding: '6px 12px',
        }}
      >
        나가기
      </button>
    </div>
  )
}

function InputRow({
  input,
  state,
}: {
  input: ReturnType<typeof useHangulInput>
  state: MatchViewState
}) {
  const waiting = !state.myTurn && state.phase === 'playing'

  return (
    <div
      style={{
        display: 'grid',
        justifyItems: 'center',
        gap: 6,
        padding: '14px 20px',
        borderTop: '1px solid #262b3d',
        background: '#151824',
      }}
    >
      <div style={{ width: 'min(420px, 60%)' }}>
        <input
          ref={input.ref}
          value={input.value}
          onChange={input.onChange}
          onKeyDown={input.onKeyDown}
          onCompositionStart={input.onCompositionStart}
          onCompositionEnd={input.onCompositionEnd}
          autoFocus
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="단어 입력"
          style={{
            width: '100%',
            font: '600 28px/1.2 var(--sans)',
            color: '#f2f4fb',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            padding: 0,
            textAlign: 'center',
            caretColor: '#ffcf5c',
          }}
        />
        <div
          style={{
            height: 2,
            marginTop: 4,
            background: waiting ? '#2e3448' : '#ffcf5c',
            transition: 'background 140ms',
          }}
        />
      </div>

      <TurnHint state={state} />
      {state.suggestion !== null && (
        <span data-suggestion={state.suggestion.word} style={{ fontSize: 14, color: '#ffcf5c' }}>
          상대가 «{state.suggestion.word}» 를 지목했다
        </span>
      )}
    </div>
  )
}

/** 지금 내 타자가 무엇을 하는지 한 줄로 알려준다 — 규칙이 턴에 따라 달라지기 때문이다 */
function TurnHint({ state }: { state: MatchViewState }) {
  if (state.phase === 'over') {
    return <span style={{ fontSize: 14, color: '#6a7290' }}>판이 끝났다</span>
  }
  const label = state.myTurn
    ? '내 차례 — 단어를 치면 그 물건이 화살표 자리에 떨어진다'
    : '상대 차례 — 단어를 치면 상대에게 지목한다'
  return (
    <span
      data-turn-hint={state.myTurn ? 'mine' : 'theirs'}
      style={{ fontSize: 14, color: state.myTurn ? '#6bffb0' : '#6a7290' }}
    >
      {label}
    </span>
  )
}

function Verdict({ state, onLeave }: { state: MatchViewState; onLeave: () => void }) {
  const won = state.winner === state.selfId
  const draw = state.winner === null
  const text = draw ? '무승부' : won ? '이겼다' : '졌다'
  const winnerName =
    state.players.find((player) => player.id === state.winner)?.nickname ?? null

  return (
    <div
      data-verdict={draw ? 'draw' : won ? 'win' : 'lose'}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(13, 15, 22, 0.88)',
      }}
    >
      <div style={{ textAlign: 'center', display: 'grid', gap: 14 }}>
        <span
          style={{
            font: '700 46px/1.1 var(--sans)',
            color: draw ? '#b6bdd4' : won ? '#6bffb0' : '#ff6b6b',
          }}
        >
          {text}
        </span>
        {winnerName !== null && !draw && (
          <span style={{ color: '#b6bdd4', fontSize: 15 }}>{winnerName} 승</span>
        )}
        <button
          type="button"
          onClick={onLeave}
          style={{
            padding: '12px 28px',
            fontSize: 15,
            fontWeight: 600,
            borderRadius: 10,
            border: '1px solid #48507a',
            background: '#ffcf5c',
            color: '#1a1405',
          }}
        >
          로비로
        </button>
      </div>
    </div>
  )
}

function Banner({ text, danger = false }: { text: string; danger?: boolean }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '22%',
        left: 0,
        right: 0,
        textAlign: 'center',
        fontSize: 20,
        fontWeight: 700,
        color: danger ? '#ff6b6b' : '#f2f4fb',
        textShadow: '0 3px 18px #0d0f16',
      }}
    >
      {text}
    </div>
  )
}

export { MatchScreen }
