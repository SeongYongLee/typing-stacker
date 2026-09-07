import type { ReactNode } from 'react'

/** 화면 크기에 맞는 조작 안내. 키보드 안내는 넓은 화면에서 유지한다. */
export function InputHint({ desktop, mobile }: { desktop: ReactNode; mobile: ReactNode }) {
  return <><span className="desktop-hint">{desktop}</span><span className="mobile-hint">{mobile}</span></>
}
