import { useEffect } from 'react'
import type { CSSProperties } from 'react'
import type { RunStats } from '../game/types/game.ts'

interface ResultScreenProps {
  stats: RunStats
  onRestart: () => void
}

const rootStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(13, 15, 22, 0.88)',
  backdropFilter: 'blur(3px)',
}

const panelStyle: CSSProperties = {
  minWidth: 380,
  padding: '32px 40px',
  borderRadius: 14,
  border: '1px solid #262b3d',
  background: '#151824',
  textAlign: 'center',
}

function ResultScreen({ stats, onRestart }: ResultScreenProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        onRestart()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onRestart])

  return (
    <div style={rootStyle}>
      <div style={panelStyle}>
        <p style={{ color: '#ff6b6b', fontSize: 14, letterSpacing: '0.12em' }}>
          받침대를 벗어났다
        </p>
        <div
          style={{
            font: '700 52px/1.1 var(--sans)',
            color: '#ffcf5c',
            margin: '10px 0 24px',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {stats.score.toLocaleString('ko-KR')}
        </div>

        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto auto',
            gap: '10px 24px',
            justifyContent: 'center',
            margin: '0 0 24px',
            fontSize: 15,
          }}
        >
          <Row label="쌓은 물건" value={`${stats.stackCount}개`} />
          <Row label="최고 높이" value={`${stats.maxHeight.toFixed(2)}m`} />
          <Row label="최고 콤보" value={`x${stats.maxCombo}`} />
          <Row label="타수" value={`${stats.kpm}타/분`} />
          <Row label="놓친 단어" value={`${stats.missedWords}개`} />
        </dl>

        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 12, color: '#6a7290', letterSpacing: '0.08em' }}>
            발견한 히든
          </p>
          <p style={{ marginTop: 6, color: stats.hiddenFound.length > 0 ? '#ffcf5c' : '#6a7290' }}>
            {stats.hiddenFound.length > 0 ? stats.hiddenFound.join(' · ') : '없음'}
          </p>
        </div>

        <button
          type="button"
          onClick={onRestart}
          style={{
            padding: '12px 34px',
            fontSize: 16,
            fontWeight: 600,
            borderRadius: 10,
            border: '1px solid #48507a',
            background: '#ffcf5c',
            color: '#1a1405',
          }}
        >
          다시 하기 (Enter)
        </button>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt style={{ color: '#6a7290', textAlign: 'right' }}>{label}</dt>
      <dd
        style={{
          margin: 0,
          color: '#f2f4fb',
          textAlign: 'left',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </dd>
    </>
  )
}

export { ResultScreen }
