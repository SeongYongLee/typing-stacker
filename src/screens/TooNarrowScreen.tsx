import { useEffect, useState, type CSSProperties } from 'react'
import { MIN_VIEWPORT_WIDTH } from '../game/config.ts'

/**
 * 화면이 좁을 때 판 대신 뜨는 안내.
 *
 * **판을 열지 않는 것이 요점이다.** 그리드는 676까지 버티지만 그 아래에서는 아레나가
 * 줄어들어 가장 작은 물건이 28px에서 16px이 된다 — 무엇이 떨어지는지 눈으로 못 읽는
 * 판을 열어주는 것은 친절이 아니다. 까닭과 숫자는 `MIN_VIEWPORT_WIDTH`에.
 *
 * **지금 폭을 함께 보여준다.** "더 넓게"만 적으면 얼마나 넓혀야 하는지 알 수 없어
 * 창을 몇 번이고 늘렸다 줄이게 된다. 숫자가 있으면 한 번에 끝난다.
 *
 * 키보드 이야기를 함께 적는 이유는, 좁은 화면이 대개 손에 든 기기이기 때문이다 —
 * 창을 늘려서 될 일이 아닌 경우가 많고 그때는 그 사실이 답이다.
 */
function TooNarrowScreen() {
  const width = useWidth()

  return (
    <div style={rootStyle}>
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <h1 style={titleStyle}>화면이 좁습니다</h1>
        <p style={bodyStyle}>
          한글 타자게임입니다. 좌우에서 내려오는 단어를 치면 그 물건이 가운데 받침대
          위로 떨어져 쌓입니다.
        </p>
        <p style={bodyStyle}>
          단어 두 줄과 받침대가 한눈에 들어와야 해서 <b style={strongStyle}>가로
          {' '}
          {MIN_VIEWPORT_WIDTH}px</b> 이상이 필요합니다.
        </p>
        <p style={dimStyle}>
          지금 {width}px · {MIN_VIEWPORT_WIDTH - width}px 더 필요합니다
        </p>
        <p style={dimStyle}>물리 키보드로만 할 수 있습니다.</p>
      </div>
    </div>
  )
}

/**
 * 창을 늘리는 동안 남은 픽셀이 따라 줄어야 한다.
 *
 * 여기서만 `resize`를 듣는다 — 판이 안 도는 화면이라 리렌더가 프레임을 갉아먹을 일이
 * 없고, 안내에서는 **숫자가 살아 움직이는 것 자체가 안내**다(늘리면 줄어드는 것이
 * 보이므로 얼마나 더 늘려야 하는지 손으로 안다).
 */
function useWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    const onResize = (): void => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return width
}

const rootStyle: CSSProperties = {
  height: '100%',
  display: 'grid',
  placeItems: 'center',
  padding: 24,
}

const titleStyle: CSSProperties = {
  font: '700 26px/1.3 var(--sans)',
  color: 'var(--text-strong)',
  margin: '0 0 20px',
}

const bodyStyle: CSSProperties = {
  font: '15px/1.7 var(--sans)',
  color: 'var(--text)',
  margin: '0 0 14px',
}

const strongStyle: CSSProperties = {
  color: 'var(--accent)',
  whiteSpace: 'nowrap',
}

const dimStyle: CSSProperties = {
  font: '13px/1.6 var(--sans)',
  color: 'var(--text-dim)',
  margin: '0 0 6px',
}

export { TooNarrowScreen }
