import { useCallback, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { Hud } from '../components/Hud.tsx'
import { InputBar } from '../components/InputBar.tsx'
import { StackArena } from '../components/StackArena.tsx'
import { TypingLane } from '../components/TypingLane.tsx'
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

const fieldStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr minmax(300px, 460px) 1fr',
  gap: 12,
  padding: '16px 20px 0',
  minHeight: 0,
}

function GameScreen({ engine, state }: GameScreenProps) {
  const submit = useCallback((text: string) => engine.submit(text), [engine])
  const input = useHangulInput(submit)
  const { focus } = input

  // 타이핑 게임이므로 포커스를 잃으면 게임이 멈춘 것처럼 보인다
  useEffect(() => {
    focus()
  }, [focus])

  const collapsing = state.phase === 'collapsing'

  return (
    <div style={rootStyle} onPointerDown={focus}>
      <Hud stats={state.stats} elapsed={state.elapsed} />

      <div style={fieldStyle}>
        <TypingLane words={state.words} side="left" />
        <div style={{ position: 'relative', minHeight: 0 }}>
          <StackArena engine={engine} />
          {collapsing && <CollapseOverlay />}
        </div>
        <TypingLane words={state.words} side="right" />
      </div>

      <InputBar input={input} feedback={state.feedback} />
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
