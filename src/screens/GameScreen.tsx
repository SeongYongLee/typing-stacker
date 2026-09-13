import { useCongestionTone } from '../hooks/useCongestionTone.ts'
import { congestionLevel, congestionPeriod } from '../game/renderer/congestionSignal.ts'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { InputBar } from '../components/InputBar.tsx'
import { StackArena } from '../components/StackArena.tsx'
import { ArenaBackdrop } from '../components/ArenaBackdrop.tsx'
import { OptionsScreen } from './OptionsScreen.tsx'
import { PauseOverlay } from './PauseOverlay.tsx'
import { TypingLane } from '../components/TypingLane.tsx'
import { ARENA_SCREEN_MAX_WIDTH } from '../game/config.ts'
import type { GameEngine, GameState } from '../game/core/GameEngine.ts'
import { useHangulInput } from '../hooks/useHangulInput.ts'
import { useTypingSound } from '../hooks/useAudio.ts'
import { tutorialGuide } from './tutorialGuide.ts'
import { play } from '../components/animate.ts'

interface GameScreenProps {
  engine: GameEngine
  state: GameState
  onRestart: () => void
  onHome: () => void
  arena?: ReactNode
  windowLight?: boolean
  showRanking?: boolean
}

/** 옵션이 판 위에 뜰 때 쓰는 층. 일시정지 화면과 같은 어둡기라 자리가 이어져 보인다 */
const overlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(13, 15, 22, 0.82)',
  zIndex: 11,
}

const rootStyle: CSSProperties = {
  // 일시정지 화면이 이 안에서 전체를 덮으려면 기준점이 필요하다
  position: 'relative',
  display: 'grid',
  gridTemplateRows: 'minmax(0, 1fr) auto',
  overflow: 'hidden',
  height: '100%',
}

/** 아레나 캔버스가 깔리는 층. 레인은 이 위에 얹힌다 */
const fieldLayerStyle: CSSProperties = {
  position: 'relative',
  minHeight: 0,
}

/** 가장 긴 단어가 잘리지 않는 최소 레인 폭(px). 크리스마스트리가 153px이다 */
const LANE_MIN_WIDTH = 172

const fieldStyle: CSSProperties = {
  position: 'relative',
  display: 'grid',
  /*
   * 레인 폭을 제한해 단어가 화면 양끝으로 벌어지지 않게 한다 —
   * 아레나에서 눈을 떼지 않고도 좌우 단어가 시야에 들어와야 한다.
   *
   * 다만 아래로도 한계가 있다. 레인을 0까지 줄일 수 있게 뒀더니 1024px 아래에서
   * 레인이 143px이 되어 가장 긴 단어(크리스마스트리, 153px)가 잘렸다.
   * 좁아지면 레인이 아니라 아레나가 먼저 줄어들어야 한다 — 아레나는 줄어도
   * 안에 있는 것이 다 보이지만 잘린 단어는 칠 수가 없다.
   */
  gridTemplateColumns: `minmax(${LANE_MIN_WIDTH}px, 340px) minmax(260px, ${ARENA_SCREEN_MAX_WIDTH}px) minmax(${LANE_MIN_WIDTH}px, 340px)`,
  justifyContent: 'center',
  gap: 16,
  width: '100%',
  maxWidth: 1200,
  height: '100%',
  margin: '0 auto',
  padding: '12px 20px 0',
  minHeight: 0,
}

