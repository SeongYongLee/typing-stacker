import { useCallback, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { Hud } from '../components/Hud.tsx'
import { InputBar } from '../components/InputBar.tsx'
import { StackArena } from '../components/StackArena.tsx'
import { PauseOverlay } from './PauseOverlay.tsx'
import { TypingLane } from '../components/TypingLane.tsx'
import { ARENA_SCREEN_MAX_WIDTH } from '../game/config.ts'
import type { GameEngine, GameState } from '../game/core/GameEngine.ts'
import { useHangulInput } from '../hooks/useHangulInput.ts'

interface GameScreenProps {
  engine: GameEngine
  state: GameState
  onRestart: () => void
  onHome: () => void
}

const rootStyle: CSSProperties = {
  // 일시정지 화면이 이 안에서 전체를 덮으려면 기준점이 필요하다
  position: 'relative',
  display: 'grid',
  gridTemplateRows: 'auto 1fr auto',
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
  padding: '16px 20px 0',
  minHeight: 0,
}

function GameScreen({ engine, state, onRestart, onHome }: GameScreenProps) {

  const submit = useCallback((text: string) => engine.submit(text), [engine])
  const input = useHangulInput(submit)
  const { focus, clear } = input

  const paused = state.phase === 'paused'

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
   * 이 게임은 판이 도는 내내 입력칸에 포커스가 있다. 그대로 두면 일시정지 메뉴의
   * 화살표와 Enter가 전부 입력칸의 것으로 가서, 메뉴가 키보드로 움직이지 않는다.
   */
  useEffect(() => {
    if (paused) {
      input.ref.current?.blur()
    }
  }, [paused, input.ref])

  /**
   * 판이 새로 시작되면 지난 판의 잔여 텍스트를 비우고 포커스를 되돌린다.
   * runSeq로 거는 이유는 Enter로 시작했든 "다시 하기" 버튼을 마우스로 눌렀든
   * (버튼이 포커스를 훔쳐간다) 똑같이 바로 입력할 수 있어야 하기 때문이다.
   */
  useEffect(() => {
    clear()
    focus()
  }, [state.runSeq, clear, focus])

  const collapsing = state.phase === 'collapsing'

  return (
    <div style={rootStyle} onPointerDown={paused ? undefined : focus}>
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
            {collapsing && <CollapseOverlay />}
          </div>
          <TypingLane words={state.words} side="right" />
        </div>
      </div>

      <InputBar
        input={input}
        feedback={state.feedback}
        stats={state.stats}
        invulnerable={state.invulnerable}
      />

      {/* 화면 전체를 덮는다. 아레나 안쪽에만 두면 HUD와 입력칸이 살아 있는 것처럼 보인다 */}
      {paused && (
        <PauseOverlay onResume={resume} onRestart={onRestart} onHome={onHome} />
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
