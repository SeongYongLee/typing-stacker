import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Avatar } from '../components/Avatar.tsx'
import { play } from '../components/animate.ts'
import { withSubject } from '../text/particle.ts'
import { ArenaBackdrop } from '../components/ArenaBackdrop.tsx'
import { MemoInput } from '../components/InputBar.tsx'
import { StackArena } from '../components/StackArena.tsx'
import { TypingLane } from '../components/TypingLane.tsx'
import type { WordClaimNotice } from '../components/TypingLane.tsx'
import { LIVES } from '../game/config.ts'
import { TURN_HURRY_SEC } from '../multi/MatchEngine.ts'
import type { MatchEngine, MatchViewState } from '../multi/MatchEngine.ts'
import type { ChatLine } from '../multi/ChatLog.ts'
import { ownerColorAt } from '../multi/ownerColors.ts'
import { Barrier, KEPT, LOST } from '../components/Vitals.tsx'
import { useHangulInput } from '../hooks/useHangulInput.ts'
import { useMenuKeys } from '../hooks/useMenuKeys.ts'
import { MenuButton } from '../components/MenuButton.tsx'
import { useMatchRanking } from '../hooks/useMatchRanking.ts'
import { tierOf, tierProgress } from '../rank/tiers.ts'
import { useTypingSound } from '../hooks/useAudio.ts'
import { titleThemeForHour } from './titleTheme.ts'
import { duelStatusMessage } from '../multi/duelFeedback.ts'
import { MatchChatBox } from './lobby/MatchChatBox.tsx'

interface MatchScreenProps {
  engine: MatchEngine
  state: MatchViewState
  onLeave: () => void
}

const rootStyle: CSSProperties = {
  position: 'relative',
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
  const returnToRoom = useCallback(() => engine.requestRoomReturn(), [engine])
  const input = useHangulInput(submit)
  const { focus } = input
  // 판을 보는 동안 조명이 갑자기 갈리지 않도록 들어온 시각으로 낮/밤을 고정한다
  const [nightfall] = useState<0 | 1>(() =>
    titleThemeForHour(new Date().getHours()) === 'night' ? 1 : 0,
  )
  const wordClaims = useMemo<readonly WordClaimNotice[]>(() => {
    const names = new Map(state.players.map((player) => [player.id, player.nickname]))
    return state.wordClaims.map((claim) => {
      const nickname = names.get(claim.by) ?? '누군가'
      const reward = claim.lifeReward ? ' · 생명 +1' : ''
      return { ...claim, label: `${withSubject(nickname)} 가져감${reward}` }
    })
  }, [state.players, state.wordClaims])
  const whiteboardClaim = useMemo(() => {
    const reward = state.heartReward
    if (reward === null) return null
    const nickname = state.players.find((player) => player.id === reward.player)?.nickname
      ?? '누군가'
    return {
      seq: reward.seq,
      word: reward.word,
      index: reward.index,
      label: `${withSubject(nickname)} 가져감`,
    }
  }, [state.heartReward, state.players])
  const typingWords = state.matchMode === 'duel'
    ? state.words.filter((word) => (
        state.players[(word.id - 1) % state.players.length]?.id === state.selfId
      ))
    : state.words

  useTypingSound(input.tapSeq)

  /* 캔버스의 받침대·소품도 DOM 배경과 같은 조명을 쓰게 한다. */
  useLayoutEffect(() => {
    engine.setNightfall(nightfall)
  }, [engine, nightfall])

  /*
   * 턴이 바뀌어도 **치던 글자는 지우지 않는다.**
   * 지목하려고 반쯤 친 단어가 내 차례가 되는 순간 사라지면 손이 끊긴다 —
   * 한글은 조립 중이라 더 그렇다. 그대로 두면 지목하려던 손이 그 자리에서
   * 드롭으로 이어진다. 포커스만 되돌린다.
   */
  useEffect(() => {
    focus()
  }, [focus])

  return (
    <div style={rootStyle} onMouseDown={input.keepFocus} data-match-screen>
      <ArenaBackdrop
        mode="match"
        nightfall={nightfall}
        whiteboard={state.whiteboard}
        activeWhiteboard={state.activeWhiteboard}
        whiteboardClaim={whiteboardClaim}
      />
      <Scoreboard state={state} onLeave={onLeave} />

      <div style={fieldLayerStyle}>
        <StackArena engine={engine} />
        {state.matchMode === 'duel' && <DuelStageBadge stage={state.stage} />}
        <div style={fieldStyle}>
          <TypingLane
            words={typingWords}
            side="left"
            wordMarks={state.wordMarks}
            mergeSizes={state.wordMergeSizes}
            mergeHints={state.wordMergeHints}
            pairPulse={state.pairPulse}
            recallWords={state.whiteboard}
            recallMarker="heart"
            claims={wordClaims}
          />
          <div
            style={{ position: 'relative', minHeight: 0 }}
            data-aim={state.aimNormalized.toFixed(3)}
            data-my-turn={state.canDrop ? 'yes' : 'no'}
          >
            {state.opponentLeft && state.phase !== 'over' && (
              <Banner text="상대가 로비로 나갔습니다" danger />
            )}
            {/*
              **끊긴 것과 다시 붙는 중인 것을 갈라 말한다.** 사람이 할 수 있는 일이
              다르다 — 이쪽은 기다리면 되고, 저쪽은 나가는 것 말고 없다.
            */}
            {state.reconnecting && !state.connectionLost && state.phase !== 'over' && (
              <Banner text="연결이 끊겼습니다 — 다시 붙는 중…" />
            )}
            {state.connectionLost && !state.opponentLeft && state.phase !== 'over' && (
              <Banner text="상대와의 연결이 끊겼습니다" danger />
            )}
            {state.phase !== 'over' && <DuelPersonalStatus state={state} />}
            {state.phase !== 'over' && <TurnNotice state={state} />}
            {state.hurt !== null && state.phase !== 'over' && state.matchMode !== 'duel' && (
              <HurtNotice state={state} hurt={state.hurt} />
            )}
          </div>
          <TypingLane
            words={typingWords}
            side="right"
            wordMarks={state.wordMarks}
            mergeSizes={state.wordMergeSizes}
            mergeHints={state.wordMergeHints}
            pairPulse={state.pairPulse}
            recallWords={state.whiteboard}
            recallMarker="heart"
            claims={wordClaims}
          />
        </div>
        <HeartRewardFlight state={state} />
        <DuelMergeFeedback state={state} />
        {state.phase === 'over' && (
          <Verdict
            state={state}
            onChat={submit}
            onRematch={rematch}
            onReturnToRoom={returnToRoom}
            onLeave={onLeave}
          />
        )}
      </div>

      {state.phase === 'playing' && <InputRow input={input} state={state} nightfall={nightfall} />}
    </div>
  )
}

