import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { play } from '../components/animate.ts'
import { Hud } from '../components/Hud.tsx'
import { InputBar } from '../components/InputBar.tsx'
import { StackArena } from '../components/StackArena.tsx'
import { TypingLane } from '../components/TypingLane.tsx'
import { ARENA_SCREEN_MAX_WIDTH, LIVES } from '../game/config.ts'
import type { GameEngine, GameState } from '../game/core/GameEngine.ts'
import { useHangulInput } from '../hooks/useHangulInput.ts'

interface GameScreenProps {
  engine: GameEngine
  state: GameState
}

const rootStyle: CSSProperties = {
  display: 'grid',
  gridTemplateRows: 'auto 1fr auto',
  height: '100%',
}

/** 아레나 캔버스가 깔리는 층. 레인은 이 위에 얹힌다 */
const fieldLayerStyle: CSSProperties = {
  position: 'relative',
  minHeight: 0,
}

const fieldStyle: CSSProperties = {
  position: 'relative',
  display: 'grid',
  // 레인 폭을 제한해 단어가 화면 양끝으로 벌어지지 않게 한다 —
  // 아레나에서 눈을 떼지 않고도 좌우 단어가 시야에 들어와야 한다
  gridTemplateColumns: `minmax(0, 340px) minmax(320px, ${ARENA_SCREEN_MAX_WIDTH}px) minmax(0, 340px)`,
  justifyContent: 'center',
  gap: 16,
  width: '100%',
  maxWidth: 1200,
  height: '100%',
  margin: '0 auto',
  padding: '16px 20px 0',
  minHeight: 0,
}

function GameScreen({ engine, state }: GameScreenProps) {
  const submit = useCallback((text: string) => engine.submit(text), [engine])
  const input = useHangulInput(submit)
  const { focus, clear } = input

  /**
   * 판이 새로 시작되면 지난 판의 잔여 텍스트를 비우고 포커스를 되돌린다.
   * runSeq로 거는 이유는 Enter로 시작했든 "다시 하기" 버튼을 마우스로 눌렀든
   * (버튼이 포커스를 훔쳐간다) 똑같이 바로 입력할 수 있어야 하기 때문이다.
   */
  useEffect(() => {
    clear()
    focus()
  }, [state.runSeq, clear, focus])

  // 남은 목숨이 0이면 곧 결과 화면이 덮으므로 알리지 않는다
  const lifeLost = useMomentNotice(
    state.stats.lives,
    (previous, next) => previous > next && next > 0,
  )
  // 규칙을 배우는 순간은 처음 놓쳤을 때다. 그 뒤로는 알고 있으니 알리지 않는다
  const firstMiss = useMomentNotice(
    state.stats.missedWords,
    (previous, next) => next > previous && next === 1,
  )
  const collapsing = state.phase === 'collapsing'

  return (
    <div style={rootStyle} onPointerDown={focus}>
      <Hud stats={state.stats} elapsed={state.elapsed} />

      <div style={fieldLayerStyle}>
        <StackArena engine={engine} />
        <div style={fieldStyle}>
          <TypingLane words={state.words} side="left" />
          {/* data-aim은 화살표 위치(-1~1). 자동화 테스트가 조준을 읽는 유일한 통로다 */}
          <div
            style={{ position: 'relative', minHeight: 0 }}
            data-aim={state.aimNormalized.toFixed(3)}
          >
            {firstMiss !== null && <FirstMissNotice key={firstMiss.seq} />}
            {lifeLost !== null && (
              <LifeLossNotice key={lifeLost.seq} remaining={lifeLost.value} />
            )}
            {collapsing && <CollapseOverlay />}
          </div>
          <TypingLane words={state.words} side="right" />
        </div>
      </div>

      <InputBar input={input} feedback={state.feedback} stats={state.stats} />
    </div>
  )
}

interface Moment {
  /** 같은 값이 다시 와도 연출이 다시 돌게 하는 일회용 키 */
  readonly seq: number
  readonly value: number
}

const NOTICE_MS = 1500

