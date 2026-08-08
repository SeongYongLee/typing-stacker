import { MenuButton } from '../components/MenuButton.tsx'
import { useMenuKeys } from '../hooks/useMenuKeys.ts'
import type { CSSProperties } from 'react'
import { LIVES } from '../game/config.ts'
import type { RunStats } from '../game/types/game.ts'

interface ResultScreenProps {
  stats: RunStats
  onRestart: () => void
  onHome: () => void
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

function ResultScreen({ stats, onRestart, onHome }: ResultScreenProps) {
  const items = [
    { label: '다시 하기', run: onRestart, primary: true },
    { label: '처음으로', run: onHome, primary: false },
  ]

  const menu = useMenuKeys({
    count: items.length,
    onActivate: (index) => items[index]?.run(),
    // 판이 끝난 화면에서 Esc는 나가는 길이다
    onCancel: onHome,
  })

  return (
    <div style={rootStyle}>
      <div style={panelStyle}>
        <p style={{ color: '#ff6b6b', fontSize: 14, letterSpacing: '0.12em' }}>
          목숨 {LIVES}개를 모두 잃었다
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
          <Row
            label="정확도"
            value={`${Math.round(stats.accuracy * 100)}% · 원점수 ${stats.rawScore.toLocaleString('ko-KR')}`}
          />
        </dl>

        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 12, color: '#6a7290', letterSpacing: '0.08em' }}>
            발견한 히든
          </p>
          <p style={{ marginTop: 6, color: stats.hiddenFound.length > 0 ? '#ffcf5c' : '#6a7290' }}>
            {stats.hiddenFound.length > 0 ? stats.hiddenFound.join(' · ') : '없음'}
          </p>
        </div>

        <div style={{ display: 'grid', gap: 10, justifyItems: 'center' }}>
          {items.map((item, index) => (
            <MenuButton
              key={item.label}
              selected={menu.index === index}
              onClick={item.run}
              onHover={() => menu.select(index)}
              primary={item.primary}
              style={{ width: 'auto', minWidth: 190 }}
            >
              {item.label}
            </MenuButton>
          ))}
        </div>
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
