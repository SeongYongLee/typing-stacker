import { useCallback, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { Hud } from '../components/Hud.tsx'
import { InputBar } from '../components/InputBar.tsx'
import { StackArena } from '../components/StackArena.tsx'
import { TypingLane } from '../components/TypingLane.tsx'
import { ARENA_SCREEN_MAX_WIDTH } from '../game/config.ts'
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
            {collapsing && <CollapseOverlay />}
          </div>
          <TypingLane words={state.words} side="right" />
        </div>
      </div>

      <InputBar input={input} feedback={state.feedback} stats={state.stats} />
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
