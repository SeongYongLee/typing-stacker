import type { CSSProperties } from 'react'

/**
 * 함께 하기 화면들이 나눠 쓰는 모양.
 *
 * 여섯 화면(로비·준비·대기·친선전·안내·줄서기)이 한 파일에 있었을 때는 이 값들이
 * 그 안에 있었다. 화면을 따로 세우면서 **여러 화면이 쓰는 것만** 이리로 옮겼다 —
 * 한 화면만 쓰는 모양은 그 화면 옆에 두는 편이 고칠 때 함께 보인다.
 *
 * 컴포넌트 파일 밖에 두는 이유는 한 파일이 컴포넌트와 상수를 함께 내보내면 Fast
 * Refresh가 그 파일을 통째로 다시 만들기 때문이다(`sidePanelStyle.ts`와 같은 까닭).
 */

const rootStyle: CSSProperties = {
  height: '100%',
  display: 'grid',
  placeItems: 'center',
  padding: 24,
}

const panelStyle: CSSProperties = {
  width: 'min(440px, 90vw)',
  display: 'grid',
  gap: 18,
  padding: 20,
  border: '1px solid var(--rule)',
  borderRadius: 2,
  background: 'var(--paper)',
  boxShadow: '3px 4px 0 rgba(43, 37, 27, .25)',
  textAlign: 'center',
}

const fieldStyle: CSSProperties = {
  width: '100%',
  font: '600 20px/1.3 var(--sans)',
  color: 'var(--text-strong)',
  background: 'var(--paper)',
  border: '1px solid var(--rule)',
  borderRadius: 2,
  padding: '12px 14px',
  textAlign: 'center',
}

const buttonStyle: CSSProperties = {
  padding: '13px 20px',
  fontSize: 16,
  fontWeight: 600,
  borderRadius: 2,
  border: '1px solid var(--stamp)',
  background: 'var(--paper-shade)',
  color: 'var(--stamp)',
}

const pathLabelStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--ink-muted)',
  letterSpacing: '0.06em',
}

const ghostButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: 'transparent',
  color: 'var(--ink)',
}

/** 랭크 게임 버튼 아래의 대기 인원. 버튼에 딸린 값이라 붙여둔다 */
const queueNoteStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--ink-muted)',
  textAlign: 'center',
  marginTop: -4,
}

export {
  rootStyle,
  panelStyle,
  fieldStyle,
  buttonStyle,
  pathLabelStyle,
  ghostButtonStyle,
  queueNoteStyle,
}
