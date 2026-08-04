import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import type { SubmitFeedback } from '../game/core/GameEngine.ts'
import type { HangulInput } from '../hooks/useHangulInput.ts'

interface InputBarProps {
  input: HangulInput
  feedback: SubmitFeedback | null
}

const UNDERLINE = '#2e3448'
const UNDERLINE_COMPOSING = '#8a6d1f'
const DANGER = '#ff6b6b'

/**
 * 연출은 상태로 들고 있지 않고 그 자리에서 재생한다 —
 * 엔진이 매 프레임 리렌더를 밀어넣으므로 애니메이션을 렌더에 묶으면 계속 끊긴다.
 * 진행 중인 애니메이션은 지우고 새로 시작해서, 빠르게 두드릴 때 변형이 겹치지 않게 한다.
 */
function play(
  element: HTMLElement | null,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
): void {
  if (element === null || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return
  }
  for (const running of element.getAnimations()) {
    running.cancel()
  }
  element.animate(keyframes, options)
}

const wrapStyle: CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
  padding: '14px 20px',
  borderTop: '1px solid #262b3d',
  background: '#151824',
}

const inputStyle: CSSProperties = {
  width: '100%',
  minWidth: 0,
  font: '600 28px/1.2 var(--sans)',
  color: '#f2f4fb',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  padding: 0,
  textAlign: 'center',
  caretColor: '#ffcf5c',
}

const labelStyle: CSSProperties = {
  fontSize: 13,
  color: '#6a7290',
  letterSpacing: '0.08em',
  flexShrink: 0,
}

function InputBar({ input, feedback }: InputBarProps) {
  const fieldRef = useRef<HTMLDivElement | null>(null)
  const underlineRef = useRef<HTMLDivElement | null>(null)

  // 글자가 들어올 때마다 글자만 살짝 눌러 타격감을 준다 — 밑줄은 기준선이니 고정한다
  useEffect(() => {
    if (input.tapSeq === 0) {
      return
    }
    play(
      input.ref.current,
      [
        { transform: 'translateY(0)' },
        { transform: 'translateY(2px)', offset: 0.35 },
        { transform: 'translateY(0)' },
      ],
      { duration: 110, easing: 'ease-out' },
    )
  }, [input.tapSeq, input.ref])

  /**
   * 틀린 단어는 물건이 떨어지지 않아 화면에 아무 일도 일어나지 않는다.
   * 입력칸을 좌우로 흔들고 밑줄을 붉게 튀겨서 빗나갔다는 것을 몸으로 알게 한다.
   */
  useEffect(() => {
    if (feedback === null || feedback.ok) {
      return
    }
    play(
      fieldRef.current,
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-7px)' },
        { transform: 'translateX(6px)' },
        { transform: 'translateX(-3px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 240, easing: 'ease-in-out' },
    )
    play(
      underlineRef.current,
      [
        { backgroundColor: DANGER },
        { backgroundColor: DANGER, offset: 0.5 },
        { backgroundColor: UNDERLINE },
      ],
      { duration: 420, easing: 'linear' },
    )
  }, [feedback])

  return (
    <div style={wrapStyle}>
      <div ref={fieldRef} style={{ width: 'min(420px, 60%)', position: 'relative' }}>
        <input
          ref={input.ref}
          style={inputStyle}
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
        />
        <div
          ref={underlineRef}
          style={{
            height: 2,
            marginTop: 4,
            background: input.composing ? UNDERLINE_COMPOSING : UNDERLINE,
            transition: 'background 120ms',
          }}
        />
      </div>
      <FeedbackChip feedback={feedback} />
    </div>
  )
}

function FeedbackChip({ feedback }: { feedback: SubmitFeedback | null }) {
  if (feedback === null) {
    return <span style={{ ...labelStyle, height: 22 }}>단어를 입력하고 Enter</span>
  }

  const color = feedback.ok ? '#6bffb0' : DANGER
  // 기본 물건은 이름이 단어와 같다 — 히든처럼 다른 것이 나왔을 때만 화살표로 알린다
  const showItem = feedback.itemLabel !== null && feedback.itemLabel !== feedback.text
  return (
    <span
      key={feedback.seq}
      style={{
        height: 22,
        fontSize: 15,
        color,
        whiteSpace: 'nowrap',
      }}
    >
      {feedback.text || '(빈 입력)'} {feedback.ok ? '✓' : '✗'}
      {showItem && (
        <span style={{ color: feedback.hidden ? '#ffcf5c' : '#b6bdd4' }}>
          {' → '}
          {feedback.itemLabel}
          {feedback.hidden && ' ★'}
        </span>
      )}
    </span>
  )
}

export { InputBar }
