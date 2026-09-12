import { useEffect, useRef, useState, type CSSProperties } from 'react'

/** Keep a stable outline while the ink eases between warning and recovery. */
export function useCongestionTone(value: number, rushing: boolean, recoverySeq: number) {
  const previous = useRef({ value, rushing, recoverySeq })
  const [recovering, setRecovering] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const before = previous.current
    previous.current = { value, rushing, recoverySeq }
    if (rushing) {
      if (timer.current !== null) clearTimeout(timer.current)
      setRecovering(false)
    } else if (recoverySeq > before.recoverySeq || before.rushing || value < before.value - 0.1) {
      setRecovering(true)
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(() => setRecovering(false), 1000)
    }
  }, [value, rushing, recoverySeq])
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current) }, [])
  const warning = rushing || value >= 80
  const tone = rushing ? 'warning' : recovering ? 'recovery' : warning ? 'warning' : 'normal'
  const style: CSSProperties = {
    color: tone === 'warning' ? '#ffb09b' : tone === 'recovery' ? '#b5eccb' : '#ffeac5',
    textShadow: '-1px 0 1px #382b26, 1px 0 1px #382b26, 0 -1px 1px #382b26, 0 1px 1px #382b26, 0 2px 3px #231c19',
    transition: 'color 550ms ease-in-out',
  }
  return { tone, style }
}
