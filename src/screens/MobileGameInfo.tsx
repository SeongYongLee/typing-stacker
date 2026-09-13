import { useCongestionTone } from '../hooks/useCongestionTone.ts'
import type { GameState } from '../game/core/GameEngine.ts'
import { memo, useEffect, useRef, useState } from 'react'

function MobileMergeToastView({ reveal }: { reveal: GameState['mergeReveal'] }) {
  const [current, setCurrent] = useState<GameState['mergeReveal']>(null)
  const lastSeq = useRef<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (reveal === null || reveal.seq === lastSeq.current) return
    lastSeq.current = reveal.seq
    setCurrent(reveal)
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCurrent(null), 2000)
  }, [reveal])
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current) }, [])
  if (current === null) return null
  return <div className="mp-merge-toast" key={current.seq} role="status">
    <img src={current.sprite} width="32" height="32" alt="" />
    <div><small>{current.from.length >= 3 ? '다중 합성' : '합성 성공'}</small><strong>{current.label}</strong></div>
    <span className="mp-toast-parts">{current.from.map((part, index) => <img key={index} src={part.sprite} width="20" height="20" alt={part.label} />)}</span>
  </div>
}

function MobileWhiteboardView({ words, ready }: { words: readonly string[]; ready: readonly string[] }) {
  return <div className="mp-whiteboard">
    <div className="mp-board-title"><strong>화이트보드</strong><span>입력하면 회수</span></div>
    <div className="mp-recall" aria-label="화이트보드 회수 단어">{words.map((word) => <span className="mp-recall-chip" key={word} data-ready={ready.includes(word)}><span>{word}</span><small>{ready.includes(word) ? '회수 가능' : '상자에 없음'}</small></span>)}{words.length === 0 && '물건을 쌓아보세요'}</div>
  </div>
}

function MobileCongestionView({ value, rushing, recovery, recoverySeq = 0 }: { value: number; rushing: boolean; recovery?: GameState['stage']['congestionRecovery']; recoverySeq?: number }) {
  const congestionTone = useCongestionTone(value, rushing, recoverySeq)
  const percent = Math.min(100, Math.max(0, value))
  return <div className="mp-congestion" style={congestionTone.style} data-congestion-tone={congestionTone.tone} data-warning={rushing || percent >= 80}>
    <span className="mp-congestion-label">{rushing ? '경보 · 물건 반입 중' : '혼잡 경보'}{!rushing && recovery?.crafted && <span key={recoverySeq} className="mp-craft-recovery" data-craft-recovery={recovery.amount}>합성 정리 −{recovery.amount}</span>}</span>
    <div className="mp-congestion-track" role="progressbar" aria-label="혼잡 경보" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} aria-valuetext={rushing ? '경보 작동 · 물건 반입 중' : `${Math.round(percent)}%`}>
      <div style={{ width: `${rushing ? 100 : percent}%` }} />
    </div>
    <strong>{Math.round(percent)}%</strong>
  </div>
}

const sameWords = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((word, i) => word === b[i])
export const MobileWhiteboard = memo(MobileWhiteboardView, (a, b) => sameWords(a.words, b.words) && sameWords(a.ready, b.ready))
export const MobileCongestion = memo(MobileCongestionView)
export const MobileMergeToast = memo(MobileMergeToastView, (a, b) => a.reveal?.seq === b.reveal?.seq)
