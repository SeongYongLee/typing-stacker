import type { CSSProperties } from 'react'
import type { SubmitFeedback } from '../game/core/GameEngine.ts'
import type { HangulInput } from '../hooks/useHangulInput.ts'

interface InputBarProps {
  input: HangulInput
  feedback: SubmitFeedback | null
}

const wrapStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  padding: '14px 20px',
  borderTop: '1px solid #262b3d',
  background: '#151824',
}

const inputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  font: '600 26px/1.2 var(--sans)',
  color: '#f2f4fb',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  padding: 0,
  caretColor: '#ffcf5c',
}

const labelStyle: CSSProperties = {
  fontSize: 13,
  color: '#6a7290',
  letterSpacing: '0.08em',
  flexShrink: 0,
}

function InputBar({ input, feedback }: InputBarProps) {
  return (
    <div style={wrapStyle}>
      <span style={labelStyle}>입력</span>
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
      {input.composing && (
        <span style={{ fontSize: 12, color: '#8a6d1f', flexShrink: 0 }}>조립 중</span>
      )}
      <FeedbackChip feedback={feedback} />
    </div>
  )
}

function FeedbackChip({ feedback }: { feedback: SubmitFeedback | null }) {
  if (feedback === null) {
    return <span style={{ ...labelStyle, minWidth: 180, textAlign: 'right' }}>—</span>
  }

  const color = feedback.ok ? '#6bffb0' : '#ff6b6b'
  return (
    <span
      key={feedback.seq}
      style={{
        minWidth: 180,
        textAlign: 'right',
        fontSize: 15,
        color,
        flexShrink: 0,
        whiteSpace: 'nowrap',
      }}
    >
      {feedback.text || '(빈 입력)'} {feedback.ok ? '✓' : '✗'}
      {feedback.itemLabel !== null && (
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
