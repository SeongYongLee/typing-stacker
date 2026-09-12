import { MenuButton } from '../components/MenuButton.tsx'
import { useMenuKeys } from '../hooks/useMenuKeys.ts'
import type { CSSProperties } from 'react'
import type { RunStats } from '../game/types/game.ts'
import { useRunRanking, type RunRanking } from '../hooks/useRunRanking.ts'
import { loadProfile } from '../storage/profile.ts'
import { VARIANT_BY_ID } from '../game/data/words.ts'

interface ResultScreenProps {
  stats: RunStats
  freshlyCollected: readonly string[]
  totalReturns: number
  /** 경보 규칙을 설명하려고 의도적으로 만든 첫 게임오버인지. */
  congestionDemo?: boolean
  /** 튜토리얼 종료 뒤 바로 일반 판을 연다. */
  onStartGame?: () => void
  /** 튜토리얼 종료 뒤 처음부터 다시 재생한다. */
  onReplayTutorial?: () => void
  onRestart: () => void
  onHome: () => void
}

const rootStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 20,
  display: 'grid',
  placeItems: 'center',
  gridTemplateRows: 'minmax(0, 1fr)',
  gridTemplateColumns: 'minmax(0, 1fr)',
  overflow: 'hidden',
  padding: 20,
  background: 'rgba(13, 15, 22, 0.88)',
}

/**
 * 결과 내용은 함께 스크롤하고, 하단 행동 버튼은 항상 화면 안에 둔다.
 *
 * 전부 한 덩어리로 두면 화면이 짧을 때 아래가 잘리는데, `body`가 `overflow: hidden`이라
 * **잘린 버튼에 닿을 방법이 없다.** 판이 끝난 화면에서 그러면 갇힌다. 도감이 이미
 * 같은 함정을 겪고 같은 구조로 풀었다.
 */
