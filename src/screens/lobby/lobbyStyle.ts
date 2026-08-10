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
  border: '1px solid rgba(181, 190, 211, 0.22)',
  borderRadius: 16,
  background: 'rgba(13, 16, 26, 0.82)',
  boxShadow: '0 18px 48px rgba(5, 9, 17, 0.24)',
  backdropFilter: 'blur(12px) saturate(0.9)',
  textAlign: 'center',
}

const fieldStyle: CSSProperties = {
  width: '100%',
  font: '600 20px/1.3 var(--sans)',
  color: '#f2f4fb',
  background: '#0d0f16',
  border: '1px solid #2e3448',
  borderRadius: 10,
  padding: '12px 14px',
  textAlign: 'center',
}

const buttonStyle: CSSProperties = {
  padding: '13px 20px',
  fontSize: 16,
  fontWeight: 600,
  borderRadius: 10,
  border: '1px solid #e4e68a',
  background: '#21211f',
  color: '#e4e68a',
}

const pathLabelStyle: CSSProperties = {
  fontSize: 12,
  color: '#6a7290',
  letterSpacing: '0.06em',
}

const ghostButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: 'transparent',
  color: '#b6bdd4',
}

/** 랭크 게임 버튼 아래의 대기 인원. 버튼에 딸린 값이라 붙여둔다 */
const queueNoteStyle: CSSProperties = {
  fontSize: 12,
  color: '#6a7290',
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
