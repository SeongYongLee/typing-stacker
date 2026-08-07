import { useEffect } from 'react'
import type { CSSProperties } from 'react'
import { LIVES } from '../game/config.ts'

interface TitleScreenProps {
  onStart: () => void
  onMultiplayer: () => void
  onCollection: () => void
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

function TitleScreen({ onStart, onMultiplayer, onCollection, ready }: TitleScreenProps) {
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

        {/*
          규칙은 넷만 남긴다. 합성·도감·정확도처럼 나중에 알아도 되는 것은
          그 순간 화면에서 알려주므로, 시작 전에는 손이 무엇을 해야 하는지와
          무엇을 잃는지만 있으면 된다.
        */}
        <ul style={ruleStyle}>
          <li>좌우에서 내려오는 한글 단어를 타이핑한다.</li>
          <li>
            <strong style={{ color: '#ffcf5c' }}>Enter를 누른 순간</strong>의 화살표
            위치로 물건이 떨어진다.
          </li>
          <li>
            물건이 쏠려서 받침대를 벗어나면{' '}
            <strong style={{ color: '#ff6b6b' }}>목숨이 하나</strong> 줄어든다.
          </li>
          <li>
            목숨은 <strong style={{ color: '#ff6b6b' }}>{LIVES}개(♥♥♥)</strong>. 다 잃으면
            게임이 끝난다.
          </li>
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
          {ready ? '혼자 하기 (Enter)' : '물리 엔진 준비 중…'}
        </button>

        <button
          type="button"
          onClick={onMultiplayer}
          disabled={!ready}
          style={{
            display: 'block',
            margin: '12px auto 0',
            padding: '13px 34px',
            fontSize: 16,
            fontWeight: 600,
            borderRadius: 10,
            border: '1px solid #48507a',
            background: 'transparent',
            color: ready ? '#b6bdd4' : '#4a5171',
            cursor: ready ? 'pointer' : 'default',
          }}
        >
          1대1 대전
        </button>

        <button
          type="button"
          onClick={onCollection}
          style={{
            display: 'block',
            margin: '12px auto 0',
            padding: '13px 34px',
            fontSize: 16,
            fontWeight: 600,
            borderRadius: 10,
            border: '1px solid #48507a',
            background: 'transparent',
            color: '#b6bdd4',
            cursor: 'pointer',
          }}
        >
          도감
        </button>
      </div>
    </div>
  )
}

export { TitleScreen }
