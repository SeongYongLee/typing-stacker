import { MenuButton } from '../components/MenuButton.tsx'
import { useMenuKeys } from '../hooks/useMenuKeys.ts'
import type { CSSProperties } from 'react'
import { LIVES } from '../game/config.ts'
import type { RunStats } from '../game/types/game.ts'
import { useRunRanking } from '../hooks/useRunRanking.ts'
import { loadProfile } from '../storage/profile.ts'

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

        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 12, color: '#6a7290', letterSpacing: '0.08em' }}>
            발견한 히든
          </p>
          <p style={{ marginTop: 6, color: stats.hiddenFound.length > 0 ? '#ffcf5c' : '#6a7290' }}>
            {stats.hiddenFound.length > 0 ? stats.hiddenFound.join(' · ') : '없음'}
          </p>
        </div>

        <RankPanel stats={stats} />

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

/**
 * 전체 순위.
 *
 * **랭킹이 안 되어도 결과 화면은 그대로 보여야 한다.** 서버가 죽었거나 네트워크가
 * 막혔을 때 이 칸만 조용히 비고, 점수·통계·버튼은 아무 영향을 받지 않는다.
 *
 * 순위는 기기마다 최고 기록 하나로 매긴다 — 한 사람이 순위표를 여러 줄 차지하면
 * "몇 등인가"가 사람 수를 세는 것이 아니라 판 수를 세는 것이 된다.
 */
function RankPanel({ stats }: { stats: RunStats }) {
  const ranking = useRunRanking(stats)
  const profile = loadProfile()

  return (
    <div
      data-ranking={ranking.status}
      style={{
        margin: '0 0 24px',
        padding: '14px 16px',
        borderRadius: 12,
        border: '1px solid #232839',
        background: 'rgba(255, 255, 255, 0.025)',
        textAlign: 'left',
        minHeight: 96,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <span style={{ fontSize: 12, color: '#8b93b0', letterSpacing: '0.06em' }}>전체 순위</span>
        {ranking.isBest && (
          <span style={{ fontSize: 13, color: '#6bffb0', fontWeight: 700 }}>내 최고 기록!</span>
        )}
      </div>

      {ranking.status === 'sending' && (
        <p style={{ margin: 0, fontSize: 13, color: '#6a7290' }}>기록을 보내는 중…</p>
      )}
      {ranking.status === 'offline' && (
        <p style={{ margin: 0, fontSize: 13, color: '#6a7290' }}>
          순위를 받지 못했다. 이번 판은 순위에 오르지 않는다.
        </p>
      )}
      {ranking.status === 'ready' && ranking.view !== null && (
        <>
          <p style={{ margin: '0 0 10px', fontSize: 15, color: '#f2f4fb' }}>
            {ranking.view.rank === null ? (
              '아직 순위가 없다'
            ) : (
              <>
                <strong style={{ color: '#ffcf5c', fontSize: 20 }}>{ranking.view.rank}위</strong>
                <span style={{ color: '#6a7290', fontSize: 13 }}>
                  {' '}
                  · 내 최고 {(ranking.view.best?.score ?? 0).toLocaleString('ko-KR')}
                </span>
              </>
            )}
          </p>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
            {ranking.view.top.slice(0, 5).map((run, index) => (
              <li
                key={run.id}
                style={{
                  display: 'flex',
                  gap: 10,
                  fontSize: 13,
                  color: run.id === profile.id ? '#ffcf5c' : '#8b93b0',
                  fontWeight: run.id === profile.id ? 700 : 400,
                }}
              >
                <span style={{ width: 18, textAlign: 'right', color: '#4a5171' }}>
                  {index + 1}
                </span>
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {run.name}
                </span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {run.score.toLocaleString('ko-KR')}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
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
