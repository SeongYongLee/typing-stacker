import { useMenuKeys } from '../../hooks/useMenuKeys.ts'
import type { QueueStatus } from '../../rank/queue.ts'
import { ghostButtonStyle, panelStyle, rootStyle } from './lobbyStyle.ts'

/**
 * 랭크 게임 줄에 서서 상대를 기다리는 동안.
 *
 * 숫자를 보여주는 것이 이 화면의 일이다 — 돌아가는 표시만 두면 기다리는 사람은
 * 고장난 것과 구분할 수 없다.
 */
/**
 * 줄에 서서 상대를 기다리는 동안.
 *
 * **숫자를 보여주는 것이 이 화면의 일이다.** 돌아가는 표시만 두면 기다리는 사람은
 * 고장난 것과 구분할 수 없고, 언제까지 기다려야 하는지도 모른다. 몇 명이 줄에 서
 * 있는지, 얼마나 기다렸는지, 지금 어디까지 찾고 있는지를 함께 알린다 — 특히 마지막
 * 것은 "기다리면 넓어진다"는 규칙이 실제로 움직이고 있다는 증거다.
 */
function Searching({
  status,
  onCancel,
}: {
  status: QueueStatus | null
  onCancel: () => void
}) {
  useMenuKeys({ count: 1, useTab: false, onActivate: onCancel, onCancel })

  const waiting = status?.kind === 'waiting' ? status : null
  const unreachable = status?.kind === 'unreachable'
  /*
   * 서버가 살아 있는데 이 기능만 없는 경우. "닿지 못했다"와 갈라야 한다 —
   * 사람이 할 수 있는 일이 정반대다(기다리기 vs 배포하기).
   */
  const unsupported = status?.kind === 'unsupported'

  return (
    <div style={rootStyle}>
      <div style={panelStyle} data-searching={waiting?.waitedSec ?? 0}>
        <h2 style={{ font: '700 26px/1.3 var(--sans)', color: '#f2f4fb', margin: 0 }}>
          {unsupported ? '랭크 게임을 쓸 수 없습니다' : '상대를 찾는 중…'}
        </h2>

        {unsupported ? (
          <p
            style={{ color: '#ffcf5c', margin: 0, fontSize: 15, lineHeight: 1.7 }}
            data-queue-unsupported
          >
            서버가 아직 랭크 게임을 모릅니다. 친선전으로 방을 만들어 주세요.
          </p>
        ) : unreachable ? (
          <p style={{ color: '#ffcf5c', margin: 0, fontSize: 15, lineHeight: 1.7 }}>
            서버에 닿지 못했습니다. 잠시 뒤 다시 시도합니다.
          </p>
        ) : (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
              }}
            >
              <Figure label="대기 인원" value={`${waiting?.waiting ?? 1}명`} />
              <Figure label="기다린 시간" value={`${waiting?.waitedSec ?? 0}초`} />
            </div>
            <p style={{ color: '#b6bdd4', margin: 0, fontSize: 14, lineHeight: 1.7 }}>
              {bandText(waiting?.band ?? 0)}
            </p>
          </>
        )}

        <button type="button" style={ghostButtonStyle} onClick={onCancel}>
          취소 (Esc)
        </button>
      </div>
    </div>
  )
}

/** 지금 어디까지 찾고 있는지를 사람의 말로 바꾼다 */

/** 지금 어디까지 찾고 있는지를 사람의 말로 바꾼다 */
function bandText(band: number): string {
  if (band <= 0) {
    return '같은 티어에서 찾고 있습니다. 오래 걸리면 범위를 넓힙니다.'
  }
  if (band === 1) {
    return '범위를 넓혀 옆 티어까지 찾고 있습니다.'
  }
  return '티어를 가리지 않고 찾고 있습니다.'
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: '#0d0f16',
        border: '1px solid #2e3448',
        borderRadius: 10,
        padding: '12px 14px',
        display: 'grid',
        gap: 4,
      }}
    >
      <span style={{ color: '#6a7290', fontSize: 12, letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ font: '700 20px/1.2 var(--sans)', color: '#f2f4fb' }}>{value}</span>
    </div>
  )
}

export { Searching }
