import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { play } from '../components/animate.ts'
import { withObject, withSubject, withTopic } from '../text/particle.ts'
import { StackArena } from '../components/StackArena.tsx'
import { TypingLane } from '../components/TypingLane.tsx'
import { LIVES } from '../game/config.ts'
import type { MatchEngine, MatchViewState } from '../multi/MatchEngine.ts'
import { ownerColorAt } from '../multi/ownerColors.ts'
import { Barrier, KEPT, LOST } from '../components/Vitals.tsx'
import { useHangulInput } from '../hooks/useHangulInput.ts'
import { useMatchRanking } from '../hooks/useMatchRanking.ts'
import { tierOf, tierProgress } from '../rank/tiers.ts'
import { useTypingSound } from '../hooks/useAudio.ts'

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

  useTypingSound(input.tapSeq)

  /*
   * 턴이 바뀌어도 **치던 글자는 지우지 않는다.**
   * 지목하려고 반쯤 친 단어가 내 차례가 되는 순간 사라지면 손이 끊긴다 —
   * 한글은 조립 중이라 더 그렇다. 그대로 두면 지목하려던 손이 그 자리에서
   * 드롭으로 이어진다. 포커스만 되돌린다.
   */
  useEffect(() => {
    focus()
  }, [focus])

  /*
   * 단어 → 노리는 사람의 색. 내가 노리는 것도 들어 있다 —
   * 어디를 노리고 있는지 보이지 않으면 옮겨간 줄 모른 채 친다.
   */
  const harassColors = useMemo(() => {
    const colors = new Map<string, string>()
    for (const mark of state.aimed) {
      const index = state.players.findIndex((player) => player.id === mark.by)
      colors.set(mark.word, ownerColorAt(index < 0 ? 0 : index))
    }
    return colors
  }, [state])

  return (
    <div style={rootStyle} onMouseDown={input.keepFocus}>
      <Scoreboard state={state} onLeave={onLeave} />

      <div style={fieldLayerStyle}>
        <StackArena engine={engine} />
        <div style={fieldStyle}>
          <TypingLane words={state.words} side="left" harassed={harassColors} />
          <div
            style={{ position: 'relative', minHeight: 0 }}
            data-aim={state.aimNormalized.toFixed(3)}
            data-my-turn={state.canDrop ? 'yes' : 'no'}
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
            {state.phase !== 'over' && <AimNotice state={state} />}
          </div>
          <TypingLane words={state.words} side="right" harassed={harassColors} />
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
  /*
   * 사람이 많으면 이름표를 좁힌다. 여덟이 다 붙으면 넓은 모양으로는 한 줄에 들어가지
   * 않는데, 줄이 두 개가 되면 아레나가 밀려 내려간다 — 조준 중에 화면이 움직이면 안 된다.
   * 승수는 판 사이에만 필요한 값이라 좁은 모양에서 먼저 접는다.
   */
  const crowded = state.players.length > 4

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: crowded ? 10 : 24,
        padding: crowded ? '8px 14px' : '12px 20px',
        borderBottom: '1px solid #262b3d',
        background: '#151824',
        overflow: 'hidden',
      }}
    >
      {state.players.map((player, index) => {
        const mine = player.id === state.selfId
        /*
         * 차례인 사람을 밝힌다. 받침대가 하나라 "지금 누가 놓는가"가 판을 읽는 첫 정보다.
         * 쿨타임이 도는 동안에도 밝혀둔다 — 차례는 이미 그 사람에게 넘어가 있고,
         * 얼마나 남았는지는 아래 막대가 말한다.
         */
        const active = player.id === state.current
        const lives = livesOf.get(player.id) ?? 0
        return (
          <div
            key={player.id}
            data-player={mine ? 'me' : 'opponent'}
            data-lives={lives}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: crowded ? 6 : 10,
              padding: crowded ? '4px 8px' : '6px 12px',
              borderRadius: 999,
              minWidth: 0,
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
            <span
              style={{
                fontSize: crowded ? 13 : 15,
                color: '#f2f4fb',
                fontWeight: mine ? 700 : 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: crowded ? 72 : 160,
              }}
            >
              {player.nickname}
              {mine && !crowded && ' (나)'}
            </span>
            <PlayerLives lives={lives} invulnerable={invulnerableOf.get(player.id) ?? 0} />
            {!crowded && <Wins count={winsOf.get(player.id) ?? 0} />}
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
  const waiting = !state.canDrop && state.phase === 'playing'

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

      <ActionHint state={state} />
      <AimResult state={state} />
      {/*
        * 알릴 것이 없을 때도 이 줄의 자리를 비워둔다. 나타났다 사라지게 하면 입력줄
        * 높이가 바뀌어 아레나가 위아래로 밀린다 — 조준 중에 화면이 움직이면 안 된다.
        */}
    </div>
  )
}

/**
 * 지금 내 타자가 무엇을 하는지 한 줄로 알려준다.
 *
 * 갈리는 것이 셋이다 — **지금 칠 수 있는 내 차례**, **곧 오는 내 차례**(쿨타임이
 * 도는 중), **남의 차례**. 둘로 뭉뚱그리면 "왜 안 되지"와 "곧 되는 건가"가 섞인다.
 * 어느 경우든 친 단어가 버려지지는 않는다 — 떨구지 못하면 덫이 된다.
 */
function ActionHint({ state }: { state: MatchViewState }) {
  if (state.phase === 'over') {
    return <span style={{ fontSize: 14, color: '#6a7290' }}>판이 끝났다</span>
  }
  const ready = state.canDrop
  const soon = state.myTurn && !ready
  /*
   * 이 줄은 **내 타자가 무엇을 하는가**만 말한다.
   * 누구 차례인지는 상단 이름표가 이미 밝히고 있어, 여기서 또 하면 같은 것을 두 번 읽는다.
   */
  const label = ready
    ? '단어를 치면 그 물건이 화살표 자리에 떨어진다'
    : soon
      ? '곧 칠 수 있다'
      : '단어를 치면 그 단어를 노린다'
  const color = ready ? '#6bffb0' : soon ? '#ffcf5c' : '#ff9f6b'
  return (
    <span
      data-turn-hint={ready ? 'mine' : soon ? 'soon' : 'theirs'}
      style={{
        fontSize: 14,
        color,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {label}
      {/* 대기는 모두가 함께 쓰므로 남의 차례일 때도 같은 값이 흐른다 */}
      {!ready && <CooldownBar ratio={state.dropCooldown} color={color} />}
    </span>
  )
}

/**
 * 노려보려 한 결과.
 *
 * 남이 이미 노리는 단어는 뺏지 못한다. 그때 아무 반응이 없으면 "쳤는데 왜 아무 일도
 * 없지"가 남는다 — 정확히 친 손을 헛치게 만드는 것이라 반드시 말해줘야 한다.
 *
 * 성공은 옅게, 실패는 눈에 띄게 한다. 성공은 칩에 색이 붙는 것으로 이미 보이지만
 * 실패는 화면에 아무 흔적이 남지 않기 때문이다.
 */
function AimResult({ state }: { state: MatchViewState }) {
  const result = state.aimResult
  const seq = result?.seq ?? 0
  const ref = useRef<HTMLSpanElement | null>(null)
  const [shown, setShown] = useState<{ text: string; failed: boolean } | null>(null)
  const timer = useRef(0)

  useEffect(() => {
    if (result === null) {
      return
    }
    const failed = result.takenBy !== null
    const taker =
      state.players.find((player) => player.id === result.takenBy)?.nickname ?? '다른 사람'
    setShown({
      text: failed
        ? `${withTopic(result.word)} ${withSubject(taker)} 먼저 노렸다`
        : `${withObject(result.word)} 노렸다`,
      failed,
    })
    play(
      ref.current,
      failed
        ? [
            // 실패는 좌우로 흔든다 — 커지는 것은 성공으로 읽힌다
            { transform: 'translateX(0)', opacity: 1 },
            { transform: 'translateX(-5px)', offset: 0.2 },
            { transform: 'translateX(4px)', offset: 0.45 },
            { transform: 'translateX(0)', offset: 0.7 },
            { transform: 'translateX(0)', opacity: 0 },
          ]
        : [
            { transform: 'scale(0.94)', opacity: 0 },
            { transform: 'scale(1.06)', opacity: 1, offset: 0.25 },
            { transform: 'scale(1)', opacity: 1, offset: 0.5 },
            { transform: 'scale(1)', opacity: 0 },
          ],
      { duration: AIM_RESULT_MS, easing: 'ease-out' },
    )
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setShown(null), AIM_RESULT_MS)
    // seq가 바뀔 때만 새 결과다 — 같은 시도를 매 프레임 다시 띄우지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq])

  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <span
      ref={ref}
      data-aim-result={shown === null ? undefined : shown.failed ? 'failed' : 'ok'}
      style={{
        fontSize: 13,
        fontWeight: shown?.failed === true ? 700 : 400,
        color: shown === null ? 'transparent' : shown.failed ? '#ff9f6b' : '#8b93b0',
        visibility: shown === null ? 'hidden' : 'visible',
      }}
    >
      {shown?.text ?? ' '}
    </span>
  )
}

const AIM_RESULT_MS = 2200

/** 다음에 떨굴 수 있을 때까지 남은 시간. 숫자보다 줄어드는 막대가 눈에 빨리 들어온다 */
function CooldownBar({ ratio, color = '#ff9f6b' }: { ratio: number; color?: string }) {
  return (
    <span
      data-cooldown={ratio.toFixed(2)}
      style={{
        display: 'inline-block',
        width: 48,
        height: 4,
        borderRadius: 2,
        background: '#2b3047',
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          display: 'block',
          width: `${Math.round(ratio * 100)}%`,
          height: '100%',
          background: color,
        }}
      />
    </span>
  )
}

/**
 * 노림이 먹혔다는 알림. **아레나 가운데에 띄운다.**
 *
 * 하트가 반 칸 깎이는 것은 이름표에서 일어나는데 시선은 떨어지는 물건에 가 있다.
 * 하단 줄에 두었더니 그마저 눈에 안 들어왔다 — 판이 벌어지는 자리에 띄워야 남는다.
 *
 * **누가 누구를 노렸는지 이름을 다 댄다.** 여덟이 붙으면 "상대"로는 누가 누구에게
 * 당했는지 알 수 없고, 하트를 훑어 역산해야 한다.
 */
/**
 * 가운데 알림이 남아 있는 시간.
 *
 * 반 칸은 하트만 봐서는 알아채기 어렵다. 무슨 일이 있었는지 읽고, 누구인지 확인하고,
 * 남은 하트까지 세는 데 걸리는 시간을 담아야 한다.
 */
const CENTER_NOTICE_MS = 5000

function AimNotice({ state }: { state: MatchViewState }) {
  const aim = state.lastAim
  const seq = aim?.seq ?? 0
  const ref = useRef<HTMLDivElement | null>(null)
  const [shown, setShown] = useState<{
    who: string
    victim: string
    word: string
    lives: number
    tone: 'mine' | 'hit' | 'other'
  } | null>(null)
  const timer = useRef(0)

  useEffect(() => {
    if (aim === null) {
      return
    }
    const nameOf = (id: string) =>
      state.players.find((player) => player.id === id)?.nickname ?? '상대'
    setShown({
      who: nameOf(aim.by),
      victim: nameOf(aim.victim),
      word: aim.word,
      lives: new Map(state.lives).get(aim.victim) ?? 0,
      tone: aim.by === state.selfId ? 'mine' : aim.victim === state.selfId ? 'hit' : 'other',
    })
    /*
     * 성공한 순간을 몸으로 알린다. 반 칸은 하트를 봐도 잘 안 보이는 크기라,
     * 글자가 한 번 크게 튀어야 "무슨 일이 있었다"가 남는다.
     */
    play(
      ref.current,
      [
        { opacity: 0, transform: 'scale(0.85)' },
        { opacity: 1, transform: 'scale(1.12)', offset: 0.2 },
        { opacity: 1, transform: 'scale(1)', offset: 0.35 },
        { opacity: 1, transform: 'scale(1)', offset: 0.88 },
        { opacity: 0, transform: 'scale(1)' },
      ],
      // 반 칸은 하트만 봐서는 알아채기 어렵다. 읽고 이해할 시간까지 두고 남긴다
      { duration: CENTER_NOTICE_MS, easing: 'ease-out' },
    )
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setShown(null), CENTER_NOTICE_MS)
    // seq가 바뀔 때만 새 알림이다 — 같은 노림을 매 프레임 다시 띄우지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq])

  useEffect(() => () => clearTimeout(timer.current), [])

  if (shown === null) {
    return null
  }
  // 노린 쪽은 초록(성공), 당한 쪽은 붉은색(손해), 구경꾼은 옅게
  const color = shown.tone === 'mine' ? '#6bffb0' : shown.tone === 'hit' ? '#ff6b6b' : '#b6bdd4'

  return (
    <div
      ref={ref}
      data-aim-hit={`${shown.who}>${shown.victim}`}
      style={{
        position: 'absolute',
        top: '34%',
        left: 0,
        right: 0,
        textAlign: 'center',
        textShadow: '0 3px 18px #0d0f16',
        pointerEvents: 'none',
      }}
    >
      {/*
        * **누구든 닉네임으로 부른다.** "내 노림"처럼 대명사를 쓰면 옆에서 보는 사람과
        * 당사자가 서로 다른 문장을 읽게 되어, 나중에 판을 되짚을 때 말이 안 맞는다.
        * 누가 노린 쪽이고 누가 당한 쪽인지는 색이 말한다.
        */}
      <div style={{ fontSize: 20, fontWeight: 700, color }}>
        {withSubject(shown.victim)} {shown.who}의 노림에 걸렸다
      </div>
      {/* 서브텍스트는 가운데 알림끼리 같은 것을 말한다 — 깎인 사람의 남은 하트 */}
      <div style={{ fontSize: 14, color: '#b6bdd4', marginTop: 4 }}>
        {shown.word} · {shown.victim} 남은 하트 {shown.lives}
      </div>
    </div>
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
      {count > 0 ? `${count}승` : '-'}
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
        /*
         * 방해가 먹히면 하트가 **반 칸씩** 오른다. 칸을 통째로만 그리면 되찾은 것이
         * 화면에 나타나지 않아, 무엇 때문에 살아남았는지 알 수 없다.
         * 반 칸은 왼쪽만 채운 하트로 그린다.
         */
        const filled = Math.min(Math.max(lives - slot, 0), 1)
        return (
          <span
            key={slot}
            ref={(node) => {
              slots.current[slot] = node
            }}
            data-heart={filled}
            style={{ position: 'relative', display: 'inline-block', color: LOST }}
          >
            ♡
            {filled > 0 && (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  color: KEPT,
                  overflow: 'hidden',
                  width: `${filled * 100}%`,
                }}
              >
                ♥
              </span>
            )}
          </span>
        )
      })}
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
        <TierPanel state={state} />

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
      {/* 노림 알림과 같은 규칙 — 누구든 닉네임으로 부르고, 내 일인지는 색이 말한다 */}
      <div style={{ fontSize: 20, fontWeight: 700, color: mine ? '#ff6b6b' : '#f2f4fb' }}>
        {who}의 물건이 떨어졌다
      </div>
      {/* 무적은 하트 위 베리어가 이미 보여준다 — 글로 한 번 더 말하면 읽을 것만 늘어난다 */}
      <div style={{ fontSize: 14, color: '#b6bdd4', marginTop: 4 }}>
        {who} 남은 하트 {hurt.lives}
      </div>
    </div>
  )
}