function GameScreen({ engine, state, onRestart, onHome, arena, showRanking = true, windowLight = true }: GameScreenProps) {

  const guide = tutorialGuide(state.stage)
  const submit = useCallback((text: string) => {
    if (!guide?.waiting) engine.submit(guide?.action ? '' : text)
  }, [engine, guide?.waiting, guide?.action])
  // 빈 Enter는 평소에는 무시한다. 경보 데모를 시작하는 이 짧은 순간에만 엔진으로 보낸다.
  const input = useHangulInput(submit, guide?.action != null)
  const { focus, clear } = input

  const paused = state.phase === 'paused'
  // 옵션은 일시정지 위에 얹힌다 — 닫으면 멈춘 자리로 그대로 돌아온다
  const [options, setOptions] = useState(false)

  useTypingSound(input.tapSeq)

  /*
   * Escape는 판을 멈춘다. 입력칸에 포커스가 있어도 들어야 하므로 window에서 듣는다 —
   * 이 게임은 판이 도는 내내 입력칸에 포커스가 있다.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }
      event.preventDefault()
      engine.pause()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [engine])

  // 판으로 돌아오면 곧바로 칠 수 있어야 한다
  const resume = useCallback(() => {
    engine.resume()
    focus()
  }, [engine, focus])

  /*
   * 멈추면 입력칸에서 포커스를 뗀다.
   *
   * 이 게임은 판이 도는 내내 입력칸에 포커스가 있다. 그대로 두면 일시정지 메뉴와
   * 결과 화면의 화살표·Enter가 전부 입력칸의 것으로 가서 메뉴가 움직이지 않는다.
   * 판이 돌지 않는 동안에는 포커스를 떼어 둔다.
   */
  useEffect(() => {
    if (state.phase !== 'playing') {
      input.ref.current?.blur()
    }
  }, [state.phase, input.ref])

  /**
   * 판이 새로 시작되면 지난 판의 잔여 텍스트를 비우고 포커스를 되돌린다.
   * runSeq로 거는 이유는 Enter로 시작했든 "다시 하기" 버튼을 마우스로 눌렀든
   * (버튼이 포커스를 훔쳐간다) 똑같이 바로 입력할 수 있어야 하기 때문이다.
   */
  useEffect(() => {
    clear()
    focus()
  }, [state.runSeq, clear, focus])

  // 경보 데모는 화면을 멈춘 채 빈 Enter를 기다린다. 스테이지 전환 때 빠졌던 포커스를
  // 여기서 되돌려야 설명을 읽고 바로 한 번 눌러볼 수 있다.
  useEffect(() => {
    if (
      state.phase === 'playing' &&
      (
        state.stage.congestionDemo === 'ready' ||
        state.stage.congestionDemo === 'congestionGuide' ||
        state.stage.congestionDemo === 'full' ||
        state.stage.congestionDemo === 'gameOverPrompt' ||
        state.stage.tutorialStep === 0 ||
        state.stage.tutorialStep === 4 ||
        state.stage.tutorialStep === 5 ||
        state.stage.tutorialStep === 6
      )
    ) {
      focus()
    }
  }, [state.phase, state.stage.congestionDemo, state.stage.tutorialStep, focus])

  const collapsing = state.phase === 'collapsing'
  const activeWhiteboard = state.activeWhiteboard
  const tutorialGaugeGuide =
    state.phase === 'playing' &&
    (state.stage.congestionDemo === 'congestionGuide' || state.stage.congestionDemo === 'full')
  const tutorialRemainingGuide =
    state.phase === 'playing' &&
    state.stage.congestionDemo === 'ready'
  const tutorialBoxGuide = state.phase === 'playing' && state.stage.tutorialStep === 0
  const tutorialWhiteboardGuide = state.phase === 'playing' && state.stage.tutorialStep === 7 && state.stage.congestionDemo === null
  const congestionImminent = state.phase === 'playing' && (
    (state.stage.id > 0 && state.stage.congestion >= 80) ||
    (state.stage.congestionRush && (
      state.stage.id > 0 ||
      state.stage.congestionDemo === 'full' ||
      state.stage.congestionDemo === 'falling'
    ))
  )

  return (
    <div data-game-screen data-paused={state.phase === 'paused'} data-game-layout="desktop" data-phase={state.phase} style={rootStyle} onMouseDown={paused ? undefined : input.keepFocus}>
      {/*
       * 보관소는 **화면 전체**에 깔린다. 판이 도는 칸에만 두었더니 위아래 띠에서
       * 방이 끊겨, 배경이 아니라 판에 붙은 그림처럼 보였다. 위아래 띠를 반투명으로
       * 두고 그 뒤로 같은 방이 이어지게 하면 판이 방 안에 놓인 것으로 읽힌다.
       */}
      <ArenaBackdrop
        windowLight={windowLight}
        mode="solo"
        time={state.timeOfDay}
        whiteboard={state.whiteboard}
        activeWhiteboard={activeWhiteboard}
        whiteboardReminder={state.whiteboardReminder}
      />
      {windowLight && congestionImminent && <CongestionWarning />}
      <div style={fieldLayerStyle}>
        {arena ?? <StackArena engine={engine} />}
        {tutorialGaugeGuide && <TutorialGaugeSpotlight />}
        {tutorialRemainingGuide && <TutorialRemainingSpotlight />}
        {tutorialBoxGuide && <TutorialBoxSpotlight />}
        {tutorialWhiteboardGuide && <TutorialWhiteboardSpotlight />}
        {windowLight && state.stage.congestionBurst > 0 && <CongestionBurst />}
        <StageStatus
          stage={state.stage}
          missSeq={state.stats.missedWords}
          congestionRecoverySeq={state.stage.congestionRecoverySeq}
        />
        {state.stage.notice !== null && <StageNotice notice={state.stage.notice} />}
        <div style={fieldStyle}>
          <TypingLane
            words={state.words}
            side="left"
            missSeq={state.stats.missedWords}
            congestionRush={state.stage.congestionRush}
            showCongestionAbsorption={state.stage.id > 0}
            wordMarks={state.wordMarks}
            mergeSizes={state.wordMergeSizes}
            mergeHints={state.wordMergeHints}
            pairPulse={state.pairPulse}
          />
          {/* data-aim은 화살표 위치(-1~1). 자동화 테스트가 조준을 읽는 유일한 통로다 */}
          <div
            style={{ position: 'relative', minHeight: 0 }}
            data-aim={state.aimNormalized.toFixed(3)}
          >
            {collapsing && <CollapseOverlay />}
          </div>
          <TypingLane
            words={state.words}
            side="right"
            missSeq={state.stats.missedWords}
            congestionRush={state.stage.congestionRush}
            showCongestionAbsorption={state.stage.id > 0}
            wordMarks={state.wordMarks}
            mergeSizes={state.wordMergeSizes}
            mergeHints={state.wordMergeHints}
            pairPulse={state.pairPulse}
          />
        </div>
      </div>

      <InputBar
        showRanking={showRanking}
        input={input}
        feedback={state.feedback}
        stats={state.stats}
        nightfall={state.timeOfDay.nightfall}
        locked={guide?.waiting}
        instruction={guide ? guide.action ? `Enter · ${guide.action}` : guide.waiting ? '잠시 지켜보세요' : '단어를 입력하고 Enter' : undefined}
      />

      {state.complexMergeFocus !== null && (
        <ComplexMergeSpotlight progress={state.complexMergeFocus} />
      )}

      {/* 화면 전체를 덮는다. 아레나 안쪽에만 두면 HUD와 입력칸이 살아 있는 것처럼 보인다 */}
      {paused && !options && (
        <PauseOverlay
          onResume={resume}
          onRestart={onRestart}
          onHome={onHome}
          onOptions={() => setOptions(true)}
        />
      )}
      {paused && options && (
        <div style={overlayStyle}>
          <OptionsScreen onBack={() => setOptions(false)} />
        </div>
      )}
    </div>
  )
}

