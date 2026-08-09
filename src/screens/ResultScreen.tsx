import { MenuButton } from '../components/MenuButton.tsx'
import { useMenuKeys } from '../hooks/useMenuKeys.ts'
import type { CSSProperties } from 'react'
import { LIVES } from '../game/config.ts'
import type { RunStats } from '../game/types/game.ts'
import { useRunRanking, type RunRanking } from '../hooks/useRunRanking.ts'
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
  padding: 20,
  background: 'rgba(13, 15, 22, 0.88)',
  backdropFilter: 'blur(3px)',
}

/**
 * 머리(점수)와 발(버튼)은 제자리에 두고 가운데만 흐르게 한다.
 *
 * 전부 한 덩어리로 두면 화면이 짧을 때 아래가 잘리는데, `body`가 `overflow: hidden`이라
 * **잘린 버튼에 닿을 방법이 없다.** 판이 끝난 화면에서 그러면 갇힌다. 도감이 이미
 * 같은 함정을 겪고 같은 구조로 풀었다.
 */
const panelStyle: CSSProperties = {
  minWidth: 380,
  maxWidth: 460,
  maxHeight: '100%',
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr) auto',
  padding: '28px 32px',
  borderRadius: 14,
  border: '1px solid #262b3d',
  background: '#151824',
  textAlign: 'center',
}

/**
 * 판 하나에 대한 한 줄 답.
 *
 * 판이 도는 동안 화면 위에서 쫓던 것(`RunChase`)에 대한 답이라 **같은 말을 쓴다** —
 * "내 최고 점수까지 380점"을 쫓다가 끝났으면 여기서도 그 말로 맺는다. 예전에는
 * `내 최고 기록!` 배지와 `내 최고 3,120` 텍스트와 순위표의 노란 줄이 같은 사실을
 * 세 자리에서 말했다.
 */
function verdictOf(stats: RunStats, ranking: RunRanking): string | null {
  if (ranking.status === 'sending') {
    return '기록을 보내는 중…'
  }
  if (ranking.status === 'offline') {
    return '순위를 받지 못했다'
  }
  const view = ranking.view
  if (view === null) {
    return null
  }
  const parts: string[] = []
  if (ranking.isBest) {
    parts.push('내 최고 점수 경신')
  } else if (view.best !== null) {
    const gap = view.best.score - stats.score
    parts.push(`내 최고 점수까지 ${gap.toLocaleString('ko-KR')}점`)
  }
  if (view.rank !== null) {
    parts.push(`${view.rank}위`)
  }
  return parts.length === 0 ? null : parts.join(' · ')
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

  const ranking = useRunRanking(stats)
  const verdict = verdictOf(stats, ranking)
  // 정확도가 깎아간 몫. 원점수를 그대로 보여주면 왜 깎였는지는 여전히 모른다
  const lost = Math.max(0, stats.rawScore - stats.score)

  return (
    <div style={rootStyle}>
      <div style={panelStyle}>
        <div>
          <p style={{ color: '#ff6b6b', fontSize: 13, letterSpacing: '0.12em', margin: 0 }}>
            목숨 {LIVES}개를 모두 잃었다
          </p>
          <div
            style={{
              font: '700 52px/1.1 var(--sans)',
              color: '#e4e68a',
              margin: '8px 0 6px',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {stats.score.toLocaleString('ko-KR')}
          </div>
          {verdict !== null && (
            <p
              data-verdict
              style={{
                margin: '0 0 20px',
                fontSize: 14,
                color: ranking.isBest ? '#6bffb0' : '#8b93b0',
              }}
            >
              {verdict}
            </p>
          )}
        </div>

        <div style={{ overflowY: 'auto', minHeight: 0 }}>
          {/* 이 게임의 성취. 쌓기·높이·콤보가 판을 요약한다 */}
          <div style={rowStyle}>
            <Stat label="쌓은 물건" value={`${stats.stackCount}개`} />
            <Stat label="최고 높이" value={`${stats.maxHeight.toFixed(2)}m`} />
            <Stat label="최고 콤보" value={`x${stats.maxCombo}`} />
          </div>

          {/* 참고값. 판을 요약하지는 않지만 다음 판에 참고가 된다 */}
          <div style={{ ...rowStyle, marginTop: 8 }}>
            <Stat label="타수" value={`${stats.kpm}타/분`} small />
            <Stat label="놓친 단어" value={`${stats.missedWords}개`} small />
            <Stat
              label="정확도"
              value={
                lost > 0
                  ? `${Math.round(stats.accuracy * 100)}% (−${lost.toLocaleString('ko-KR')})`
                  : `${Math.round(stats.accuracy * 100)}%`
              }
              small
            />
          </div>

          {/*
            히든은 만났을 때만 나온다. 실측으로 절반의 판이 하나도 못 만나는데,
            그때마다 "없음"이 자리를 차지하고 아무 말도 하지 않았다.
          */}
          {stats.hiddenFound.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <p style={{ fontSize: 12, color: '#6a7290', letterSpacing: '0.08em', margin: 0 }}>
                발견한 히든
              </p>
              <p style={{ margin: '6px 0 0', color: '#e4e68a' }}>
                {stats.hiddenFound.join(' · ')}
              </p>
            </div>
          )}

          <RankBoard ranking={ranking} />
        </div>

        <div style={{ display: 'grid', gap: 10, justifyItems: 'center', paddingTop: 20 }}>
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

const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  gap: 20,
  flexWrap: 'wrap',
}

/**
 * 상위 기록.
 *
 * **랭킹이 안 되어도 결과 화면은 그대로 보여야 한다.** 서버가 죽었거나 네트워크가
 * 막혔을 때 이 칸만 조용히 비고, 점수·통계·버튼은 아무 영향을 받지 않는다.
 * 내 등수와 최고 기록은 위의 한 줄이 말하므로 여기는 **남들만** 보여준다.
 *
 * 다섯에서 셋으로 줄였다. 이 화면에서 알고 싶은 것은 "내가 어디쯤인가"이고 그건
 * 위에서 이미 답했다 — 목록은 다음에 무엇을 넘어야 하는지만 알려주면 된다.
 */
function RankBoard({ ranking }: { ranking: RunRanking }) {
  const profile = loadProfile()
  const view = ranking.view
  if (ranking.status !== 'ready' || view === null || view.top.length === 0) {
    return null
  }

  return (
    <div data-ranking={ranking.status} style={{ marginTop: 18, textAlign: 'left' }}>
      <p
        style={{
          fontSize: 12,
          color: '#6a7290',
          letterSpacing: '0.06em',
          margin: '0 0 8px',
          textAlign: 'center',
        }}
      >
        전체 순위
      </p>
      <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
        {view.top.slice(0, 3).map((run, index) => (
          <li
            key={run.id}
            style={{
              display: 'flex',
              gap: 10,
              fontSize: 13,
              color: run.id === profile.id ? '#e4e68a' : '#8b93b0',
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
    </div>
  )
}

function Stat({
  label,
  value,
  small = false,
}: {
  label: string
  value: string
  small?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <span style={{ fontSize: small ? 11 : 12, color: '#6a7290' }}>{label}</span>
      <span
        style={{
          fontSize: small ? 13 : 16,
          fontWeight: 600,
          color: small ? '#8b93b0' : '#f2f4fb',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
    </div>
  )
}

export { ResultScreen }