/** 이번 판의 좁은 단어 풀을 알려 주는 전략 정보. 경기 중에도 항상 남긴다. */
function DuelStageBadge({ stage }: { stage: MatchViewState['stage'] }) {
  return (
    <div
      aria-label={`이번 대전 스테이지: ${stage.title}`}
      style={{
        position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 4,
        padding: '5px 10px', border: '1px solid rgba(255,255,255,0.45)', borderRadius: 4,
        background: 'rgba(17, 23, 34, 0.7)', color: '#fff5cb', fontSize: 14, fontWeight: 700,
        pointerEvents: 'none', whiteSpace: 'nowrap',
      }}
    >
      {stage.title}
    </div>
  )
}

function DuelPersonalStatus({ state }: { state: MatchViewState }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const result = state.duelResults.find((candidate) => candidate.id === state.selfId) ?? null
  const placement = result?.placement
  const outcome = result?.outcome

  useEffect(() => {
    if (result === null) return
    const animation = play(
      ref.current,
      [
        { transform: 'translateY(12px) scale(0.92)', opacity: 0 },
        { transform: 'translateY(-2px) scale(1.04)', opacity: 1, offset: 0.42 },
        { transform: 'translateY(0) scale(1)', opacity: 1 },
      ],
      { duration: 620, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    )
    return () => animation?.cancel()
  }, [outcome, placement, result])

  if (result === null) return null
  const message = duelStatusMessage(result)
  const color = message.tone === 'danger' ? '#ff7b7b' : '#79ffc0'

  return (
    <div
      ref={ref}
      data-duel-personal-status={result.outcome}
      data-placement={result.placement}
      aria-live="assertive"
      style={{
        position: 'absolute',
        top: '8%',
        left: 0,
        right: 0,
        zIndex: 4,
        display: 'grid',
        justifyItems: 'center',
        gap: 5,
        textAlign: 'center',
        pointerEvents: 'none',
        textShadow: '0 3px 16px rgba(5, 9, 17, 0.95)',
      }}
    >
      <strong style={{ color, fontSize: 30, lineHeight: 1.05 }}>{message.title}</strong>
      <span style={{ color: '#e2e7f2', fontSize: 14, fontWeight: 700 }}>{message.detail}</span>
      {state.inputMode === 'chat' && (
        <span
          data-chat-available
          style={{
            marginTop: 3,
            paddingTop: 5,
            borderTop: '1px solid rgba(139, 214, 255, 0.48)',
            color: '#8bd6ff',
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          채팅 가능
        </span>
      )}
    </div>
  )
}

function DuelMergeFeedback({ state }: { state: MatchViewState }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const firstRingRef = useRef<HTMLSpanElement | null>(null)
  const secondRingRef = useRef<HTMLSpanElement | null>(null)
  const thirdRingRef = useRef<HTMLSpanElement | null>(null)
  const feedback = state.mergeFeedback
  const seq = feedback?.seq
  const complexMerge = (feedback?.ingredientCount ?? 0) >= 3

  useLayoutEffect(() => {
    if (feedback === null) return
    const labelAnimation = play(
      ref.current,
      complexMerge
        ? [
            { transform: 'translate(-50%, -50%) scale(0.68)', opacity: 0 },
            { transform: 'translate(-50%, -50%) scale(1.14)', opacity: 1, offset: 0.18 },
            { transform: 'translate(-50%, -50%) scale(1.04)', opacity: 1, offset: 0.68 },
            { transform: 'translate(-50%, -72%) scale(0.98)', opacity: 0 },
          ]
        : [
            { transform: 'translate(-50%, -50%) scale(0.72)', opacity: 0 },
            { transform: 'translate(-50%, -50%) scale(1.08)', opacity: 1, offset: 0.28 },
            { transform: 'translate(-50%, -56%) scale(1)', opacity: 1, offset: 0.68 },
            { transform: 'translate(-50%, -72%) scale(0.96)', opacity: 0 },
          ],
      {
        duration: complexMerge ? 2200 : 1700,
        easing: 'cubic-bezier(0.2, 0.8, 0.28, 1)',
      },
    )
    const rings = complexMerge
      ? [firstRingRef.current, secondRingRef.current, thirdRingRef.current]
      : [firstRingRef.current, secondRingRef.current]
    const ringAnimations = rings.map((ring, index) => play(
      ring,
      [
        { transform: 'translate(-50%, -50%) scale(0.35)', opacity: 0 },
        { opacity: complexMerge ? 0.9 : 0.72, offset: 0.18 },
        {
          transform: `translate(-50%, -50%) scale(${complexMerge ? 1.9 : 1.45})`,
          opacity: 0,
        },
      ],
      {
        duration: complexMerge ? 1450 : 1050,
        delay: index * 170,
        easing: 'ease-out',
      },
    ))
    return () => {
      labelAnimation?.cancel()
      for (const animation of ringAnimations) animation?.cancel()
    }
  }, [complexMerge, feedback, seq])

  if (feedback === null || state.duelTowerIds.length === 0) return null
  const towerIndex = Math.max(0, state.duelTowerIds.indexOf(state.selfId))
  const left = ((towerIndex + 0.5) / state.duelTowerIds.length) * 100

  return (
    <div
      ref={ref}
      key={feedback.seq}
      data-duel-merge-feedback={feedback.itemLabel}
      data-merge-size={feedback.ingredientCount}
      aria-live="polite"
      style={{
        position: 'absolute',
        left: `${left}%`,
        top: '57%',
        zIndex: 7,
        color: complexMerge ? '#fff4bd' : '#fff6ae',
        fontSize: complexMerge ? 25 : 21,
        fontWeight: 900,
        lineHeight: 1.15,
        textAlign: 'center',
        whiteSpace: 'nowrap',
        opacity: 0,
        pointerEvents: 'none',
        textShadow: complexMerge
          ? '0 2px 1px rgba(34, 31, 20, 0.9), 0 0 18px rgba(255, 207, 92, 0.92)'
          : '0 2px 1px rgba(34, 31, 20, 0.9), 0 0 12px rgba(107, 255, 176, 0.72)',
      }}
    >
      <span ref={firstRingRef} aria-hidden style={complexMerge ? complexMergeRingStyle : mergeRingStyle} />
      <span ref={secondRingRef} aria-hidden style={complexMerge ? complexMergeRingStyle : mergeRingStyle} />
      {complexMerge && <span ref={thirdRingRef} aria-hidden style={complexMergeRingStyle} />}
      <span style={{
        display: 'block',
        fontSize: complexMerge ? 14 : 12,
        color: complexMerge ? '#ffcf5c' : '#9effc8',
        marginBottom: 3,
      }}>
        {complexMerge ? '다중 합성' : '내 합성'}
      </span>
      {feedback.itemLabel}
    </div>
  )
}

const mergeRingStyle: CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: '55%',
  width: 84,
  height: 84,
  border: '3px solid rgba(107, 255, 176, 0.82)',
  borderRadius: '50%',
  opacity: 0,
  pointerEvents: 'none',
}

const complexMergeRingStyle: CSSProperties = {
  ...mergeRingStyle,
  width: 104,
  height: 104,
  border: '4px solid rgba(255, 207, 92, 0.9)',
}

function HeartRewardFlight({ state }: { state: MatchViewState }) {
  const ref = useRef<HTMLSpanElement | null>(null)
  const reward = state.heartReward
  const seq = reward?.seq

  useLayoutEffect(() => {
    const element = ref.current
    if (reward === null || element === null) return
    const screen = element.closest<HTMLElement>('[data-match-screen]')
    const player = [...(screen?.querySelectorAll<HTMLElement>('[data-player-id]') ?? [])]
      .find((candidate) => candidate.dataset.playerId === reward.player)
    const hearts = [...(player?.querySelectorAll<HTMLElement>('[data-heart-slot]') ?? [])]
    const target = hearts.findLast((heart) => Number(heart.dataset.heart) > 0) ?? hearts[0]
    const layer = element.offsetParent as HTMLElement | null
    if (target === undefined || layer === null) return

    const layerRect = layer.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const startLeft = [44, 50, 56][reward.index] ?? 50
    const startX = layerRect.width * startLeft / 100
    const startY = layerRect.height * 0.31
    const targetX = targetRect.left + targetRect.width / 2 - layerRect.left
    const targetY = targetRect.top + targetRect.height / 2 - layerRect.top
    const animation = play(
      element,
      [
        { left: `${startX}px`, top: `${startY}px`, transform: 'translate(-50%, -50%) scale(0.5)', opacity: 0 },
        { left: `${startX}px`, top: `${startY - layerRect.height * 0.05}px`, transform: 'translate(-50%, -50%) scale(1.25)', opacity: 1, offset: 0.18 },
        { left: `${(startX + targetX) / 2}px`, top: `${Math.min(startY, targetY) - layerRect.height * 0.14}px`, transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.54 },
        { left: `${targetX}px`, top: `${targetY}px`, transform: 'translate(-50%, -50%) scale(0.82)', opacity: 1, offset: 0.9 },
        { left: `${targetX}px`, top: `${targetY}px`, transform: 'translate(-50%, -50%) scale(0.72)', opacity: 0 },
      ],
      { duration: 2400, easing: 'cubic-bezier(0.32, 0.04, 0.3, 1)' },
    )
    return () => animation?.cancel()
  }, [reward, seq])

  if (reward === null) return null
  return (
    <span
      key={reward.seq}
      ref={ref}
      aria-hidden
      data-heart-reward={reward.player}
      style={{
        position: 'absolute',
        left: '50%',
        top: '31%',
        zIndex: 6,
        color: '#ff6b78',
        fontSize: 34,
        lineHeight: 1,
        opacity: 0,
        pointerEvents: 'none',
        textShadow: '0 2px 0 #fff0e1, 0 0 14px rgba(255, 107, 120, 0.72)',
      }}
    >
      ♥
    </span>
  )
}

/** 양쪽 이름·목숨·현재 턴. 색 점이 아레나의 물건 윤곽색과 대조된다 */
function Scoreboard({ state, onLeave }: { state: MatchViewState; onLeave: () => void }) {
  const livesOf = new Map(state.lives)
  const invulnerableOf = new Map(state.invulnerable)
  const winsOf = new Map(state.wins)
  const duelResultOf = new Map(state.duelResults.map((result) => [result.id, result]))
  /*
   * 사람이 많으면 이름표를 좁힌다. 여덟이 다 붙으면 넓은 모양으로는 한 줄에 들어가지
   * 않는데, 줄이 두 개가 되면 아레나가 밀려 내려간다 — 조준 중에 화면이 움직이면 안 된다.
   * 승수는 판 사이에만 필요한 값이라 좁은 모양에서 먼저 접는다.
   */
  const crowded = state.players.length > 4
  /*
   * 사람마다 **마지막 한마디만** 남긴다. 여러 줄을 띄우면 이름표가 밀려 아레나가
   * 내려가는데, 조준 중에 화면이 움직이면 안 된다.
   */
  const gone = useMemo(() => new Set(state.left), [state.left])
  const bubbleBaseline = useRef({
    matchId: state.matchId,
    seq: state.chat.at(-1)?.seq ?? 0,
  })
  if (bubbleBaseline.current.matchId !== state.matchId) {
    bubbleBaseline.current = {
      matchId: state.matchId,
      seq: state.chat.at(-1)?.seq ?? 0,
    }
  }
  const lastSaid = new Map<string, ChatLine>()
  for (const line of state.chat) {
    if (line.seq <= bubbleBaseline.current.seq) continue
    lastSaid.set(line.from, line)
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        /*
         * 사람이 적으면 **가운데로 모은다.** 이름표가 왼쪽 끝에 붙어 있으면 말풍선도
         * 거기서 뜨는데, 판을 보는 눈은 아레나가 있는 가운데에 있다. 여덟이 붙으면
         * 어차피 줄이 꽉 차므로 그때만 왼쪽부터 채운다.
         */
        justifyContent: crowded ? 'flex-start' : 'center',
        gap: crowded ? 10 : 24,
        padding: crowded ? '8px 14px' : '12px 20px',
        borderBottom: '1px solid #262b3d',
        background: '#151824',
        /*
         * 말풍선이 이 줄 **아래로 삐져나와** 아레나 위에 뜬다. `hidden`이면 그 자리에서
         * 잘린다 — 이름이 넘치는 것은 이름표 안에서 이미 잘라내므로 여기서 또 막을 필요가 없다.
         */
        position: 'relative',
        zIndex: 5,
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
        const duelResult = duelResultOf.get(player.id)
        return (
          <div
            key={player.id}
            data-player={mine ? 'me' : 'opponent'}
            data-player-id={player.id}
            data-lives={lives}
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: crowded ? 6 : 10,
              padding: crowded ? '4px 8px' : '6px 12px',
              borderRadius: 999,
              minWidth: 0,
              border: `1px solid ${active ? '#e4e68a' : 'transparent'}`,
              background: active ? 'rgba(255, 207, 92, 0.1)' : 'transparent',
            }}
          >
            {/*
              한 말은 **그 사람 이름표에 붙인다.** 한곳에 목록으로 쌓으면 누가 한
              말인지 이름을 읽어야 알고, 판이 도는 동안에는 그럴 틈이 없다.
            */}
            {/* 꼬리가 가리킬 곳 = 아이콘 한가운데. 왼쪽 여백 + 아이콘 반지름 */}
            {state.phase === 'playing' && (
              <Bubble
                line={lastSaid.get(player.id) ?? null}
                tailX={crowded ? 8 + 9 : 12 + 12}
              />
            )}
            {/* 판이 도는 중에는 이름을 읽을 틈이 없다. 아이콘이 더 빨리 읽힌다 */}
            <Avatar icon={player.icon} size={crowded ? 18 : 24} ring={ownerColorAt(index)} />
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
            {duelResult !== undefined && (
              <span
                data-placement={duelResult.placement}
                style={{
                  minWidth: 30,
                  textAlign: 'center',
                  fontSize: crowded ? 12 : 14,
                  fontWeight: 800,
                  color: duelResult.placement === 1 ? '#e4e68a' : '#b6bdd4',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {duelResult.placement}위
              </span>
            )}
            {/*
              남은 시간은 **차례인 사람 자리에만** 붙인다. 모두에게 띄우면 숫자가
              여덟 개 흐르는 셈이고, 정작 누구를 기다리는지는 그 숫자가 말해주지 않는다.
            */}
            {active && state.phase === 'playing' && state.turnLeft !== null && (
              <TurnClock left={state.turnLeft} />
            )}
            {/*
              나간 사람은 **무너져 탈락한 사람과 다르게** 보여준다. 하트만 비어 있으면
              둘이 같아 보이는데, 남은 사람에게는 다른 소식이다 — 실력으로 떨어진 것이
              아니라 상대가 하나 줄어든 것이다.
            */}
            {gone.has(player.id) && (
              <span style={{ fontSize: 11, color: '#6a7290' }} data-gone>
                나감
              </span>
            )}
            {!crowded && <Wins count={winsOf.get(player.id) ?? 0} />}
          </div>
        )
      })}
      {/*
        나가기는 줄 바깥에 세운다. `marginLeft: auto`로 밀면 그 버튼이 남는 공간을
        전부 먹어서, 이름표를 가운데로 모으려는 것이 무력해진다.
      */}
      <button
        type="button"
        onClick={onLeave}
        style={{
          position: 'absolute',
          right: 20,
          top: '50%',
          transform: 'translateY(-50%)',
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
  nightfall,
}: {
  input: ReturnType<typeof useHangulInput>
  state: MatchViewState
  nightfall: 0 | 1
}) {
  /*
   * 판이 끝나면 단어 칸에서 포커스를 뺀다.
   *
   * `useMenuKeys`는 글자를 치는 중에는 화살표를 듣지 않는다. 이 칸은 판이 도는 내내
   * 포커스를 쥐고 있으므로, 그대로 두면 결과창이 떠도 화살표가 커서의 것이라
   * 버튼을 고를 수 없다. 싱글에서도 같은 자리에서 같은 방법으로 풀었다.
   */
  useEffect(() => {
    if (state.phase !== 'playing' && state.inputMode !== 'chat') {
      input.ref.current?.blur()
    }
  }, [state.phase, state.inputMode, input.ref])

  return (
    <div
      style={{
        display: 'grid',
        justifyItems: 'center',
        gap: 6,
        padding: '14px 20px',
        background:
          'linear-gradient(to bottom, rgba(13, 15, 22, 0) 0%, rgba(13, 15, 22, 0.58) 42%, rgba(13, 15, 22, 0.88) 100%)',
        position: 'relative',
        zIndex: 1,
      }}
    >
      <MemoInput
        input={input}
        nightfall={nightfall}
        ariaLabel={state.inputMode === 'chat' ? '채팅 입력' : '단어 입력'}
        width="min(420px, 60vw)"
        invalidSeq={state.feedback?.kind === 'miss' ? state.feedback.seq : null}
      />

      <ActionHint state={state} />
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
    return (
      <span style={{ fontSize: 14, color: state.inputMode === 'chat' ? '#8bd6ff' : '#6a7290' }}>
        {state.inputMode === 'chat' ? '대화를 이어갈 수 있습니다' : '판이 끝났습니다'}
      </span>
    )
  }
  const ready = state.canDrop
  const soon = state.myTurn && !ready
  /*
   * 이 줄은 **내 타자가 무엇을 하는가**만 말한다.
   * 누구 차례인지는 상단 이름표가 이미 밝히고 있어, 여기서 또 하면 같은 것을 두 번 읽는다.
   */
  /*
   * 같은 칸이 때에 따라 다른 일을 하므로 **지금 무엇을 하는지 반드시 적는다.**
   * 적지 않으면 하려던 것과 다른 일이 일어나고, 그때는 이미 보낸 뒤다.
   */
  const label = ready
    ? '단어를 치면 그 물건이 화살표 자리에 떨어집니다'
    : soon
      ? '곧 칠 수 있습니다'
      : state.inputMode === 'chat'
        ? '지금 적는 말은 채팅으로 갑니다'
        : '차례를 기다립니다'
  const color = ready ? '#6bffb0' : soon ? '#e4e68a' : '#8bd6ff'
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
 * 한마디를 그 사람 이름표에 붙여 띄운다.
 *
 * 한곳에 목록으로 쌓지 않는 이유는 **누가 한 말인지 읽는 데 시간이 들기 때문이다.**
 * 판이 도는 동안 시선은 떨어지는 물건과 단어 밭에 가 있고, 이름을 훑어 짝지을 틈이 없다.
 * 이름표 위에 붙으면 위치 자체가 누구인지 말한다.
 *
 * 잠시 뒤 사라진다. 남겨두면 지나간 말이 계속 이름표를 덮어, 하트와 차례를 가린다.
 */
function Bubble({ line, tailX }: { line: ChatLine | null; tailX: number }) {
  const [shown, setShown] = useState<ChatLine | null>(null)
  const lineSeq = line?.seq
  const shownSeq = shown?.seq
  const lineRef = useRef<ChatLine | null>(line)
  const ref = useRef<HTMLSpanElement | null>(null)

  lineRef.current = line

  useEffect(() => {
    const next = lineRef.current
    if (next === null) {
      setShown(null)
      return
    }
    setShown(next)
    const timer = setTimeout(() => setShown(null), BUBBLE_MS)
    return () => clearTimeout(timer)
    // seq로만 다시 띄운다 — 같은 말을 매 프레임 되살리지 않는다
  }, [lineSeq])

  /*
   * 튀어나오는 이펙트.
   *
   * 그냥 나타나면 **판이 도는 중에는 눈에 안 들어온다** — 화면에서 이미 여러 가지가
   * 움직이고 있어서, 가만히 있는 것이 오히려 배경이 된다. 아래에서 살짝 올라오며
   * 한 번 커졌다 제자리로 오는 것으로 시선을 끈다.
   *
   * WAAPI로 돌린다. 엔진이 매 프레임 리렌더를 밀어 CSS transition은 끊긴다 —
   * 낙하 단어 칩에서 이미 밟은 함정이다.
   */
  useEffect(() => {
    if (shownSeq === undefined) {
      return
    }
    play(
      ref.current,
      [
        { transform: 'translateY(-6px) scale(0.8)', opacity: 0 },
        { transform: 'translateY(0) scale(1.08)', opacity: 1, offset: 0.55 },
        { transform: 'translateY(0) scale(1)', opacity: 1 },
      ],
      { duration: 320, easing: 'cubic-bezier(0.22, 1.2, 0.36, 1)' },
    )
  }, [shownSeq])

  if (shown === null) {
    return null
  }
  return (
    <span
      ref={ref}
      data-bubble={shown.text}
      style={{
        position: 'absolute',
        /*
         * 이름표 **아래**에 붙인다. 위에 두었더니 점수판이 화면 맨 위에 있어서
         * 말풍선이 통째로 잘려 아무것도 보이지 않았다.
         *
         * 가운데가 아니라 왼쪽 끝에 맞춘다 — 꼬리가 아이콘을 가리켜야 하는데
         * 아이콘은 이름표 왼쪽에 있고, 가운데 정렬이면 이름 길이에 따라 꼬리와
         * 아이콘의 거리가 사람마다 달라진다.
         */
        left: 0,
        top: 'calc(100% + 7px)',
        maxWidth: 220,
        padding: '6px 10px',
        borderRadius: 10,
        background: '#f2f4fb',
        color: '#151824',
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1.35,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        boxShadow: '0 6px 16px rgba(0, 0, 0, 0.45)',
        // 아레나 위로 올라와야 한다. 이름표 줄은 아레나보다 뒤에 그려진다
        zIndex: 5,
        pointerEvents: 'none',
      }}
    >
      {/*
        꼬리. **아이콘을 가리킨다** — 여덟이 붙으면 이름표가 다닥다닥 붙는데,
        누가 한 말인지는 꼬리가 어디를 향하느냐로 갈린다.
        테두리로 삼각형을 만든다. 그림자를 지우려고 따로 얹지 않았다.
      */}
      <span
        style={{
          position: 'absolute',
          top: -6,
          left: tailX - 6,
          width: 0,
          height: 0,
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderBottom: '6px solid #f2f4fb',
        }}
      />
      {shown.text}
    </span>
  )
}

/** 말풍선이 머무는 시간. 읽을 만큼은 남고, 다음 차례를 가릴 만큼은 아니어야 한다 */
const BUBBLE_MS = 4200

/**
 * 차례에 남은 시간.
 *
 * **평소에는 조용해야 한다.** 20초는 넉넉해서 성실히 치는 사람은 여기에 걸릴 일이
 * 없는데, 그 숫자가 처음부터 붉게 깜박이면 없던 조급함이 생긴다. 얼마 안 남았을
 * 때만 색이 바뀐다.
 */
function TurnClock({ left }: { left: number }) {
  const hurry = left <= TURN_HURRY_SEC
  const ref = useRef<HTMLSpanElement | null>(null)
  const beat = Math.ceil(left)

  // 다급해진 뒤로는 1초마다 한 번씩 뛴다. 소리 없이 알리는 유일한 길이다
  useEffect(() => {
    if (!hurry) {
      return
    }
    play(
      ref.current,
      [{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }],
      { duration: 380, easing: 'ease-out' },
    )
  }, [hurry, beat])

  return (
    <span
      ref={ref}
      data-turn-left={beat}
      style={{
        fontSize: 12,
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
        color: hurry ? '#ff6b6b' : '#6a7290',
        minWidth: 18,
        textAlign: 'right',
      }}
    >
      {beat}
    </span>
  )
}

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
        color: count > 0 ? '#e4e68a' : '#3a4160',
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
            data-heart-slot={slot}
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
  onChat,
  onRematch,
  onReturnToRoom,
  onLeave,
}: {
  state: MatchViewState
  onChat: (text: string) => void
  onRematch: () => void
  onReturnToRoom: () => void
  onLeave: () => void
}) {
  const won = state.winner === state.selfId
  const draw = state.winner === null
  const text = draw ? '무승부' : won ? '이겼습니다' : '졌습니다'
  const winnerName =
    state.players.find((player) => player.id === state.winner)?.nickname ?? null
  const iWantRematch = state.wantRematch.includes(state.selfId)
  const winsOf = new Map(state.wins)
  const nameOf = (id: string) =>
    state.players.find((player) => player.id === id)?.nickname ?? '이름없음'
  const showChat = state.inputMode === 'chat'
  const chatNotices = state.wantRematch.map((id) => {
    const nickname = state.players.find((player) => player.id === id)?.nickname ?? '누군가'
    return {
      id: `rematch-${id}`,
      text: `${withSubject(nickname)} 다음 판 준비를 마쳤습니다`,
    }
  })

  /*
   * 손이 키보드에 붙어 있는 게임이라 결과창도 키보드로 넘긴다. 여기서 마우스를 잡게
   * 하면 다음 판으로 이어지는 흐름이 매번 끊긴다 — 싱글 결과 화면과 같은 규칙이다.
   *
   * 상대가 나갔으면 '계속하기'가 아예 없다. 누를 수 없는 버튼을 남겨두면
   * "왜 안 되지"가 생기므로, 목록에서도 빼서 화살표가 그 자리를 지나가지 않게 한다.
   */
  const peerUnavailable = state.opponentLeft || state.connectionLost
  const canRematch = !peerUnavailable
  const canReturnToRoom = !state.ranked && !peerUnavailable
  const roomIndex = canRematch ? 1 : 0
  const items = [
    ...(canRematch ? [{ run: onRematch, disabled: iWantRematch }] : []),
    ...(canReturnToRoom ? [{ run: onReturnToRoom, disabled: false }] : []),
    { run: onLeave, disabled: false },
  ]
  const menu = useMenuKeys({
    count: items.length,
    navigateFromInput: showChat,
    onActivate: (index) => {
      const item = items[index]
      if (item !== undefined && !item.disabled) {
        item.run()
      }
    },
    // Escape는 나가는 것이다. 다시 붙는 것은 고르는 일이지 취소가 아니다
    onCancel: onLeave,
  })

  return (
    <div
      data-verdict={draw ? 'draw' : won ? 'win' : 'lose'}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(13, 15, 22, 0.88)',
        padding: 16,
        overflow: 'auto',
        zIndex: 8,
      }}
    >
      <div
        style={{
          width: showChat ? 'min(860px, 100%)' : 'min(380px, 100%)',
          display: 'grid',
          gridTemplateColumns: showChat
            ? 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))'
            : 'minmax(0, 1fr)',
          alignItems: 'center',
          gap: 28,
        }}
      >
        <div style={{ textAlign: 'center', display: 'grid', gap: 14, minWidth: 0 }}>
        <span
          style={{
            font: '700 46px/1.1 var(--sans)',
            color: draw ? '#b6bdd4' : won ? '#6bffb0' : '#ff6b6b',
          }}
        >
          {text}
        </span>
        {winnerName !== null && !draw && (
          <span style={{ color: '#b6bdd4', fontSize: 15 }}>{withSubject(winnerName)} 이겼습니다</span>
        )}
        {/*
          * 순위. **"이겼다/졌다"만으로는 여덟이 붙는 판에서 아무것도 알 수 없다** —
          * 2등과 꼴찌가 같은 문장을 읽는다. 늦게까지 버틴 순서를 그대로 보여준다.
          * 승수는 판을 거듭해 쌓인 값이라 옆에 함께 둔다(1등만 오른다).
          */}
        <ol
          data-standings={state.standings.length}
          style={{
            margin: 0,
            padding: '10px 14px',
            listStyle: 'none',
            display: 'grid',
            gap: 5,
            borderRadius: 12,
            border: '1px solid #232839',
            background: 'rgba(255, 255, 255, 0.025)',
            textAlign: 'left',
            minWidth: 260,
          }}
        >
          {state.standings.map((row) => {
            const mine = row.id === state.selfId
            const wins = winsOf.get(row.id) ?? 0
            return (
              <li
                key={row.id}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'baseline',
                  fontSize: 14,
                  color: mine ? '#e4e68a' : '#b6bdd4',
                  fontWeight: mine ? 700 : 400,
                }}
              >
                <span
                  style={{
                    width: 26,
                    textAlign: 'right',
                    color: row.placement === 1 ? '#e4e68a' : '#4a5171',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {row.placement}위
                </span>
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {nameOf(row.id)}
                  {mine && ' (나)'}
                </span>
                <span style={{ fontSize: 13, color: wins > 0 ? '#e4e68a' : '#3a4160' }}>
                  {wins > 0 ? `${wins}승` : '—'}
                </span>
              </li>
            )
          })}
        </ol>
        <TierPanel state={state} />

        {/*
          * 상대가 나갔으면 계속할 상대가 없다. 버튼을 남겨두고 눌리지 않게 하는 대신
          * 아예 치운다 — 누를 수 없는 버튼은 "왜 안 되지"를 만든다.
          */}
        {peerUnavailable ? (
          <span data-opponent-left style={{ color: '#ff6b6b', fontSize: 15 }}>
            {state.opponentLeft ? '상대가 로비로 나갔습니다' : '상대와의 연결이 끊겼습니다'}
          </span>
        ) : (
          <div data-rematch={iWantRematch ? 'waiting' : 'ready'}>
            <MenuButton
              selected={menu.index === 0}
              onClick={onRematch}
              onHover={() => menu.select(0)}
              disabled={iWantRematch}
              primary
            >
              {iWantRematch ? '상대를 기다립니다…' : '계속하기'}
            </MenuButton>
          </div>
        )}

        {canReturnToRoom && (
          <MenuButton
            selected={menu.index === roomIndex}
            onClick={onReturnToRoom}
            onHover={() => menu.select(roomIndex)}
          >
            대기방으로 돌아가기
          </MenuButton>
        )}

        <MenuButton
          selected={menu.index === items.length - 1}
          onClick={onLeave}
          onHover={() => menu.select(items.length - 1)}
        >
          로비로 나가기 (Esc)
        </MenuButton>

        <span style={{ fontSize: 12, color: '#4a5171' }}>
          ↑↓ 또는 Tab으로 고르고 Enter로 들어갑니다
        </span>
        </div>
        {showChat && (
          <div
            data-result-chat-panel
            style={{
              display: 'grid',
              alignContent: 'center',
              gap: 18,
              minWidth: 0,
              padding: '18px 0',
            }}
          >
            <MatchChatBox
              lines={state.chat}
              selfId={state.selfId}
              onSend={onChat}
              notices={chatNotices}
              autoFocus
            />
          </div>
        )}
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
        {who}의 물건이 떨어졌습니다
      </div>
      {/* 무적은 하트 위 베리어가 이미 보여준다 — 글로 한 번 더 말하면 읽을 것만 늘어난다 */}
      <div style={{ fontSize: 14, color: '#b6bdd4', marginTop: 4 }}>
        {who} 남은 하트 {hurt.lives}
      </div>
    </div>
  )
}