/**
 * 다중 합성 슬로모션이 성능 저하가 아니라 의도된 집중 장면으로 읽히게 한다.
 * 실제 합성 공개 연출이 뜨는 상단 중앙은 비워 두고, 나머지 게임 화면만 부드럽게 누른다.
 */
function ComplexMergeSpotlight({ progress }: { progress: number }) {
  const fadeIn = Math.min(progress / 0.16, 1)
  const fadeOut = Math.min((1 - progress) / 0.28, 1)
  const linearOpacity = Math.max(0, Math.min(fadeIn, fadeOut))
  const opacity = linearOpacity * linearOpacity * (3 - 2 * linearOpacity)

  return (
    <div
      aria-hidden
      data-complex-merge-spotlight
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 7,
        pointerEvents: 'none',
        opacity,
        background:
          'radial-gradient(ellipse 290px 235px at 50% max(96px, 20%), transparent 0%, transparent 56%, rgba(5, 7, 12, 0.28) 76%, rgba(5, 7, 12, 0.76) 100%)',
      }}
    />
  )
}

/** 실제 혼잡 물건 한 개가 보관함에서 반입되는 순간의 신호. */
function CongestionBurst() {
  return (
    <div
      aria-hidden
      data-congestion-burst
      style={{
        position: 'absolute',
        top: 46,
        left: '50%',
        zIndex: 3,
        width: 44,
        height: 52,
        pointerEvents: 'none',
        transform: 'translateX(-50%)',
        opacity: 1,
      }}
    >
      <style>{`@keyframes congestion-crate-fall {
        from { transform: translateY(-46px) rotate(-10deg) scale(.72); opacity: 0; }
        14% { opacity: 1; }
        to { transform: translateY(92px) rotate(14deg) scale(1); opacity: 0; }
      }`}</style>
      <i
        style={{
          position: 'absolute',
          inset: 0,
          width: 32,
          height: 26,
          border: '3px solid #ffd28c',
          borderRadius: 3,
          background: '#bd4c37',
          boxShadow: '0 0 13px rgba(255, 92, 69, .9), inset 0 0 0 3px rgba(83, 27, 24, .24)',
          animation: 'congestion-crate-fall .42s cubic-bezier(.16,.72,.28,1) both',
        }}
      />
    </div>
  )
}

