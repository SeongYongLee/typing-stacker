import { useCallback, useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { play } from '../components/animate.ts'
import { StackArena } from '../components/StackArena.tsx'
import { TypingLane } from '../components/TypingLane.tsx'
import { LIVES } from '../game/config.ts'
import type { MatchEngine, MatchViewState } from '../multi/MatchEngine.ts'
import { ownerColorAt } from '../multi/ownerColors.ts'
import { Barrier, KEPT, LOST } from '../components/Vitals.tsx'
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
  const rematch = useCallback(() => engine.requestRematch(), [engine])
  const input = useHangulInput(submit)
  const { focus } = input

  /*
   * 턴이 바뀌어도 **치던 글자는 지우지 않는다.**
   * 지목하려고 반쯤 친 단어가 내 차례가 되는 순간 사라지면 손이 끊긴다 —
   * 한글은 조립 중이라 더 그렇다. 그대로 두면 지목하려던 손이 그 자리에서
   * 드롭으로 이어진다. 포커스만 되돌린다.
   */
  useEffect(() => {
    focus()
  }, [state.current, focus])

  return (
    <div style={rootStyle} onMouseDown={input.keepFocus}>
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
            {state.phase === 'over' && (
              <Verdict state={state} onRematch={rematch} onLeave={onLeave} />
            )}
            {state.opponentLeft && state.phase !== 'over' && (
              <Banner text="상대가 로비로 나갔다" danger />
            )}
            {state.connectionLost && !state.opponentLeft && state.phase !== 'over' && (
              <Banner text="상대와의 연결이 끊겼다" danger />
            )}
            {state.hurt !== null && state.phase !== 'over' && (
              <HurtNotice state={state} hurt={state.hurt} />
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
  const invulnerableOf = new Map(state.invulnerable)
  const winsOf = new Map(state.wins)

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
        // 자리를 잡는 동안에는 아무도 표시하지 않는다 — 아무의 차례도 아닌 것이 규칙이고,
        // 여기만 이름표를 밝혀두면 아래 안내문("자리를 잡는 중")과 어긋나 보인다
        const active = state.current === player.id && !state.settling
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
            <PlayerLives lives={lives} invulnerable={invulnerableOf.get(player.id) ?? 0} />
            <Wins count={winsOf.get(player.id) ?? 0} />
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
      {/*
        * 지목이 없을 때도 이 줄의 자리를 비워둔다. 나타났다 사라지게 하면 입력줄 높이가
        * 바뀌어 아레나가 위아래로 밀린다 — 조준 중에 화면이 움직이면 안 된다.
        */}
      <span
        data-suggestion={state.suggestion?.word}
        style={{
          fontSize: 14,
          color: '#ffcf5c',
          visibility: state.suggestion === null ? 'hidden' : 'visible',
        }}
      >
        {state.suggestion === null
          ? ' '
          : `상대가 «${state.suggestion.word}» 를 지목했다`}
      </span>
    </div>
  )
}

/** 지금 내 타자가 무엇을 하는지 한 줄로 알려준다 — 규칙이 턴에 따라 달라지기 때문이다 */
function TurnHint({ state }: { state: MatchViewState }) {
  if (state.phase === 'over') {
    return <span style={{ fontSize: 14, color: '#6a7290' }}>판이 끝났다</span>
  }
  /*
   * 자리를 잡는 구간은 아무의 차례도 아니다. "상대 차례"로 뭉뚱그리면 양쪽 화면에
   * 똑같은 문장이 떠서 판이 멈춘 것처럼 보인다 — 셋을 갈라야 지금 무엇을 기다리는지 읽힌다.
   */
  if (state.settling) {
    return <SettlingHint />
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

/**
 * 판을 거듭하며 쌓인 승수.
 *
 * 목숨은 판마다 초기화되지만 이것은 남는다 — 한 판을 져도 아직 앞서 있다는 것이
 * 보여야 다음 판을 이어 갈 이유가 생긴다. 0승일 때는 자리만 잡고 비워둔다.
 */
function Wins({ count }: { count: number }) {
  const ref = useRef<HTMLSpanElement | null>(null)
  const previous = useRef(count)

  useEffect(() => {
    const gained = count > previous.current
    previous.current = count
    if (gained) {
      play(
        ref.current,
        [
          { transform: 'scale(1)', opacity: 0.4 },
          { transform: 'scale(1.5)', opacity: 1, offset: 0.35 },
          { transform: 'scale(1)', opacity: 1 },
        ],
        { duration: 620, easing: 'ease-out' },
      )
    }
  }, [count])

  return (
    <span
      ref={ref}
      data-wins={count}
      style={{
        display: 'inline-block',
        minWidth: 24,
        textAlign: 'center',
        fontSize: 13,
        fontWeight: 700,
        color: count > 0 ? '#ffcf5c' : '#3a4160',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {count > 0 ? `${count}승` : '—'}
    </span>
  )
}

/**
 * 이름표의 하트.
 *
 * 목숨이 줄어드는 순간을 놓치지 않게 그 자리가 크게 튀었다가 식고, 줄이 흔들린다 —
 * 시선이 떨어지는 물건에 가 있기 때문이다. 무적 동안에는 베리어가 덮인다.
 * 싱글의 Vitals와 같은 연출이되, 대전은 **누구의 것인지**가 함께 보여야 한다.
 */
function PlayerLives({ lives, invulnerable }: { lives: number; invulnerable: number }) {
  const rowRef = useRef<HTMLSpanElement | null>(null)
  const slots = useRef<(HTMLSpanElement | null)[]>([])
  const previous = useRef(lives)

  useEffect(() => {
    const lost = previous.current > lives
    previous.current = lives
    if (!lost) {
      return
    }
    play(
      slots.current[lives] ?? null,
      [
        { transform: 'scale(2)', color: KEPT },
        { transform: 'scale(2)', color: KEPT, offset: 0.3 },
        { transform: 'scale(1)', color: LOST },
      ],
      { duration: 560, easing: 'ease-out' },
    )
    play(
      rowRef.current,
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-5px)' },
        { transform: 'translateX(4px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 260, easing: 'ease-in-out' },
    )
  }, [lives])

  return (
    <span
      ref={rowRef}
      style={{
        position: 'relative',
        display: 'inline-flex',
        gap: 2,
        fontSize: 17,
        letterSpacing: '0.1em',
      }}
    >
      {invulnerable > 0 && <Barrier ratio={invulnerable} />}
      {Array.from({ length: LIVES }, (_, slot) => {
        const kept = slot < lives
        return (
          <span
            key={slot}
            ref={(node) => {
              slots.current[slot] = node
            }}
            style={{ display: 'inline-block', color: kept ? KEPT : LOST }}
          >
            {kept ? '♥' : '♡'}
          </span>
        )
      })}
    </span>
  )
}

/**
 * 물건이 멈추기를 기다리는 동안.
 *
 * 점 셋이 차례로 밝아진다 — 얼마나 걸릴지는 물리가 정해서 예고할 수 없지만,
 * 무언가 진행 중이라는 것은 보여야 한다. 정지된 문장만 두면 멈춘 것과 구분되지 않는다.
 */
function SettlingHint() {
  const ref = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    const dots = ref.current?.querySelectorAll('i') ?? []
    const running = [...dots].map((dot, index) =>
      play(
        dot as HTMLElement,
        [{ opacity: 0.25 }, { opacity: 1 }, { opacity: 0.25 }],
        {
          duration: 1000,
          delay: index * 180,
          iterations: Number.POSITIVE_INFINITY,
          easing: 'ease-in-out',
        },
      ),
    )
    return () => running.forEach((animation) => animation?.cancel())
  }, [])

  return (
    <span
      ref={ref}
      data-turn-hint="settling"
      style={{ fontSize: 14, color: '#c8a95e', display: 'inline-flex', gap: 6 }}
    >
      <span aria-hidden style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
        {[0, 1, 2].map((dot) => (
          <i
            key={dot}
            style={{
              width: 4,
              height: 4,
              borderRadius: 999,
              background: 'currentColor',
              opacity: 0.25,
            }}
          />
        ))}
      </span>
      자리를 잡는 중 — 물건이 멈추면 다음 차례로 넘어간다
    </span>
  )
}

function Verdict({
  state,
  onRematch,
  onLeave,
}: {
  state: MatchViewState
  onRematch: () => void
  onLeave: () => void
}) {
  const won = state.winner === state.selfId
  const draw = state.winner === null
  const text = draw ? '무승부' : won ? '이겼다' : '졌다'
  const winnerName =
    state.players.find((player) => player.id === state.winner)?.nickname ?? null
  const iWantRematch = state.wantRematch.includes(state.selfId)
  const winsOf = new Map(state.wins)
  const tally = state.players
    .map((player) => `${player.nickname} ${winsOf.get(player.id) ?? 0}`)
    .join('  :  ')

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
        <span style={{ color: '#6a7290', fontSize: 14 }}>{tally}</span>

        {/*
          * 상대가 나갔으면 계속할 상대가 없다. 버튼을 남겨두고 눌리지 않게 하는 대신
          * 아예 치운다 — 누를 수 없는 버튼은 "왜 안 되지"를 만든다.
          */}
        {state.opponentLeft ? (
          <span data-opponent-left style={{ color: '#ff6b6b', fontSize: 15 }}>
            상대가 로비로 나갔다
          </span>
        ) : (
          <button
            type="button"
            onClick={onRematch}
            disabled={iWantRematch}
            data-rematch={iWantRematch ? 'waiting' : 'ready'}
            style={{
              padding: '12px 28px',
              fontSize: 15,
              fontWeight: 600,
              borderRadius: 10,
              border: '1px solid #48507a',
              background: iWantRematch ? 'transparent' : '#ffcf5c',
              color: iWantRematch ? '#8b93b0' : '#1a1405',
            }}
          >
            {iWantRematch ? '상대를 기다린다…' : '계속하기'}
          </button>
        )}

        <button
          type="button"
          onClick={onLeave}
          style={{
            padding: '10px 24px',
            fontSize: 14,
            fontWeight: 600,
            borderRadius: 10,
            border: '1px solid #2e3448',
            background: 'transparent',
            color: '#b6bdd4',
          }}
        >
          로비로 나가기
        </button>
      </div>
    </div>
  )
}

/**
 * 누가 목숨을 잃었는지 가운데에 알린다.
 *
 * 싱글에서는 이 알림을 뺐다 — 잃은 사람이 나뿐이라 하트만 봐도 안다. 대전은 다르다.
 * 물건이 벗어나면 **주인**의 목숨이 깎이는데, 무너지는 순간에는 그게 누구 물건이었는지
 * 알아볼 겨를이 없다. 이름을 대야 규칙이 읽힌다.
 */
function HurtNotice({
  state,
  hurt,
}: {
  state: MatchViewState
  hurt: NonNullable<MatchViewState['hurt']>
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const mine = hurt.by === state.selfId
  const who = state.players.find((player) => player.id === hurt.by)?.nickname ?? '상대'

  useEffect(() => {
    play(
      ref.current,
      [
        { opacity: 0, transform: 'translateY(10px) scale(0.94)' },
        { opacity: 1, transform: 'translateY(0) scale(1)', offset: 0.18 },
      ],
      { duration: 420, easing: 'ease-out' },
    )
    // hurt.by가 바뀔 때만 다시 재생한다 — 매 프레임 리렌더에 끌려가면 연출이 끊긴다
  }, [hurt.by])

  return (
    <div
      ref={ref}
      data-hurt={hurt.by}
      style={{
        position: 'absolute',
        top: '22%',
        left: 0,
        right: 0,
        textAlign: 'center',
        textShadow: '0 3px 18px #0d0f16',
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 700, color: mine ? '#ff6b6b' : '#f2f4fb' }}>
        {mine ? '내 물건이 떨어졌다' : `${who}의 물건이 떨어졌다`}
      </div>
      {/* 무적은 하트 위 베리어가 이미 보여준다 — 글로 한 번 더 말하면 읽을 것만 늘어난다 */}
      <div style={{ fontSize: 14, color: '#b6bdd4', marginTop: 4 }}>
        목숨 −1 · 남은 {hurt.lives}개
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