/**
 * 티어와 이번 판의 변동.
 *
 * **격차가 클수록 변동이 0에 가까워진다**(Elo). 그래서 약한 상대를 반복해 이겨도
 * 얻는 것이 없고, 매칭을 만들지 않고도 파밍이 자연히 막힌다. 대신 그런 상대에게
 * 지면 크게 잃는다 — 그 비대칭이 억제력이라 숫자를 숨기지 않고 그대로 보여준다.
 *
 * 랭킹이 안 되어도 판은 그대로 끝난다. 이 칸만 조용히 비운다.
 */
function TierPanel({ state }: { state: MatchViewState }) {
  const ranking = useMatchRanking(state)
  const tier = tierOf(ranking.rating)
  const progress = tierProgress(ranking.rating)

  if (ranking.status === 'offline') {
    return <span style={{ fontSize: 13, color: '#4a5171' }}>티어를 받지 못했다</span>
  }
  if (ranking.status === 'pending') {
    return <span style={{ fontSize: 13, color: '#6a7290' }}>상대의 보고를 기다린다…</span>
  }
  if (ranking.status === 'disputed') {
    return (
      <span style={{ fontSize: 13, color: '#ff6b6b' }}>
        양쪽 기록이 어긋나 이 판은 티어에 반영되지 않았다
      </span>
    )
  }
  if (ranking.status === 'idle') {
    return null
  }

  return (
    <div data-tier={tier.name} style={{ display: 'grid', gap: 6, justifyItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: tier.color }}>{tier.name}</span>
        <span style={{ fontSize: 15, color: '#b6bdd4', fontVariantNumeric: 'tabular-nums' }}>
          {ranking.rating}
        </span>
        {ranking.delta !== null && ranking.delta !== 0 && (
          <span
            data-delta={ranking.delta}
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: ranking.delta > 0 ? '#6bffb0' : '#ff6b6b',
            }}
          >
            {ranking.delta > 0 ? '+' : '−'}
            {Math.abs(ranking.delta)}
          </span>
        )}
      </div>
      {/* 등급만 보여주면 그 안에서 오르내리는 것이 안 보여 한 판이 무의미해 보인다 */}
      <div
        style={{
          width: 160,
          height: 4,
          borderRadius: 999,
          background: '#232839',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${progress * 100}%`,
            height: '100%',
            background: tier.color,
            transition: 'width 420ms ease-out',
          }}
        />
      </div>
      <span style={{ fontSize: 12, color: '#4a5171' }}>
        {ranking.wins}승 {ranking.losses}패
      </span>
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