/** 경보를 처음 설명할 때는 게이지 밖을 어둡게 해 시선이 다른 정보로 새지 않게 한다. */
function TutorialGaugeSpotlight() {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        top: 38,
        left: '50%',
        zIndex: 5,
        width: 276,
        height: 52,
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        boxShadow: '0 0 0 100vmax rgba(5, 7, 12, 0.72)',
        borderRadius: 6,
      }}
    />
  )
}

/** 첫 회수 직후에는 경보 안내와 같은 방식으로 남은 회수물 영역만 밝게 남긴다. */
function TutorialRemainingSpotlight() {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        top: 6,
        left: '50%',
        zIndex: 5,
        width: 'min(360px, calc(100vw - 24px))',
        height: 36,
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        boxShadow: '0 0 0 100vmax rgba(5, 7, 12, 0.72)',
        borderRadius: 6,
      }}
    />
  )
}

/** 첫 장에서는 실제 물리 상자만 남겨, 단어가 어디로 떨어지는지 먼저 읽게 한다. */
function TutorialBoxSpotlight() {
  return (
    <div
      aria-hidden
      style={{
        // 필드 내부의 절대 배치 기준은 레인 높이에 따라 달라진다. 상자는 화면 안의
        // 고정된 물리 보관함이므로 뷰포트 기준으로 잡아야 딤 구멍이 어긋나지 않는다.
        position: 'fixed',
        // 투명 수납함을 넓히고 판정선에 맞춰 위로 옮긴 뒤에도 예전 작은 구멍을 그대로
        // 써서 윗테두리와 양옆이 어두워졌다. 튜토리얼 1단계 수납함 전체보다 사방으로
        // 조금 넓게 남겨, 상자 전체가 한 덩어리로 강조되게 한다.
        // 윗부분은 그대로 두고 아래쪽만 20px 더 열어 투명한 바닥과 하단 윤곽까지 보인다.
        top: 'calc(74.75% + 10px)',
        left: '50%',
        zIndex: 5,
        width: 'min(470px, 54vw)',
        height: 'min(140px, 17vh)',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        borderRadius: 12,
        boxShadow: '0 0 0 100vmax rgba(5, 7, 12, 0.72)',
      }}
    />
  )
}