const panelStyle: CSSProperties = {
  width: 'min(460px, 100%)',
  minWidth: 0,
  maxWidth: 460,
  maxHeight: '100%',
  minHeight: 0,
  overflow: 'hidden',
  display: 'grid',
  gridTemplateRows: 'minmax(0, 1fr) auto',
  padding: 'clamp(16px, 4vw, 28px) clamp(12px, 4vw, 32px)',
  borderRadius: 2,
  border: '1px solid var(--rule)',
  background: 'var(--paper)',
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
    return '연결되지 않아 기록을 보관했다'
  }
  if (ranking.status === 'rejected') {
    const reason = ranking.view?.reason
    return reason === 'shape'
      ? '기록 형식을 확인하지 못해 보관했다'
      : '서버 제한과 맞지 않아 기록을 보관했다'
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

function ResultScreen({
  stats,
  freshlyCollected,
  totalReturns,
  congestionDemo = false,
  onStartGame,
  onReplayTutorial,
  onRestart,
  onHome,
}: ResultScreenProps) {
  const tutorialEnd = congestionDemo && onStartGame !== undefined && onReplayTutorial !== undefined
  const items = tutorialEnd
    ? [
        { label: '게임 시작하기', run: onStartGame, primary: true },
        { label: '튜토리얼 다시 보기', run: onReplayTutorial, primary: false },
      ]
    : [
        { label: '다시 하기', run: onRestart, primary: true },
        { label: '처음으로', run: onHome, primary: false },
      ]

  const menu = useMenuKeys({
    count: items.length,
    onActivate: (index) => items[index]?.run(),
    // 판이 끝난 화면에서 Esc는 나가는 길이다
    onCancel: onHome,
  })

  // 튜토리얼 데모는 실제 기록이 아니다. 완료 UI만 보여주고 순위 서버에는 보내지 않는다.
  const ranking = useRunRanking(stats, !tutorialEnd)
  const verdict = verdictOf(stats, ranking)
  // 정확도가 깎아간 몫. 원점수를 그대로 보여주면 왜 깎였는지는 여전히 모른다
  const lost = Math.max(0, stats.rawScore - stats.score)

  if (tutorialEnd) {
    return (
      <div className="result-overlay" style={rootStyle}>
        <div className="paper-sheet tutorial-receipt"
          style={{
            ...panelStyle,
            width: 'min(420px, 100%)',
            display: 'grid',
            gap: 24,
            justifyItems: 'center',
            padding: '32px',
            border: '1px solid var(--rule)',
            borderRadius: 2,
            background: 'var(--paper)',
            textAlign: 'center',
          }}
        >
          <div className="result-content">
            <p style={{ margin: 0, color: 'var(--stamp)', fontSize: 13, letterSpacing: '0.12em' }}>
              업무 교육 이수
            </p>
            <h1 className="office-heading" style={{ margin: '8px 0 10px', color: 'var(--text-strong)', fontSize: 32 }}>튜토리얼 완료</h1>
          </div>

          <div className="result-actions" style={{ width: 'min(240px, 100%)', display: 'grid', gap: 10 }}>
            {items.map((item, index) => (
              <MenuButton
                key={item.label}
                selected={menu.index === index}
                onClick={item.run}
                onHover={() => menu.select(index)}
                primary={item.primary}
              >
                {item.label}
              </MenuButton>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="result-overlay" style={rootStyle}>
      <div className="paper-sheet result-sheet" style={panelStyle}>
        <div className="result-content">
          <div>
            <div className="office-caption"><span>분실물 보관소</span><span className="office-stamp">정리 종료</span></div>
            <h1 className="report-heading">정리 보고서</h1>
            <div
              style={{
                font: '700 52px/1.1 var(--sans)',
                color: 'var(--stamp)',
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
                  color: ranking.isBest ? 'var(--green)' : 'var(--ink-muted)',
                }}
              >
                {verdict}
              </p>
            )}
            {(ranking.status === 'offline' || ranking.status === 'rejected') && (
              <MenuButton onClick={ranking.retry}>
                기록 다시 보내기
              </MenuButton>
            )}
          </div>

          <div className="result-details">
            <section
              aria-label="다음 판 안내"
              style={{
                marginBottom: 16,
                padding: '10px 12px',
                border: '1px solid var(--rule)',
                borderRadius: 2,
                background: 'var(--paper-shade)',
                color: 'var(--ink)',
                fontSize: 14,
                lineHeight: 1.45,
                wordBreak: 'keep-all',
              }}
            >
              {totalReturns === 0
                ? '화이트보드의 물건이 상자에 있으면 이름을 입력해 회수하세요.'
                : stats.missedWords > 0
                  ? '놓친 단어는 경보를 채워요. 재료를 합성하면 경보를 최대 15 낮출 수 있어요.'
                  : '물건이 높이 쌓이기 전에 회수해 자리를 만들어보세요.'}
            </section>

            {/* 진행 목표인 회수를 먼저 보여준다 */}
            <div style={rowStyle}>
              <Stat label="회수한 물건" value={`${totalReturns}개`} />
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

            {freshlyCollected.length > 0 && (
              <NewCollection items={freshlyCollected} />
            )}

            <RankBoard ranking={ranking} />
          </div>
        </div>
        <div className="result-actions">
          {items.map((item, index) => (
            <MenuButton
              key={item.label}
              selected={menu.index === index}
              onClick={item.run}
              onHover={() => menu.select(index)}
              primary={item.primary}
            >
              {item.label}
            </MenuButton>
          ))}
        </div>
      </div>
    </div>
  )
}

function NewCollection({ items }: { items: readonly string[] }) {
  const variants = items
    .map((id) => VARIANT_BY_ID.get(id))
    .filter((item) => item !== undefined)

  if (variants.length === 0) {
    return null
  }

  return (
    <div style={newCollectionStyle} data-new-collection>
      <p style={{ fontSize: 12, color: 'var(--ink-muted)', letterSpacing: '0.08em', margin: 0 }}>
        도감에 새로 추가
      </p>
      <div style={newItemsStyle}>
        {variants.slice(0, 4).map((item) => (
          <div key={item.id} style={newItemStyle} data-new-item={item.id}>
            <img
              src={item.sprite}
              alt={item.label}
              style={{ width: 48, height: 48, objectFit: 'contain' }}
            />
            <span style={{ fontSize: 12, fontWeight: 700, color: item.hidden ? 'var(--stamp)' : 'var(--ink)' }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: 'var(--ink-muted)', margin: '8px 0 0' }}>
        프로필에서 사진으로 쓸 수 있습니다
      </p>
    </div>
  )
}

const newCollectionStyle: CSSProperties = {
  marginTop: 18,
  padding: '12px 12px 10px',
  border: '1px solid var(--rule)',
  borderRadius: 2,
  background: 'var(--paper-shade)',
}

const newItemsStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(86px, 1fr))',
  gap: 8,
  marginTop: 10,
}

const newItemStyle: CSSProperties = {
  minWidth: 0,
  display: 'grid',
  justifyItems: 'center',
  gap: 4,
  padding: '8px 6px',
  border: '1px solid var(--rule)',
  borderRadius: 2,
  background: 'var(--paper-shade)',
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
          color: 'var(--ink-muted)',
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
              color: run.id === profile.id ? 'var(--stamp)' : 'var(--ink-muted)',
              fontWeight: run.id === profile.id ? 700 : 400,
            }}
          >
            <span style={{ width: 18, textAlign: 'right', color: 'var(--ink-muted)' }}>
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
      <span style={{ fontSize: small ? 11 : 12, color: 'var(--ink-muted)' }}>{label}</span>
      <span
        style={{
          fontSize: small ? 13 : 16,
          fontWeight: 600,
          color: small ? 'var(--ink-muted)' : 'var(--text-strong)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
    </div>
  )
}

export { ResultScreen }
