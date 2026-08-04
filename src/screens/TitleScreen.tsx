import { useEffect } from 'react'
import type { CSSProperties } from 'react'

interface TitleScreenProps {
  onStart: () => void
  ready: boolean
}

const rootStyle: CSSProperties = {
  height: '100%',
  display: 'grid',
  placeItems: 'center',
  padding: 24,
}

const ruleStyle: CSSProperties = {
  fontSize: 15,
  lineHeight: 1.9,
  color: '#b6bdd4',
  margin: '28px 0 36px',
  textAlign: 'left',
  maxWidth: 460,
}

function TitleScreen({ onStart, ready }: TitleScreenProps) {
  useEffect(() => {
    if (!ready) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        onStart()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onStart, ready])

  return (
    <div style={rootStyle}>
      <div style={{ textAlign: 'center' }}>
        <h1
          style={{
            font: '700 46px/1.1 var(--sans)',
            color: '#f2f4fb',
            letterSpacing: '-0.02em',
            margin: 0,
          }}
        >
          타자 스태커
        </h1>
        <p style={{ color: '#6a7290', marginTop: 10 }}>타자게임 + 쌓기</p>

        <ul style={ruleStyle}>
          <li>좌우에서 내려오는 한글 단어를 타이핑한다.</li>
          <li>
            <strong style={{ color: '#ffcf5c' }}>Enter를 누른 순간</strong>의 화살표
            위치로 물건이 떨어진다.
          </li>
          <li>어떤 물건이 나올지는 Enter를 누른 뒤에 알 수 있다.</li>
          <li>단어가 바닥선에 닿으면 더 이상 입력할 수 없다.</li>
          <li>받침대에는 양옆 벽이 없다. 쏠려서 떨어지면 그대로 끝이다.</li>
        </ul>

        <button
          type="button"
          onClick={onStart}
          disabled={!ready}
          style={{
            padding: '14px 40px',
            fontSize: 18,
            fontWeight: 600,
            borderRadius: 10,
            border: '1px solid #48507a',
            background: ready ? '#ffcf5c' : '#262b3d',
            color: ready ? '#1a1405' : '#6a7290',
            cursor: ready ? 'pointer' : 'default',
          }}
        >
          {ready ? '시작 (Enter)' : '물리 엔진 준비 중…'}
        </button>
      </div>
    </div>
  )
}

export { TitleScreen }
