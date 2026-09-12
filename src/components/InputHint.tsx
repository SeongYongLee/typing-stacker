import { useMobileControls } from '../hooks/useViewport.ts'
import type { ReactNode } from 'react'

/** 화면 너비와 무관하게 선택한 입력 방식에 맞는 조작 안내. */
export function InputHint({ desktop, mobile }: { desktop: ReactNode; mobile: ReactNode }) {
  const touch = useMobileControls()
  return <>{touch ? mobile : desktop}</>
}
