import { buttonStyle, ghostButtonStyle, panelStyle, rootStyle } from './lobbyStyle.ts'

/** 한 줄짜리 알림. 연결 중·실패처럼 화면을 통째로 덮는 상태에 쓴다 */
function Notice({
  title,
  detail,
  onBack,
  danger = false,
  retry,
}: {
  title: string
  detail: string
  onBack: () => void
  danger?: boolean
  /** 여기서 곧바로 다시 해볼 수 있는 경우. 나가는 것 말고 다른 길이 있을 때만 준다 */
  retry?: { label: string; run: () => void }
}) {
  return (
    <div style={rootStyle}>
      <div style={panelStyle}>
        <h2
          style={{
            font: '700 26px/1.3 var(--sans)',
            color: danger ? '#ff6b6b' : '#f2f4fb',
            margin: 0,
          }}
        >
          {title}
        </h2>
        <p style={{ color: '#b6bdd4', margin: 0, fontSize: 15, lineHeight: 1.7 }}>{detail}</p>
        {retry !== undefined && (
          <button type="button" style={buttonStyle} onClick={retry.run}>
            {retry.label}
          </button>
        )}
        <button type="button" style={ghostButtonStyle} onClick={onBack}>
          돌아가기
        </button>
      </div>
    </div>
  )
}

/**
 * 코드를 주고받아 모이는 길.
 *
 * **이름을 적어야 열린다.** 이 이름은 기기 이름과 다르다 — 기기 이름은 순위표에 올라
 * 모두가 보는 값이라 재료 낱말만 받지만, 여기는 아는 사람끼리 모이는 자리라 서로
 * 부르기로 한 이름을 그대로 쓰는 것이 맞다. 그래서 자유 입력이고, 그 방 안에서만 쓰인다.
 *
 * 한 번 적은 이름은 저장해 다음에 채워둔다. 같은 사람들과 다시 할 때마다 새로 짓게
 * 하면 그것이 문턱이 된다.
 */

export { Notice }