/**
 * 값이 바뀌는 순간을 잡아 잠깐 떠 있을 알림을 만든다.
 * 엔진은 매 프레임 스냅샷만 밀어주므로 "직전 값과 비교"가 유일하게 믿을 수 있는 신호다.
 */
function useMomentNotice(
  value: number,
  isMoment: (previous: number, next: number) => boolean,
): Moment | null {
  const [notice, setNotice] = useState<Moment | null>(null)
  const previous = useRef(value)
  const seq = useRef(0)
  const timer = useRef(0)

  useEffect(() => {
    const moment = isMoment(previous.current, value)
    previous.current = value
    if (!moment) {
      return
    }
    seq.current += 1
    setNotice({ seq: seq.current, value })
    /*
     * 사라지는 타이머를 value에 매달지 않는다.
     *
     * 정리 함수로 되돌리면 **표시 중에 값이 또 바뀔 때** 그 타이머가 지워진다.
     * 그 변화가 알릴 일이 아니면(놓친 단어가 1 → 2처럼) 새 타이머도 걸리지 않아
     * 알림이 화면에 영원히 남는다. 게다가 연출 애니메이션에는 fill이 없어서
     * 끝나면 opacity 1로 되돌아오므로, 남은 알림은 흐려지지도 않고 그대로 보인다.
     * 타이머의 주인은 알림 자신이다 — 새 알림이 뜰 때만 교체된다.
     */
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setNotice(null), NOTICE_MS)
    // isMoment는 매 렌더 새로 만들어지므로 의존성에서 뺀다 — 값이 바뀔 때만 판정한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useEffect(() => () => clearTimeout(timer.current), [])

  return notice
}

/** 알림은 아레나 위에 떠서 잠깐 있다 사라진다 — top으로 서로 겹치지 않게 자리를 나눈다 */
function Notice({
  top,
  children,
}: {
  top: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    play(
      ref.current,
      [
        { opacity: 0, transform: 'translateY(12px) scale(0.92)' },
        { opacity: 1, transform: 'none', offset: 0.14 },
        { opacity: 1, transform: 'none', offset: 0.72 },
        { opacity: 0, transform: 'translateY(-8px)' },
      ],
      // fill을 두지 않으면 애니메이션이 끝난 뒤 기본 스타일(opacity 1)로 되돌아온다.
      // 알림을 지우는 쪽이 한 번이라도 어긋나면 그대로 화면에 박혀버리므로,
      // 쉬는 자리를 "사라진 상태"로 둔다
      { duration: NOTICE_MS, easing: 'ease-out', fill: 'forwards' },
    )
  }, [])

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        top,
        left: 0,
        right: 0,
        display: 'grid',
        justifyItems: 'center',
        gap: 6,
        pointerEvents: 'none',
      }}
    >
      {children}
    </div>
  )
}

const noticeHeadStyle: CSSProperties = {
  fontSize: 34,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textShadow: '0 4px 20px rgba(0, 0, 0, 0.85)',
}

const noticeLineStyle: CSSProperties = {
  fontSize: 14,
  color: '#f2f4fb',
  textShadow: '0 2px 12px #0d0f16',
}

/** 목숨을 잃은 이유는 아레나에서 벌어지므로, 규칙도 그 자리에서 알려준다 */
function LifeLossNotice({ remaining }: { remaining: number }) {
  return (
    <Notice top="30%">
      <span style={{ ...noticeHeadStyle, color: '#ff6b6b' }}>목숨 −1</span>
      <span style={noticeLineStyle}>
        {remaining === 1
          ? `마지막 목숨 ${remaining}개 — 하나 더 잃으면 끝난다`
          : `남은 목숨 ${remaining}개 · ${LIVES}개를 다 잃으면 끝난다`}
      </span>
    </Notice>
  )
}

/** 처음 놓쳤을 때만. 놓친 대가가 무엇인지 그 자리에서 알려준다 */
function FirstMissNotice() {
  return (
    <Notice top="30%">
      <span style={{ ...noticeHeadStyle, fontSize: 26, color: '#ff6b6b' }}>놓쳤다</span>
      <span style={noticeLineStyle}>쌓기는 그대로 간다 — 정확도가 내려가 점수만 깎인다</span>
    </Notice>
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