/** 회수 규칙을 처음 배울 때 화이트보드만 남기고 주변을 어둡게 한다. */
function TutorialWhiteboardSpotlight() {
  return (
    <div
      aria-hidden
      style={{
        // 실제 화이트보드는 화면 상단 중앙에 있다. 하단의 물리 상자와 분리해 보드
        // 테두리와 목록만 남기도록 화면 기준 좌표를 사용한다.
        position: 'fixed',
        top: '32%',
        left: '50.5%',
        zIndex: 5,
        width: 'min(560px, 62vw)',
        height: 'min(280px, 42vh)',
        // 가로만 옮겨서 강조 영역이 보드 아래에 붙어 있었다. 보드 중심을 기준으로
        // 가로·세로 모두 맞춘다.
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        borderRadius: 12,
        boxShadow: '0 0 0 100vmax rgba(5, 7, 12, 0.72)',
      }}
    />
  )
}

/** 다음 놓침에 혼잡 반입이 시작되는 구간. 시선을 빼앗지 않도록 천천히만 점멸한다. */
function CongestionWarning() {
  return (
    <div
      aria-hidden
      data-congestion-imminent
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 3,
        pointerEvents: 'none',
        boxSizing: 'border-box',
        border: '5px solid rgba(255, 91, 86, 0.72)',
        boxShadow: 'inset 0 0 42px rgba(255, 66, 72, 0.32), 0 0 26px rgba(255, 69, 70, 0.22)',
        animation: 'congestion-imminent-pulse 1.9s ease-in-out infinite',
      }}
    >
      <style>{`@keyframes congestion-imminent-pulse {
        0%, 100% { opacity: .32; }
        50% { opacity: .9; }
      }`}</style>
    </div>
  )
}

function StageNotice({ notice }: { notice: NonNullable<GameState['stage']['notice']> }) {
  const isStart = notice.kind === 'start'
  const progress = notice.target === null ? '튜토리얼' : `${notice.returns} / ${notice.target} 회수`
  const duration = isStart ? '1.35s' : '2.1s'
  return (
    <div
      aria-live="polite"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 8,
        display: 'grid',
        placeItems: 'center',
        pointerEvents: 'none',
        background: 'rgba(8, 11, 18, 0.28)',
      }}
    >
      <style>{`@keyframes stage-notice-in-out {
        0% { opacity: 0; transform: translateY(18px) scale(.94); }
        16% { opacity: 1; transform: translateY(0) scale(1); }
        82% { opacity: 1; transform: translateY(0) scale(1); }
        100% { opacity: 0; transform: translateY(-10px) scale(1.025); }
      }`}</style>
      <div
        style={{
          display: 'grid',
          justifyItems: 'center',
          gap: 9,
          padding: '22px 30px',
          border: '1px solid var(--rule)',
          borderRadius: 1,
          background: 'var(--paper)',
          boxShadow: '3px 4px 0 rgba(43, 37, 27, .25)',
          color: 'var(--ink)',
          animation: `stage-notice-in-out ${duration} cubic-bezier(.22,.61,.36,1) both`,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--stamp)' }}>
          {isStart ? '새 보관함' : '보관함 정산'}
        </span>
        <strong style={{ fontSize: 28, lineHeight: 1.15 }}>{notice.title}</strong>
        {isStart ? (
          <span style={{ fontSize: 16, color: 'var(--ink-muted)' }}>{progress}</span>
        ) : (
          <span style={{ fontSize: 16, color: 'var(--ink-muted)' }}>
            {progress} · +{notice.score.toLocaleString()}점
          </span>
        )}
      </div>
    </div>
  )
}

