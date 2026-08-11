import { useEffect, useRef, useState } from 'react'
import { MAX_TEXT } from '../../multi/ChatLog.ts'
import type { ChatLine } from '../../multi/ChatLog.ts'
import { fieldStyle } from './lobbyStyle.ts'

const MATCH_CHAT_LOG_HEIGHT = 360

interface MatchChatNotice {
  readonly id: string
  readonly text: string
}

interface MatchChatBoxProps {
  readonly lines: readonly ChatLine[]
  readonly selfId: string
  readonly onSend: (text: string) => void
  readonly disabled?: boolean
  readonly notices?: readonly MatchChatNotice[]
  /** 결과 대기 화면처럼 키보드 입력을 곧바로 채팅으로 받을 때 사용한다. */
  readonly autoFocus?: boolean
}

/** 준비방과 경기 결과 대기 화면이 함께 쓰는 채팅 UI. */
function MatchChatBox({
  lines,
  selfId,
  onSend,
  disabled = false,
  notices = [],
  autoFocus = false,
}: MatchChatBoxProps) {
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [lines.length, notices.length])

  const send = (): void => {
    if (text.trim().length === 0) return
    onSend(text)
    setText('')
  }

  return (
    <div style={{ display: 'grid', gap: 8 }} data-chat={lines.length}>
      <div
        style={{
          height: MATCH_CHAT_LOG_HEIGHT,
          overflowY: 'auto',
          textAlign: 'left',
          padding: '8px 10px',
          borderRadius: 10,
          background: '#0d0f16',
          border: '1px solid #2e3448',
          display: 'grid',
          gap: 4,
          alignContent: 'start',
        }}
      >
        {lines.length === 0 && notices.length === 0 && (
          <span style={{ color: '#4a5171' }}>시작 전에 한마디 나눌 수 있습니다.</span>
        )}
        {lines.map((line) => (
          <span key={line.seq} style={{ color: '#b6bdd4', lineHeight: 1.5 }}>
            <b style={{ color: line.from === selfId ? '#e4e68a' : '#8bd6ff' }}>
              {line.nickname}
            </b>{' '}
            {line.text}
          </span>
        ))}
        {notices.map((notice) => (
          <span
            key={notice.id}
            data-chat-notice={notice.id}
            style={{ color: '#8bd6ff', lineHeight: 1.5, fontWeight: 700 }}
          >
            {notice.text}
          </span>
        ))}
        <div ref={endRef} />
      </div>
      <input
        autoFocus={autoFocus}
        style={{ ...fieldStyle, fontSize: 17, textAlign: 'left', padding: '10px 12px' }}
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
        placeholder="한마디 (Enter로 보냅니다)"
        maxLength={MAX_TEXT}
        aria-label="채팅 입력"
        disabled={disabled}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || text.trim().length === 0) return
          event.preventDefault()
          event.stopPropagation()
          send()
        }}
      />
    </div>
  )
}

export { MATCH_CHAT_LOG_HEIGHT, MatchChatBox }
export type { MatchChatNotice }