/**
 * 지금 누구 차례인지 아레나 위에 쪽지처럼 놓는다.
 *
 * 이름표에도 현재 턴이 표시되지만, 판을 보는 눈은 가운데 받침대를 좇는다. 그래서 같은 정보를
 * 가운데에서 한 번 더 말한다. 다만 턴은 매번 바뀌는 기본 정보라 히든처럼 크게 터뜨리지는 않는다.
 */
function TurnNotice({ state }: { state: MatchViewState }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const pulseRef = useRef<HTMLSpanElement | null>(null)
  const current = state.current
  const player = state.players.find((candidate) => candidate.id === current) ?? null
  const mine = current === state.selfId

  useEffect(() => {
    const frames = mine
      ? [
          { transform: 'translateY(-8px) scale(0.94)' },
          { transform: 'translateY(0) scale(1.06)', offset: 0.34 },
          { transform: 'translateY(0) scale(1)' },
        ]
      : [
          { transform: 'translateY(-4px) scale(0.98)' },
          { transform: 'translateY(0) scale(1)', offset: 0.22 },
        ]
    play(
      ref.current,
      frames,
      { duration: mine ? 520 : 360, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    )
  }, [current, mine])

  useEffect(() => {
    if (!mine) {
      return
    }
    const pulse = play(
      pulseRef.current,
      [
        { opacity: 0.45, transform: 'scale(0.98)' },
        { opacity: 0.9, transform: 'scale(1.05)', offset: 0.5 },
        { opacity: 0.45, transform: 'scale(0.98)' },
      ],
      { duration: 1400, easing: 'ease-in-out', iterations: Infinity },
    )
    return () => pulse?.cancel()
  }, [current, mine])

  if (current === null || player === null) {
    return null
  }

  return (
    <div
      ref={ref}
      data-turn-notice={current}
      style={{
        position: 'absolute',
        top: '9%',
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        textAlign: 'center',
        textShadow: '0 2px 12px rgba(13, 15, 22, 0.45)',
        zIndex: 2,
      }}
    >
      <div
        style={{
          position: 'relative',
          display: 'inline-grid',
          gap: 2,
          minWidth: mine ? 132 : 116,
          maxWidth: 'min(76vw, 320px)',
          padding: mine ? '9px 22px 10px' : '8px 18px 9px',
          borderRadius: 8,
          border: mine ? '1px solid #f0d778' : '1px solid #b89a4c',
          background: mine ? '#fff1bd' : 'rgba(122, 111, 83, 0.82)',
          boxShadow: mine
            ? '0 0 0 4px rgba(228, 230, 138, 0.16), 0 12px 34px rgba(8, 9, 14, 0.34)'
            : '0 8px 22px rgba(8, 9, 14, 0.18)',
          color: mine ? '#312716' : '#d9cfb1',
          transition:
            'background 280ms ease, border-color 280ms ease, box-shadow 280ms ease, color 280ms ease, padding 280ms ease, min-width 280ms ease',
        }}
      >
        <span
          ref={pulseRef}
          aria-hidden
          style={{
            position: 'absolute',
            inset: mine ? -7 : -4,
            borderRadius: 11,
            border: mine
              ? '1px solid rgba(228, 230, 138, 0.5)'
              : '1px solid rgba(228, 230, 138, 0)',
            boxShadow: mine
              ? '0 0 22px rgba(228, 230, 138, 0.28)'
              : '0 0 0 rgba(228, 230, 138, 0)',
            opacity: mine ? 0.7 : 0,
            transform: mine ? 'scale(1)' : 'scale(0.96)',
            transition:
              'opacity 280ms ease, transform 280ms ease, inset 280ms ease, border-color 280ms ease, box-shadow 280ms ease',
          }}
        />
        <span
          style={{
            position: 'relative',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: mine ? 21 : 18,
            fontWeight: mine ? 900 : 800,
            opacity: mine ? 1 : 0.82,
            transition: 'font-size 260ms ease, opacity 260ms ease, color 260ms ease',
          }}
        >
          {mine ? '내 턴' : `${player.nickname} 턴`}
        </span>
        {state.turnLeft !== null && (
          <span
            style={{
              position: 'relative',
              fontSize: 11,
              fontWeight: mine ? 800 : 500,
              color: mine ? '#7a5d08' : '#b9ad90',
              opacity: mine ? 1 : 0.78,
            }}
          >
            {Math.ceil(state.turnLeft)}초
          </span>
        )}
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

  /*
   * 사다리에 올리지 않는 판. **"못 올렸다"가 아니라 "안 올린다"**로 말해야 한다 —
   * 고장으로 읽히면 다시 해보게 되고, 그래도 같은 화면이 나온다.
   */
  if (ranking.status === 'casual') {
    return (
      <span style={{ fontSize: 13, color: '#6a7290' }} data-tier-casual>
        친선전이라 티어 점수는 그대로입니다
      </span>
    )
  }
  if (ranking.status === 'offline') {
    return <span style={{ fontSize: 13, color: '#4a5171' }}>티어를 받지 못했습니다</span>
  }
  if (ranking.status === 'pending') {
    return <span style={{ fontSize: 13, color: '#6a7290' }}>상대의 보고를 기다립니다…</span>
  }
  if (ranking.status === 'disputed') {
    return (
      <span style={{ fontSize: 13, color: '#ff6b6b' }}>
        양쪽 기록이 어긋나 이 판은 티어에 반영되지 않았습니다
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