function StageStatus({
  stage,
  missSeq,
  congestionRecoverySeq,
}: {
  stage: GameState['stage']
  missSeq: number
  congestionRecoverySeq: number
}) {
  const alarm = congestionLevel(stage.congestion, stage.congestionRush)
  const congestionTone = useCongestionTone(stage.congestion, stage.congestionRush, congestionRecoverySeq)
  const remaining = stage.target === null ? null : Math.max(stage.target - stage.returns, 0)
  // 경보를 처음 설명할 때 게이지와 행동 안내는 하나의 정보다. 딤보다 위에 함께 둔다.
  const tutorialGuideActive =
    (stage.congestionDemo === 'ready' ||
      stage.congestionDemo === 'congestionGuide' ||
      stage.congestionDemo === 'full') ||
    stage.tutorialStep === 0 ||
    stage.tutorialStep === 7 ||
    stage.tutorialStep === 6
  const guide = tutorialGuide(stage)
  const tutorialProgress = guide?.title.split(' · ')[0] ?? null
  const congestionGaugeRef = useRef<HTMLDivElement | null>(null)
  const congestionRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (missSeq === 0 || stage.id === 0 || stage.congestionRush) return
    const animation = play(
      congestionRef.current,
      [
        { transform: 'scaleY(1)', filter: 'brightness(1)' },
        { transform: 'scaleY(1.45)', filter: 'brightness(1.35)', offset: 0.28 },
        { transform: 'scaleY(1)', filter: 'brightness(1)' },
      ],
      { duration: 1300, easing: 'cubic-bezier(.18,.78,.28,1)' },
    )
    return () => animation?.cancel()
  }, [missSeq, stage.id, stage.congestionRush])

  useEffect(() => {
    if (congestionRecoverySeq === 0 || stage.id === 0 || stage.congestionRush) return
    const animation = play(
      congestionGaugeRef.current,
      [
        {
          borderColor: 'rgba(255, 221, 145, 0.82)',
          boxShadow: '0 2px 10px rgba(0,0,0,0.45)',
        },
        {
          borderColor: 'rgba(91, 239, 151, 1)',
          boxShadow: '0 0 12px rgba(69, 235, 137, .9), inset 0 0 7px rgba(69, 235, 137, .5)',
          offset: 0.18,
        },
        {
          borderColor: 'rgba(91, 239, 151, 1)',
          boxShadow: '0 0 9px rgba(69, 235, 137, .7), inset 0 0 5px rgba(69, 235, 137, .35)',
          offset: 0.72,
        },
        {
          borderColor: 'rgba(255, 221, 145, 0.82)',
          boxShadow: '0 2px 10px rgba(0,0,0,0.45)',
        },
      ],
      { duration: 1350, easing: 'cubic-bezier(.18,.78,.28,1)' },
    )
    return () => animation?.cancel()
  }, [congestionRecoverySeq, stage.id, stage.congestionRush])

  return (
    <div
      style={{
        position: 'absolute',
        top: 10,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: tutorialGuideActive ? 6 : 4,
        display: 'grid',
        justifyItems: 'center',
        gap: 5,
        pointerEvents: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {tutorialProgress === null ? (
          <div
            data-stage-title={stage.id}
            style={{
              padding: '5px 10px',
              border: '1px solid var(--rule)',
              borderRadius: 1,
              background: 'var(--paper)',
              color: 'var(--ink)',
              fontWeight: 700,
              fontSize: 15,
            }}
          >
            {stage.title}
          </div>
        ) : (
          <div
            style={{
              padding: '5px 10px',
              border: '1px solid var(--rule)',
              borderRadius: 1,
              background: 'var(--paper)',
              color: 'var(--ink)',
              fontWeight: 700,
              fontSize: 15,
            }}
          >
            튜토리얼 {tutorialProgress}
          </div>
        )}
        {remaining !== null && (
          <div
            data-remaining-recalls={remaining}
            style={{
              padding: '5px 9px',
              border: '1px solid var(--rule)',
              borderRadius: 1,
              background: 'var(--paper-shade)',
              color: 'var(--ink)',
              fontWeight: 800,
              fontSize: 14,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            회수물 {remaining}개 남음
          </div>
        )}
      </div>
      {(stage.id > 0 || stage.congestionDemo !== null) && (
        <div
          ref={congestionGaugeRef}
          data-congestion-gauge
          data-congestion-recovery-seq={congestionRecoverySeq}
          aria-label={`혼잡 경보 ${Math.round(stage.congestion)}%`}
          style={{
            width: 250,
            height: 14,
            padding: 2,
            border: '1px solid rgba(255, 221, 145, 0.82)',
            borderRadius: 3,
            background: 'rgba(23, 28, 36, 0.88)',
            boxShadow: '0 2px 10px rgba(0,0,0,0.45)',
          }}
        >
          <div
            style={{
              width: `${stage.congestionRush ? 100 : stage.congestion}%`,
              height: '100%',
              borderRadius: 3,
              background: stage.congestionRush
                ? 'linear-gradient(90deg, #d49a54, #b86338)'
                : 'linear-gradient(90deg, #e5c17b, #c88849)',
              transition: 'width 1.3s cubic-bezier(.18,.78,.28,1)',
              boxShadow: undefined,
            }}
            ref={congestionRef}
          />
        </div>
      )}
      {(stage.id > 0 || stage.congestionDemo !== null) && (
        <span
          style={{
            display: 'inline-block',
            padding: '2px 8px',
            fontSize: 12,
            fontWeight: 800,
            ...congestionTone.style,
            animation: alarm > 0 ? `congestion-stamp ${congestionPeriod(alarm)}s ease-in-out infinite` : undefined,
          }}
          data-congestion-tone={congestionTone.tone}
          data-congestion-stamp
        >
          <style>{`@keyframes congestion-stamp {
            0%, 100% { opacity: .88; } 50% { opacity: 1; }
          }
          @media (prefers-reduced-motion: reduce) { [data-congestion-stamp] { animation: none !important; } }
          [data-game-screen][data-paused="true"] [data-congestion-stamp] { animation-play-state: paused !important; }`}</style>
          혼잡 경보
        </span>
      )}
      {stage.id > 0 && (stage.congestionRecovery?.combo === true || stage.congestionRecovery?.crafted === true) && !stage.congestionRush && (
        <span
          key={congestionRecoverySeq}
          data-combo-recovery={stage.congestionRecovery.combo ? stage.congestionRecovery.amount : undefined}
          data-craft-recovery={stage.congestionRecovery.crafted ? stage.congestionRecovery.amount : undefined}
          style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            width: 'max-content',
            color: '#8ff0af',
            fontSize: 13,
            fontWeight: 800,
            textShadow: '0 1px 3px #111',
            animation: 'combo-congestion-recovery 1.35s ease-out both',
          }}
        >
          <style>{`@keyframes combo-congestion-recovery {
            0% { opacity: 0; transform: translate(-50%, 4px); }
            15%, 70% { opacity: 1; transform: translate(-50%, 0); }
            100% { opacity: 0; transform: translate(-50%, -5px); }
          }`}</style>
          {stage.congestionRecovery.crafted ? '합성 정리' : '콤보 회복'} −{stage.congestionRecovery.amount}
        </span>
      )}
      {guide !== null && (
        <div
          aria-live="polite"
          aria-label={`튜토리얼 ${guide.title}`}
          style={{
            maxWidth: 360,
            padding: '9px 12px',
            borderRadius: 1,
            background: 'var(--paper)',
            color: 'var(--ink)',
            fontSize: 16,
            fontWeight: 600,
            textAlign: 'center',
          }}
        >
          <strong style={{ display: 'block', marginBottom: 3, color: 'var(--stamp)', fontSize: 13 }}>
            {guide.title}
          </strong>
          {guide.text}
        </div>
      )}
    </div>
  )
}

function CollapseOverlay() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          fontSize: 44,
          fontWeight: 700,
          color: '#ff6b6b',
          letterSpacing: '0.1em',
          textShadow: '0 4px 24px rgba(0, 0, 0, 0.8)',
        }}
      >
        무너졌다
      </span>
    </div>
  )
}

export { GameScreen }
